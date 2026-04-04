package runtimeconfig

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"journal-scope/internal/config"
	"journal-scope/internal/journalproxy"
	"journal-scope/internal/security"
)

const stateFileName = "config.json"

type State struct {
	GatewayTargets         []GatewayTarget `json:"gateway_targets"`
	DefaultGatewayTargetID string          `json:"default_gateway_target_id"`
	MasterSecret           string          `json:"master_secret"`
	AdminCodeHash          string          `json:"admin_code_hash"`
	ViewerCodeHash         string          `json:"viewer_code_hash"`
	CreatedAt              time.Time       `json:"created_at"`
	UpdatedAt              time.Time       `json:"updated_at"`
}

type BootstrapResult struct {
	Created              bool
	GeneratedAdminCode   string
	GeneratedViewerCode  string
	RegeneratedAdminCode string
}

type AdminConfig struct {
	GatewayTargets         []GatewayTarget `json:"gatewayTargets"`
	DefaultGatewayTargetID string          `json:"defaultGatewayTargetId"`
}

type UpdateAdminConfig struct {
	GatewayTargets         []GatewayTarget `json:"gatewayTargets"`
	DefaultGatewayTargetID string          `json:"defaultGatewayTargetId"`
	AdminAccessCode        string          `json:"adminAccessCode"`
	ViewerAccessCode       string          `json:"viewerAccessCode"`
}

type GatewayTarget struct {
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	URL           string          `json:"url"`
	TLSServerName string          `json:"tlsServerName,omitempty"`
	Headers       []GatewayHeader `json:"headers,omitempty"`
}

type GatewayHeader struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type GatewayTargetsView struct {
	GatewayTargets        []GatewayTarget `json:"gatewayTargets"`
	ActiveGatewayTargetID string          `json:"activeGatewayTargetId"`
}

type Store struct {
	path                  string
	mu                    sync.RWMutex
	state                 State
	effectiveMasterSecret string
}

func LoadOrCreate(cfg config.Config) (*Store, *BootstrapResult, error) {
	if err := os.MkdirAll(cfg.DataDir, 0o700); err != nil {
		return nil, nil, fmt.Errorf("create data dir: %w", err)
	}

	store := &Store{
		path: filepath.Join(cfg.DataDir, stateFileName),
	}

	if _, err := os.Stat(store.path); os.IsNotExist(err) {
		state, bootstrap, err := buildInitialState(cfg)
		if err != nil {
			return nil, nil, err
		}
		store.state = state
		store.effectiveMasterSecret = effectiveMasterSecret(cfg, state)
		if err := store.persistLocked(); err != nil {
			return nil, nil, err
		}
		return store, bootstrap, nil
	} else if err != nil {
		return nil, nil, fmt.Errorf("stat runtime config: %w", err)
	}

	raw, err := os.ReadFile(store.path)
	if err != nil {
		return nil, nil, fmt.Errorf("read runtime config: %w", err)
	}
	if err := json.Unmarshal(raw, &store.state); err != nil {
		return nil, nil, fmt.Errorf("decode runtime config: %w", err)
	}
	if strings.TrimSpace(store.state.MasterSecret) == "" {
		store.state.MasterSecret, err = security.GenerateSecret(32)
		if err != nil {
			return nil, nil, fmt.Errorf("generate runtime master secret: %w", err)
		}
		if err := store.persistLocked(); err != nil {
			return nil, nil, err
		}
	}
	bootstrap := &BootstrapResult{}
	if strings.TrimSpace(store.state.AdminCodeHash) == "" {
		adminCode, err := security.GenerateAccessCode("admin")
		if err != nil {
			return nil, nil, fmt.Errorf("generate replacement admin access code: %w", err)
		}
		adminHash, err := security.HashAccessCode(adminCode)
		if err != nil {
			return nil, nil, fmt.Errorf("hash replacement admin access code: %w", err)
		}
		store.state.AdminCodeHash = adminHash
		store.state.UpdatedAt = time.Now().UTC()
		bootstrap.RegeneratedAdminCode = adminCode
		if err := store.persistLocked(); err != nil {
			return nil, nil, err
		}
	}
	store.effectiveMasterSecret = effectiveMasterSecret(cfg, store.state)

	if err := store.validateLocked(); err != nil {
		return nil, nil, err
	}
	return store, bootstrap, nil
}

func (s *Store) PublicAdminConfig() AdminConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return AdminConfig{
		GatewayTargets:         cloneTargets(s.state.GatewayTargets),
		DefaultGatewayTargetID: s.state.DefaultGatewayTargetID,
	}
}

func (s *Store) GatewayTargetsView() GatewayTargetsView {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return GatewayTargetsView{
		GatewayTargets:        cloneTargets(s.state.GatewayTargets),
		ActiveGatewayTargetID: s.state.DefaultGatewayTargetID,
	}
}

func (s *Store) DefaultGatewayTargetID() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.state.DefaultGatewayTargetID
}

func (s *Store) SessionSecret() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	secret, err := security.DeriveString(s.effectiveMasterSecret, "session-signing", 32)
	if err != nil {
		return ""
	}
	return secret
}

func (s *Store) MasterSecret() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.effectiveMasterSecret
}

func (s *Store) VerifyAccessCode(code string) (security.Role, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if security.VerifyAccessCode(s.state.AdminCodeHash, code) {
		return security.RoleAdmin, true
	}
	if security.VerifyAccessCode(s.state.ViewerCodeHash, code) {
		return security.RoleViewer, true
	}
	return "", false
}

func (s *Store) ResolveGatewayTarget(targetID string) (GatewayTarget, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, target := range s.state.GatewayTargets {
		if target.ID == targetID {
			return cloneTarget(target), true
		}
	}
	return GatewayTarget{}, false
}

func (s *Store) UpdateAdminConfig(input UpdateAdminConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if input.GatewayTargets != nil {
		normalized, err := normalizeTargets(input.GatewayTargets)
		if err != nil {
			return err
		}
		s.state.GatewayTargets = normalized
		if input.DefaultGatewayTargetID != "" {
			s.state.DefaultGatewayTargetID = input.DefaultGatewayTargetID
		}
		if s.state.DefaultGatewayTargetID == "" || !hasTargetID(s.state.GatewayTargets, s.state.DefaultGatewayTargetID) {
			s.state.DefaultGatewayTargetID = s.state.GatewayTargets[0].ID
		}
	}
	if strings.TrimSpace(input.AdminAccessCode) != "" {
		hash, err := security.HashAccessCode(input.AdminAccessCode)
		if err != nil {
			return fmt.Errorf("hash admin access code: %w", err)
		}
		s.state.AdminCodeHash = hash
	}
	if strings.TrimSpace(input.ViewerAccessCode) != "" {
		hash, err := security.HashAccessCode(input.ViewerAccessCode)
		if err != nil {
			return fmt.Errorf("hash viewer access code: %w", err)
		}
		s.state.ViewerCodeHash = hash
	}

	s.state.UpdatedAt = time.Now().UTC()
	if err := s.validateLocked(); err != nil {
		return err
	}
	return s.persistLocked()
}

func (s *Store) ResolveGatewayTargetURL(targetID string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, target := range s.state.GatewayTargets {
		if target.ID == targetID {
			return target.URL, true
		}
	}
	return "", false
}

func buildInitialState(cfg config.Config) (State, *BootstrapResult, error) {
	now := time.Now().UTC()
	masterSecret, err := security.GenerateSecret(32)
	if err != nil {
		return State{}, nil, fmt.Errorf("generate master secret: %w", err)
	}

	bootstrap := &BootstrapResult{Created: true}
	adminCode := strings.TrimSpace(cfg.BootstrapAdminCode)
	if adminCode == "" {
		adminCode, err = security.GenerateAccessCode("admin")
		if err != nil {
			return State{}, nil, fmt.Errorf("generate admin access code: %w", err)
		}
		bootstrap.GeneratedAdminCode = adminCode
	}
	viewerCode := strings.TrimSpace(cfg.BootstrapViewerCode)
	if viewerCode == "" {
		viewerCode, err = security.GenerateAccessCode("viewer")
		if err != nil {
			return State{}, nil, fmt.Errorf("generate viewer access code: %w", err)
		}
		bootstrap.GeneratedViewerCode = viewerCode
	}

	adminHash, err := security.HashAccessCode(adminCode)
	if err != nil {
		return State{}, nil, fmt.Errorf("hash admin access code: %w", err)
	}
	viewerHash, err := security.HashAccessCode(viewerCode)
	if err != nil {
		return State{}, nil, fmt.Errorf("hash viewer access code: %w", err)
	}

	state := State{
		GatewayTargets:         []GatewayTarget{{ID: "default", Name: "Default", URL: cfg.BootstrapGatewayURL.String()}},
		DefaultGatewayTargetID: "default",
		MasterSecret:           masterSecret,
		AdminCodeHash:          adminHash,
		ViewerCodeHash:         viewerHash,
		CreatedAt:              now,
		UpdatedAt:              now,
	}
	return state, bootstrap, nil
}

func (s *Store) validateLocked() error {
	if len(s.state.GatewayTargets) == 0 {
		return fmt.Errorf("runtime config missing gateway targets")
	}
	for _, target := range s.state.GatewayTargets {
		if strings.TrimSpace(target.ID) == "" {
			return fmt.Errorf("runtime config gateway target missing id")
		}
		if strings.TrimSpace(target.Name) == "" {
			return fmt.Errorf("runtime config gateway target missing name")
		}
		if strings.TrimSpace(target.URL) == "" {
			return fmt.Errorf("runtime config gateway target missing url")
		}
		parsed, err := url.Parse(target.URL)
		if err != nil {
			return fmt.Errorf("runtime config gateway target url must be a full URL")
		}
		if err := journalproxy.ValidateBaseURL(parsed); err != nil {
			return fmt.Errorf("runtime config gateway target url is invalid: %w", err)
		}
		if strings.TrimSpace(target.TLSServerName) != "" {
			if strings.ContainsAny(strings.TrimSpace(target.TLSServerName), "/:\\") {
				return fmt.Errorf("runtime config gateway target tls server name must be a hostname")
			}
		}
		for _, header := range target.Headers {
			name := strings.TrimSpace(header.Name)
			value := strings.TrimSpace(header.Value)
			if name == "" || value == "" {
				return fmt.Errorf("runtime config gateway target headers require name and value")
			}
			if err := validateHeaderName(name); err != nil {
				return err
			}
		}
	}
	if strings.TrimSpace(s.state.DefaultGatewayTargetID) == "" || !hasTargetID(s.state.GatewayTargets, s.state.DefaultGatewayTargetID) {
		return fmt.Errorf("runtime config missing valid default gateway target")
	}
	if strings.TrimSpace(s.state.MasterSecret) == "" {
		return fmt.Errorf("runtime config missing master_secret")
	}
	if strings.TrimSpace(s.state.AdminCodeHash) == "" {
		return fmt.Errorf("runtime config missing admin_code_hash")
	}
	if strings.TrimSpace(s.state.ViewerCodeHash) == "" {
		return fmt.Errorf("runtime config missing viewer_code_hash")
	}
	return nil
}

func effectiveMasterSecret(cfg config.Config, state State) string {
	if strings.TrimSpace(cfg.MasterSecret) != "" {
		return strings.TrimSpace(cfg.MasterSecret)
	}
	return strings.TrimSpace(state.MasterSecret)
}

func (s *Store) persistLocked() error {
	raw, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return fmt.Errorf("encode runtime config: %w", err)
	}

	tmpPath := s.path + ".tmp"
	if err := os.WriteFile(tmpPath, raw, 0o600); err != nil {
		return fmt.Errorf("write runtime config temp file: %w", err)
	}
	if err := os.Rename(tmpPath, s.path); err != nil {
		return fmt.Errorf("replace runtime config file: %w", err)
	}
	return nil
}

func normalizeTargets(targets []GatewayTarget) ([]GatewayTarget, error) {
	if len(targets) == 0 {
		return nil, fmt.Errorf("at least one gateway target is required")
	}

	seenIDs := make(map[string]struct{}, len(targets))
	normalized := make([]GatewayTarget, 0, len(targets))
	for _, target := range targets {
		id := strings.TrimSpace(target.ID)
		name := strings.TrimSpace(target.Name)
		rawURL := strings.TrimSpace(target.URL)
		if id == "" || name == "" || rawURL == "" {
			return nil, fmt.Errorf("gateway targets require id, name, and url")
		}
		if _, exists := seenIDs[id]; exists {
			return nil, fmt.Errorf("duplicate gateway target id: %s", id)
		}
		parsed, err := url.Parse(rawURL)
		if err != nil {
			return nil, fmt.Errorf("gateway target url must be a full URL")
		}
		if err := journalproxy.ValidateBaseURL(parsed); err != nil {
			return nil, fmt.Errorf("gateway target url is invalid: %w", err)
		}
		headers, err := normalizeHeaders(target.Headers)
		if err != nil {
			return nil, err
		}
		seenIDs[id] = struct{}{}
		normalized = append(normalized, GatewayTarget{
			ID:            id,
			Name:          name,
			URL:           rawURL,
			TLSServerName: strings.TrimSpace(target.TLSServerName),
			Headers:       headers,
		})
	}
	return normalized, nil
}

func normalizeHeaders(headers []GatewayHeader) ([]GatewayHeader, error) {
	if len(headers) == 0 {
		return nil, nil
	}
	normalized := make([]GatewayHeader, 0, len(headers))
	for _, header := range headers {
		name := strings.TrimSpace(header.Name)
		value := strings.TrimSpace(header.Value)
		if name == "" && value == "" {
			continue
		}
		if name == "" || value == "" {
			return nil, fmt.Errorf("gateway target headers require name and value")
		}
		if err := validateHeaderName(name); err != nil {
			return nil, err
		}
		lower := strings.ToLower(name)
		switch lower {
		case "host", "content-length", "connection", "transfer-encoding", "accept", "range":
			return nil, fmt.Errorf("gateway target header %q is reserved", name)
		}
		normalized = append(normalized, GatewayHeader{Name: name, Value: value})
	}
	if len(normalized) == 0 {
		return nil, nil
	}
	return normalized, nil
}

func validateHeaderName(name string) error {
	for _, ch := range name {
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') {
			continue
		}
		switch ch {
		case '!', '#', '$', '%', '&', '\'', '*', '+', '-', '.', '^', '_', '`', '|', '~':
			continue
		}
		return fmt.Errorf("gateway target header %q has an invalid name", name)
	}
	return nil
}

func hasTargetID(targets []GatewayTarget, targetID string) bool {
	for _, target := range targets {
		if target.ID == targetID {
			return true
		}
	}
	return false
}

func cloneTargets(targets []GatewayTarget) []GatewayTarget {
	cloned := make([]GatewayTarget, len(targets))
	for i, target := range targets {
		cloned[i] = cloneTarget(target)
	}
	return cloned
}

func cloneTarget(target GatewayTarget) GatewayTarget {
	cloned := target
	if len(target.Headers) > 0 {
		cloned.Headers = append([]GatewayHeader(nil), target.Headers...)
	}
	return cloned
}
