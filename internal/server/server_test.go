package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"journal-scope/internal/config"
	"journal-scope/internal/journalproxy"
	"journal-scope/internal/runtimeconfig"
	"journal-scope/internal/security"
)

func TestHandleTestGatewayProbesMachineEndpoint(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/machine" {
			t.Fatalf("Path = %q, want /machine", r.URL.Path)
		}
		if got := r.Header.Get("Accept"); got != "application/json" {
			t.Fatalf("Accept = %q, want application/json", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"machine_id":"machine-1","boot_id":"boot-1","hostname":"host-1","cutoff_from_realtime":"1","cutoff_to_realtime":"2"}`)
	}))
	defer upstream.Close()

	handler := newAdminServerHandler(t, upstream.URL)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/test-gateway", strings.NewReader(`{"url":"`+upstream.URL+`"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(mutationIntentHeader, mutationIntentValue)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("StatusCode = %d, want %d body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}

	var body map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if body["hostname"] != "host-1" || body["machine"] != "machine-1" {
		t.Fatalf("unexpected response body: %+v", body)
	}
}

func newAdminServerHandler(t *testing.T, gatewayURL string) http.Handler {
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
	handler, err := New(cfg, store, journalproxy.NewClient(nil), sessionManager, context.Background())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recorder := httptest.NewRecorder()
		if err := sessionManager.SetSession(recorder, security.RoleAdmin); err != nil {
			t.Fatalf("SetSession() error = %v", err)
		}
		for _, cookie := range recorder.Result().Cookies() {
			r.AddCookie(cookie)
		}
		handler.ServeHTTP(w, r)
	})
}
