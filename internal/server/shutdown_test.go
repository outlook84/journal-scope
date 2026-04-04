package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"journal-scope/internal/config"
	"journal-scope/internal/journalproxy"
	"journal-scope/internal/runtimeconfig"
	"journal-scope/internal/security"
)

func TestRequestContextCanceledWhenShutdownStarts(t *testing.T) {
	shutdownCtx, shutdown := context.WithCancel(context.Background())
	defer shutdown()

	s := &Server{shutdownCtx: shutdownCtx}
	ctx, cancel := s.requestContext(context.Background())
	defer cancel()

	shutdown()

	select {
	case <-ctx.Done():
	case <-time.After(time.Second):
		t.Fatal("request context was not canceled by shutdown context")
	}
}

func TestTailLogsReturnsWhenShutdownStarts(t *testing.T) {
	upstreamStarted := make(chan struct{})
	upstreamCanceled := make(chan struct{})

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/entries" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}
		close(upstreamStarted)
		<-r.Context().Done()
		close(upstreamCanceled)
	}))
	defer upstream.Close()

	handler, shutdown := newAuthedServerHandlerWithShutdown(t, upstream.URL)
	defer shutdown()

	req := httptest.NewRequest(http.MethodGet, "/api/logs/tail", nil)
	recorder := httptest.NewRecorder()
	handlerDone := make(chan struct{})
	go func() {
		handler.ServeHTTP(recorder, req)
		close(handlerDone)
	}()

	select {
	case <-upstreamStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("tail request did not reach upstream")
	}

	shutdown()

	select {
	case <-upstreamCanceled:
	case <-time.After(2 * time.Second):
		t.Fatal("upstream tail request was not canceled during shutdown")
	}

	select {
	case <-handlerDone:
	case <-time.After(2 * time.Second):
		t.Fatal("tail handler did not finish after shutdown")
	}
}

func newAuthedServerHandlerWithShutdown(t *testing.T, gatewayURL string) (http.Handler, context.CancelFunc) {
	t.Helper()

	parsedGatewayURL, err := url.Parse(gatewayURL)
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}

	dataDir := t.TempDir()
	cfg := config.Config{
		DataDir:             dataDir,
		SessionTTL:          time.Hour,
		BootstrapGatewayURL: parsedGatewayURL,
		BootstrapAdminCode:  "admin-code",
		BootstrapViewerCode: "viewer-code",
	}

	store, _, err := runtimeconfig.LoadOrCreate(cfg)
	if err != nil {
		t.Fatalf("LoadOrCreate() error = %v", err)
	}

	sessionManager := security.NewSessionManager("test-secret", time.Hour, false)
	shutdownCtx, shutdown := context.WithCancel(context.Background())
	handler, err := New(cfg, store, journalproxy.NewClient(nil), sessionManager, shutdownCtx)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	authed := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recorder := httptest.NewRecorder()
		if err := sessionManager.SetSession(recorder, security.RoleViewer); err != nil {
			t.Fatalf("SetSession() error = %v", err)
		}
		for _, cookie := range recorder.Result().Cookies() {
			r.AddCookie(cookie)
		}

		targetRecorder := httptest.NewRecorder()
		sessionManager.SetActiveGatewayTarget(targetRecorder, store.DefaultGatewayTargetID())
		for _, cookie := range targetRecorder.Result().Cookies() {
			r.AddCookie(cookie)
		}

		handler.ServeHTTP(w, r)
	})

	return authed, shutdown
}
