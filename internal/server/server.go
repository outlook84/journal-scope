package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	journalscope "journal-scope"
	"journal-scope/internal/config"
	"journal-scope/internal/journalproxy"
	"journal-scope/internal/runtimeconfig"
	"journal-scope/internal/security"
)

type Server struct {
	cfg            config.Config
	journal        *journalproxy.Client
	sessionManager *security.SessionManager
	runtimeConfig  *runtimeconfig.Store
	loginLimiter   *loginRateLimiter
	bootSummaryCache *bootSummaryCache
	staticFS       fs.FS
	staticServer   http.Handler
	staticFound    bool
}

const mutationIntentHeader = "X-Journal-Scope-Intent"

const (
	loginAttemptWindow  = 5 * time.Minute
	loginAttemptLimit   = 8
	loginBlockDuration  = 5 * time.Minute
	loginTrackerMaxIdle = 30 * time.Minute
	mutationIntentValue = "mutate"
)

type loginRateLimiter struct {
	mu      sync.Mutex
	entries map[string]loginAttemptState
}

type loginAttemptState struct {
	Failures     int
	WindowStart  time.Time
	BlockedUntil time.Time
	LastSeen     time.Time
}

type resolvedGatewayTarget struct {
	BaseURL       *url.URL
	Headers       []journalproxy.Header
	TLSServerName string
}

func New(cfg config.Config, runtimeConfig *runtimeconfig.Store, journal *journalproxy.Client, sessionManager *security.SessionManager) (http.Handler, error) {
	s := &Server{
		cfg:            cfg,
		journal:        journal,
		sessionManager: sessionManager,
		runtimeConfig:  runtimeConfig,
		loginLimiter:   newLoginRateLimiter(),
		bootSummaryCache: newBootSummaryCache(bootSummaryCacheTTL),
	}

	if strings.TrimSpace(cfg.StaticDir) != "" {
		if info, err := os.Stat(cfg.StaticDir); err == nil && info.IsDir() {
			s.staticFS = os.DirFS(cfg.StaticDir)
			s.staticFound = true
		}
	} else if embeddedFS, err := journalscope.EmbeddedDist(); err == nil {
		s.staticFS = embeddedFS
		s.staticFound = true
	}

	if s.staticFound {
		s.staticServer = http.FileServer(http.FS(s.staticFS))
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.handleHealthz)
	mux.HandleFunc("/api/auth/login", s.handleLogin)
	mux.HandleFunc("/api/auth/logout", s.handleLogout)
	mux.HandleFunc("/api/session", s.handleSession)
	mux.HandleFunc("/api/gateway-targets", s.withSession(security.RoleViewer, s.handleGatewayTargets))
	mux.HandleFunc("/api/gateway-targets/active", s.withSession(security.RoleViewer, s.handleActiveGatewayTarget))
	mux.HandleFunc("/api/admin/config", s.withSession(security.RoleAdmin, s.handleAdminConfig))
	mux.HandleFunc("/api/admin/test-gateway", s.withSession(security.RoleAdmin, s.handleTestGateway))
	mux.HandleFunc("/api/logs", s.withSession(security.RoleViewer, s.handleLogs))
	mux.HandleFunc("/api/logs/tail", s.withSession(security.RoleViewer, s.handleTailLogs))
	mux.HandleFunc("/api/fields/units", s.withSession(security.RoleViewer, s.handleFieldValues("_SYSTEMD_UNIT")))
	mux.HandleFunc("/api/fields/syslog-identifiers", s.withSession(security.RoleViewer, s.handleFieldValues("SYSLOG_IDENTIFIER")))
	mux.HandleFunc("/api/fields/hostnames", s.withSession(security.RoleViewer, s.handleFieldValues("_HOSTNAME")))
	mux.HandleFunc("/api/fields/boot-ids", s.withSession(security.RoleViewer, s.handleFieldValues("_BOOT_ID")))
	mux.HandleFunc("/api/fields/boot-ids/meta", s.withSession(security.RoleViewer, s.handleBootSummaries))
	mux.HandleFunc("/api/fields/comms", s.withSession(security.RoleViewer, s.handleFieldValues("_COMM")))
	mux.HandleFunc("/api/fields/transports", s.withSession(security.RoleViewer, s.handleFieldValues("_TRANSPORT")))
	mux.HandleFunc("/", s.handleApp)

	return mux, nil
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte("ok"))
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !hasMutationIntent(r) {
		s.logWarnf(r, "/api/auth/login", "login rejected: missing mutation intent header")
		writeJSONError(w, http.StatusForbidden, "missing mutation intent header")
		return
	}
	if allowed, retryAfter := s.loginLimiter.Allow(r, time.Now().UTC(), s.cfg.TrustProxyHeaders); !allowed {
		s.logWarnf(r, "/api/auth/login", "login rate-limited retry_after=%s", retryAfter.Round(time.Second))
		if retryAfter > 0 {
			w.Header().Set("Retry-After", fmt.Sprintf("%.0f", retryAfter.Seconds()))
		}
		writeJSONError(w, http.StatusTooManyRequests, "too many login attempts; try again later")
		return
	}

	var body struct {
		AccessCode string `json:"accessCode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		s.loginLimiter.RegisterFailure(r, time.Now().UTC(), s.cfg.TrustProxyHeaders)
		s.logWarnf(r, "/api/auth/login", "login rejected: invalid payload err=%v", err)
		writeJSONError(w, http.StatusBadRequest, "invalid login payload")
		return
	}

	role, ok := s.runtimeConfig.VerifyAccessCode(body.AccessCode)
	if !ok {
		s.loginLimiter.RegisterFailure(r, time.Now().UTC(), s.cfg.TrustProxyHeaders)
		s.logWarnf(r, "/api/auth/login", "login rejected: invalid access code")
		writeJSONError(w, http.StatusUnauthorized, "invalid access code")
		return
	}
	s.loginLimiter.Reset(r, s.cfg.TrustProxyHeaders)
	if err := s.sessionManager.SetSession(w, role); err != nil {
		s.logErrorf(r, "/api/auth/login", "login failed to create session role=%s err=%v", role, err)
		writeJSONError(w, http.StatusInternalServerError, "failed to create session")
		return
	}
	s.sessionManager.SetActiveGatewayTarget(w, s.runtimeConfig.DefaultGatewayTargetID())
	s.logInfof(r, "/api/auth/login", "login succeeded role=%s target=%s", role, s.runtimeConfig.DefaultGatewayTargetID())

	writeJSON(w, http.StatusOK, map[string]string{
		"role":            string(role),
		"gatewayTargetId": s.runtimeConfig.DefaultGatewayTargetID(),
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !hasMutationIntent(r) {
		s.logWarnf(r, "/api/auth/logout", "logout rejected: missing mutation intent header")
		writeJSONError(w, http.StatusForbidden, "missing mutation intent header")
		return
	}
	role := "unknown"
	if claims, err := s.sessionManager.ReadSession(r); err == nil {
		role = string(claims.Role)
	}
	s.sessionManager.ClearSession(w)
	s.sessionManager.ClearActiveGatewayTarget(w)
	s.logInfof(r, "/api/auth/logout", "logout succeeded role=%s", role)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	claims, err := s.sessionManager.ReadSession(r)
	if err != nil {
		s.logWarnf(r, "/api/session", "session lookup failed err=%v", err)
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	activeTargetID := s.activeGatewayTargetID(r)
	writeJSON(w, http.StatusOK, map[string]string{
		"role":            string(claims.Role),
		"gatewayTargetId": activeTargetID,
	})
}

func (s *Server) handleAdminConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, s.runtimeConfig.PublicAdminConfig())
	case http.MethodPut:
		if !hasMutationIntent(r) {
			s.logWarnf(r, "/api/admin/config", "admin config rejected: missing mutation intent header")
			writeJSONError(w, http.StatusForbidden, "missing mutation intent header")
			return
		}
		var body runtimeconfig.UpdateAdminConfig
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			s.logWarnf(r, "/api/admin/config", "admin config rejected: invalid payload err=%v", err)
			writeJSONError(w, http.StatusBadRequest, "invalid admin config payload")
			return
		}
		if err := s.runtimeConfig.UpdateAdminConfig(body); err != nil {
			s.logWarnf(r, "/api/admin/config", "admin config update failed err=%v", err)
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		s.logInfof(r, "/api/admin/config", "admin config updated default_target=%s target_count=%d", s.runtimeConfig.DefaultGatewayTargetID(), len(s.runtimeConfig.GatewayTargetsView().GatewayTargets))
		writeJSON(w, http.StatusOK, s.runtimeConfig.PublicAdminConfig())
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleGatewayTargets(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	view := s.runtimeConfig.GatewayTargetsView()
	view.ActiveGatewayTargetID = s.activeGatewayTargetID(r)
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) handleActiveGatewayTarget(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !hasMutationIntent(r) {
		s.logWarnf(r, "/api/gateway-targets/active", "active target switch rejected: missing mutation intent header")
		writeJSONError(w, http.StatusForbidden, "missing mutation intent header")
		return
	}

	var body struct {
		TargetID string `json:"targetId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		s.logWarnf(r, "/api/gateway-targets/active", "active target switch rejected: invalid payload err=%v", err)
		writeJSONError(w, http.StatusBadRequest, "invalid active gateway payload")
		return
	}
	targetID := strings.TrimSpace(body.TargetID)
	if targetID == "" {
		s.logWarnf(r, "/api/gateway-targets/active", "active target switch rejected: empty target")
		writeJSONError(w, http.StatusBadRequest, "targetId is required")
		return
	}
	if _, ok := s.runtimeConfig.ResolveGatewayTargetURL(targetID); !ok {
		s.logWarnf(r, "/api/gateway-targets/active", "active target switch rejected: unknown target target=%s", targetID)
		writeJSONError(w, http.StatusBadRequest, "unknown gateway target")
		return
	}
	if _, err := s.sessionManager.ReadSession(r); err != nil {
		s.logWarnf(r, "/api/gateway-targets/active", "active target switch rejected: unauthenticated err=%v", err)
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	s.sessionManager.SetActiveGatewayTarget(w, targetID)
	s.logInfof(r, "/api/gateway-targets/active", "active target switched target=%s", targetID)
	view := s.runtimeConfig.GatewayTargetsView()
	view.ActiveGatewayTargetID = targetID
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) handleTestGateway(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !hasMutationIntent(r) {
		s.logWarnf(r, "/api/admin/test-gateway", "gateway test rejected: missing mutation intent header")
		writeJSONError(w, http.StatusForbidden, "missing mutation intent header")
		return
	}

	var body struct {
		URL           string                        `json:"url"`
		TLSServerName string                        `json:"tlsServerName"`
		Headers       []runtimeconfig.GatewayHeader `json:"headers"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		s.logWarnf(r, "/api/admin/test-gateway", "gateway test rejected: invalid payload err=%v", err)
		writeJSONError(w, http.StatusBadRequest, "invalid gateway test payload")
		return
	}
	targetURL, err := url.Parse(strings.TrimSpace(body.URL))
	if err != nil || targetURL.Scheme == "" || targetURL.Host == "" {
		s.logWarnf(r, "/api/admin/test-gateway", "gateway test rejected: invalid url url=%q", strings.TrimSpace(body.URL))
		writeJSONError(w, http.StatusBadRequest, "url must be a full URL")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	headers := make([]journalproxy.Header, 0, len(body.Headers))
	for _, header := range body.Headers {
		headers = append(headers, journalproxy.Header{Name: header.Name, Value: header.Value})
	}

	resp, err := s.journal.FetchLogs(ctx, journalproxy.RequestTarget{
		BaseURL:       targetURL,
		Headers:       headers,
		TLSServerName: strings.TrimSpace(body.TLSServerName),
	}, journalproxy.LogQuery{Limit: 1})
	if err != nil {
		s.logWarnf(r, "/api/admin/test-gateway", "gateway test failed target=%s err=%v", redactURLForLog(targetURL), err)
		writeJSONError(w, http.StatusBadGateway, fmt.Sprintf("connection failed: %v", err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		s.logWarnf(r, "/api/admin/test-gateway", "gateway test failed target=%s status=%d", redactURLForLog(targetURL), resp.StatusCode)
		writeJSONError(w, http.StatusBadGateway, fmt.Sprintf("gateway returned HTTP %d", resp.StatusCode))
		return
	}
	s.logInfof(r, "/api/admin/test-gateway", "gateway test succeeded target=%s status=%d", redactURLForLog(targetURL), resp.StatusCode)

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":     true,
		"status": resp.StatusCode,
	})
}

func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	query, err := journalproxy.ParseLogQuery(r.URL.Query())
	if err != nil {
		s.logWarnf(r, "/api/logs", "log fetch rejected: invalid query err=%v", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	target, err := s.gatewayTargetForRequest(r)
	if err != nil {
		s.logErrorf(r, "/api/logs", "log fetch failed: invalid runtime gateway err=%v", err)
		http.Error(w, "invalid runtime gateway url", http.StatusInternalServerError)
		return
	}

	resp, err := s.journal.FetchLogs(r.Context(), journalproxy.RequestTarget{
		BaseURL:       target.BaseURL,
		Headers:       target.Headers,
		TLSServerName: target.TLSServerName,
	}, query)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			s.logInfof(r, "/api/logs", "log fetch canceled target=%s", redactURLForLog(target.BaseURL))
			return
		}
		s.logWarnf(r, "/api/logs", "log fetch failed target=%s err=%v", redactURLForLog(target.BaseURL), err)
		http.Error(w, fmt.Sprintf("fetch logs: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	copyProxyResponse(w, resp)
}

func (s *Server) handleTailLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	query, err := journalproxy.ParseLogQuery(r.URL.Query())
	if err != nil {
		s.logWarnf(r, "/api/logs/tail", "tail fetch rejected: invalid query err=%v", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	target, err := s.gatewayTargetForRequest(r)
	if err != nil {
		s.logErrorf(r, "/api/logs/tail", "tail fetch failed: invalid runtime gateway err=%v", err)
		http.Error(w, "invalid runtime gateway url", http.StatusInternalServerError)
		return
	}

	resp, err := s.journal.TailLogs(r.Context(), journalproxy.RequestTarget{
		BaseURL:       target.BaseURL,
		Headers:       target.Headers,
		TLSServerName: target.TLSServerName,
	}, query, r.URL.Query().Get("cursor"))
	if err != nil {
		s.logWarnf(r, "/api/logs/tail", "tail fetch failed target=%s err=%v", redactURLForLog(target.BaseURL), err)
		http.Error(w, fmt.Sprintf("tail logs: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	copyProxyResponse(w, resp)
}

func (s *Server) handleFieldValues(fieldName string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		target, err := s.gatewayTargetForRequest(r)
		if err != nil {
			s.logErrorf(r, routeLabelForField(fieldName), "field values fetch failed: invalid runtime gateway field=%s err=%v", fieldName, err)
			http.Error(w, "invalid runtime gateway url", http.StatusInternalServerError)
			return
		}

		resp, err := s.journal.FetchFieldValues(r.Context(), journalproxy.RequestTarget{
			BaseURL:       target.BaseURL,
			Headers:       target.Headers,
			TLSServerName: target.TLSServerName,
		}, fieldName)
		if err != nil {
			s.logWarnf(r, routeLabelForField(fieldName), "field values fetch failed target=%s field=%s err=%v", redactURLForLog(target.BaseURL), fieldName, err)
			http.Error(w, fmt.Sprintf("fetch field values: %v", err), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		copyProxyResponse(w, resp)
	}
}

func (s *Server) gatewayTargetForRequest(r *http.Request) (resolvedGatewayTarget, error) {
	if targetID := s.activeGatewayTargetID(r); targetID != "" {
		if target, ok := s.runtimeConfig.ResolveGatewayTarget(targetID); ok {
			return toResolvedGatewayTarget(target)
		}
	}
	if target, ok := s.runtimeConfig.ResolveGatewayTarget(s.runtimeConfig.DefaultGatewayTargetID()); ok {
		return toResolvedGatewayTarget(target)
	}
	return resolvedGatewayTarget{}, fmt.Errorf("default gateway target is missing")
}

func (s *Server) activeGatewayTargetID(r *http.Request) string {
	targetID, err := s.sessionManager.ReadActiveGatewayTarget(r)
	if err == nil && targetID != "" {
		if _, ok := s.runtimeConfig.ResolveGatewayTargetURL(targetID); ok {
			return targetID
		}
	}
	return s.runtimeConfig.DefaultGatewayTargetID()
}

func toResolvedGatewayTarget(target runtimeconfig.GatewayTarget) (resolvedGatewayTarget, error) {
	parsed, err := url.Parse(target.URL)
	if err != nil {
		return resolvedGatewayTarget{}, err
	}
	headers := make([]journalproxy.Header, 0, len(target.Headers))
	for _, header := range target.Headers {
		headers = append(headers, journalproxy.Header{Name: header.Name, Value: header.Value})
	}
	return resolvedGatewayTarget{
		BaseURL:       parsed,
		Headers:       headers,
		TLSServerName: strings.TrimSpace(target.TLSServerName),
	}, nil
}

func (s *Server) handleApp(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !s.staticFound {
		http.Error(w, "frontend assets not found; build the web app first", http.StatusServiceUnavailable)
		return
	}

	requestPath := path.Clean(strings.TrimPrefix(r.URL.Path, "/"))
	if requestPath == "." {
		requestPath = ""
	}
	if requestPath != "" {
		if _, err := fs.Stat(s.staticFS, requestPath); err == nil {
			s.staticServer.ServeHTTP(w, r)
			return
		}
	}

	serveStaticFile(w, s.staticFS, "index.html")
}

func (s *Server) withSession(minRole security.Role, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, err := s.sessionManager.ReadSession(r)
		if err != nil {
			writeJSONError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		if !roleAllows(claims.Role, minRole) {
			writeJSONError(w, http.StatusForbidden, "insufficient permissions")
			return
		}
		next(w, r)
	}
}

func roleAllows(actual, required security.Role) bool {
	if actual == security.RoleAdmin {
		return true
	}
	return actual == required
}

func copyProxyResponse(w http.ResponseWriter, resp *http.Response) {
	copyResponseHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)

	if flusher, ok := w.(http.Flusher); ok {
		buffer := make([]byte, 32*1024)
		for {
			n, readErr := resp.Body.Read(buffer)
			if n > 0 {
				_, _ = w.Write(buffer[:n])
				flusher.Flush()
			}
			if readErr != nil {
				if readErr == io.EOF {
					return
				}
				return
			}
		}
	}

	_, _ = io.Copy(w, resp.Body)
}

func copyResponseHeaders(dst http.Header, src http.Header) {
	for key, values := range src {
		if strings.EqualFold(key, "Access-Control-Allow-Origin") {
			continue
		}
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{
		"error": message,
	})
}

func hasMutationIntent(r *http.Request) bool {
	return strings.TrimSpace(r.Header.Get(mutationIntentHeader)) == mutationIntentValue
}

func newLoginRateLimiter() *loginRateLimiter {
	return &loginRateLimiter{
		entries: make(map[string]loginAttemptState),
	}
}

func (l *loginRateLimiter) Allow(r *http.Request, now time.Time, trustProxyHeaders bool) (bool, time.Duration) {
	key := loginLimiterKey(r, trustProxyHeaders)

	l.mu.Lock()
	defer l.mu.Unlock()

	l.pruneStale(now)

	state := l.entries[key]
	if !state.BlockedUntil.IsZero() && now.Before(state.BlockedUntil) {
		return false, state.BlockedUntil.Sub(now).Round(time.Second)
	}
	if !state.BlockedUntil.IsZero() && !now.Before(state.BlockedUntil) {
		delete(l.entries, key)
	}
	return true, 0
}

func (l *loginRateLimiter) RegisterFailure(r *http.Request, now time.Time, trustProxyHeaders bool) {
	key := loginLimiterKey(r, trustProxyHeaders)

	l.mu.Lock()
	defer l.mu.Unlock()

	l.pruneStale(now)

	state := l.entries[key]
	if state.WindowStart.IsZero() || now.Sub(state.WindowStart) > loginAttemptWindow {
		state.WindowStart = now
		state.Failures = 0
		state.BlockedUntil = time.Time{}
	}
	state.Failures++
	state.LastSeen = now
	if state.Failures >= loginAttemptLimit {
		state.BlockedUntil = now.Add(loginBlockDuration)
	}
	l.entries[key] = state
}

func (l *loginRateLimiter) Reset(r *http.Request, trustProxyHeaders bool) {
	key := loginLimiterKey(r, trustProxyHeaders)

	l.mu.Lock()
	defer l.mu.Unlock()

	delete(l.entries, key)
}

func (l *loginRateLimiter) pruneStale(now time.Time) {
	for key, state := range l.entries {
		if state.LastSeen.IsZero() {
			delete(l.entries, key)
			continue
		}
		if now.Sub(state.LastSeen) > loginTrackerMaxIdle && (state.BlockedUntil.IsZero() || now.After(state.BlockedUntil)) {
			delete(l.entries, key)
		}
	}
}

func loginLimiterKey(r *http.Request, trustProxyHeaders bool) string {
	if trustProxyHeaders {
		if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwarded != "" {
			if addr, ok := firstForwardedIP(forwarded); ok {
				return addr
			}
		}
	}
	hostPort := strings.TrimSpace(r.RemoteAddr)
	if addr, err := netip.ParseAddrPort(hostPort); err == nil {
		return addr.Addr().String()
	}
	if addr, err := netip.ParseAddr(hostPort); err == nil {
		return addr.String()
	}
	return hostPort
}

func firstForwardedIP(value string) (string, bool) {
	for _, part := range strings.Split(value, ",") {
		candidate := strings.TrimSpace(part)
		if candidate == "" {
			continue
		}
		if addr, err := netip.ParseAddr(candidate); err == nil {
			return addr.String(), true
		}
	}
	return "", false
}

func clientLogAddr(r *http.Request, trustProxyHeaders bool) string {
	return loginLimiterKey(r, trustProxyHeaders)
}

func redactURLForLog(target *url.URL) string {
	if target == nil {
		return ""
	}
	return fmt.Sprintf("%s://%s", target.Scheme, target.Host)
}

func (s *Server) logInfof(r *http.Request, route string, format string, args ...any) {
	s.logf("info", r, route, format, args...)
}

func (s *Server) logWarnf(r *http.Request, route string, format string, args ...any) {
	s.logf("warn", r, route, format, args...)
}

func (s *Server) logErrorf(r *http.Request, route string, format string, args ...any) {
	s.logf("error", r, route, format, args...)
}

func (s *Server) logf(level string, r *http.Request, route string, format string, args ...any) {
	message := fmt.Sprintf(format, args...)
	log.Printf("%s: %s route=%s client=%s", level, message, route, clientLogAddr(r, s.cfg.TrustProxyHeaders))
}

func routeLabelForField(fieldName string) string {
	switch fieldName {
	case "_SYSTEMD_UNIT":
		return "/api/fields/units"
	case "SYSLOG_IDENTIFIER":
		return "/api/fields/syslog-identifiers"
	case "_HOSTNAME":
		return "/api/fields/hostnames"
	case "_BOOT_ID":
		return "/api/fields/boot-ids"
	case "_COMM":
		return "/api/fields/comms"
	case "_TRANSPORT":
		return "/api/fields/transports"
	default:
		return "/api/fields"
	}
}

func serveStaticFile(w http.ResponseWriter, filesystem fs.FS, name string) {
	content, err := fs.ReadFile(filesystem, name)
	if err != nil {
		http.Error(w, "static asset not found", http.StatusNotFound)
		return
	}
	if contentType := mime.TypeByExtension(filepath.Ext(name)); contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	_, _ = w.Write(content)
}
