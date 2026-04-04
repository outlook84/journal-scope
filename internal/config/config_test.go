package config

import (
	"testing"
	"time"
)

func TestLoadUsesDefaults(t *testing.T) {
	t.Setenv("JOURNAL_SCOPE_LISTEN_ADDR", "")
	t.Setenv("JOURNAL_SCOPE_STATIC_DIR", "")
	t.Setenv("JOURNAL_SCOPE_DATA_DIR", "")
	t.Setenv("JOURNAL_SCOPE_SESSION_TTL", "")
	t.Setenv("JOURNAL_SCOPE_COOKIE_SECURE", "")
	t.Setenv("JOURNAL_SCOPE_TRUST_PROXY_HEADERS", "")
	t.Setenv("JOURNAL_SCOPE_MASTER_SECRET", "")
	t.Setenv("JOURNAL_SCOPE_BOOTSTRAP_GATEWAY_URL", "")
	t.Setenv("JOURNAL_SCOPE_BOOTSTRAP_ADMIN_CODE", "")
	t.Setenv("JOURNAL_SCOPE_BOOTSTRAP_VIEWER_CODE", "")
	t.Setenv("JOURNAL_SCOPE_GATEWAY_CA_FILE", "")
	t.Setenv("JOURNAL_SCOPE_GATEWAY_CLIENT_CERT_FILE", "")
	t.Setenv("JOURNAL_SCOPE_GATEWAY_CLIENT_KEY_FILE", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.ListenAddr != "127.0.0.1:3030" {
		t.Fatalf("ListenAddr = %q, want default", cfg.ListenAddr)
	}
	if cfg.DataDir != "data" {
		t.Fatalf("DataDir = %q, want default", cfg.DataDir)
	}
	if cfg.SessionTTL != 168*time.Hour {
		t.Fatalf("SessionTTL = %v, want 168h", cfg.SessionTTL)
	}
	if cfg.BootstrapGatewayURL.String() != "http://127.0.0.1:19531" {
		t.Fatalf("BootstrapGatewayURL = %q, want default", cfg.BootstrapGatewayURL.String())
	}
	if cfg.CookieSecure {
		t.Fatalf("CookieSecure = true, want false")
	}
	if cfg.TrustProxyHeaders {
		t.Fatalf("TrustProxyHeaders = true, want false")
	}
}

func TestLoadHonorsOverridesAndBoolFallback(t *testing.T) {
	t.Setenv("JOURNAL_SCOPE_LISTEN_ADDR", "0.0.0.0:8080")
	t.Setenv("JOURNAL_SCOPE_DATA_DIR", "custom-data")
	t.Setenv("JOURNAL_SCOPE_SESSION_TTL", "2h30m")
	t.Setenv("JOURNAL_SCOPE_COOKIE_SECURE", "true")
	t.Setenv("JOURNAL_SCOPE_TRUST_PROXY_HEADERS", "not-a-bool")
	t.Setenv("JOURNAL_SCOPE_MASTER_SECRET", "secret")
	t.Setenv("JOURNAL_SCOPE_BOOTSTRAP_GATEWAY_URL", "https://example.com:9443")
	t.Setenv("JOURNAL_SCOPE_BOOTSTRAP_ADMIN_CODE", "admin")
	t.Setenv("JOURNAL_SCOPE_BOOTSTRAP_VIEWER_CODE", "viewer")
	t.Setenv("JOURNAL_SCOPE_GATEWAY_CA_FILE", "ca.pem")
	t.Setenv("JOURNAL_SCOPE_GATEWAY_CLIENT_CERT_FILE", "client.crt")
	t.Setenv("JOURNAL_SCOPE_GATEWAY_CLIENT_KEY_FILE", "client.key")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.ListenAddr != "0.0.0.0:8080" {
		t.Fatalf("ListenAddr = %q, want override", cfg.ListenAddr)
	}
	if cfg.DataDir != "custom-data" {
		t.Fatalf("DataDir = %q, want override", cfg.DataDir)
	}
	if cfg.SessionTTL != 150*time.Minute {
		t.Fatalf("SessionTTL = %v, want 2h30m", cfg.SessionTTL)
	}
	if !cfg.CookieSecure {
		t.Fatalf("CookieSecure = false, want true")
	}
	if cfg.TrustProxyHeaders {
		t.Fatalf("TrustProxyHeaders = true, want false fallback on parse error")
	}
	if cfg.BootstrapGatewayURL.String() != "https://example.com:9443" {
		t.Fatalf("BootstrapGatewayURL = %q, want override", cfg.BootstrapGatewayURL.String())
	}
}

func TestLoadRejectsInvalidGatewayURLAndTTL(t *testing.T) {
	t.Setenv("JOURNAL_SCOPE_BOOTSTRAP_GATEWAY_URL", "example.com")
	if _, err := Load(); err == nil {
		t.Fatalf("Load() error = nil, want invalid gateway URL error")
	}

	t.Setenv("JOURNAL_SCOPE_BOOTSTRAP_GATEWAY_URL", "https://example.com")
	t.Setenv("JOURNAL_SCOPE_SESSION_TTL", "0")
	if _, err := Load(); err == nil {
		t.Fatalf("Load() error = nil, want non-positive TTL error")
	}
}
