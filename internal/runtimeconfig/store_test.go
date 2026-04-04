package runtimeconfig

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNormalizeTargetsTrimsAndNormalizesHeaders(t *testing.T) {
	targets, err := normalizeTargets([]GatewayTarget{{
		ID:            " primary ",
		Name:          " Primary Gateway ",
		URL:           "https://gateway.example.com",
		TLSServerName: " api.internal.example ",
		Headers: []GatewayHeader{
			{Name: " Authorization ", Value: " Bearer token "},
			{Name: " ", Value: " "},
		},
	}})
	if err != nil {
		t.Fatalf("normalizeTargets returned error: %v", err)
	}

	if len(targets) != 1 {
		t.Fatalf("expected one target, got %d", len(targets))
	}
	if targets[0].ID != "primary" || targets[0].Name != "Primary Gateway" {
		t.Fatalf("expected trimmed identity fields, got %+v", targets[0])
	}
	if targets[0].TLSServerName != "api.internal.example" {
		t.Fatalf("expected trimmed TLS server name, got %q", targets[0].TLSServerName)
	}
	if len(targets[0].Headers) != 1 || targets[0].Headers[0].Name != "Authorization" || targets[0].Headers[0].Value != "Bearer token" {
		t.Fatalf("expected normalized headers, got %+v", targets[0].Headers)
	}
}

func TestNormalizeTargetsRejectsInvalidInput(t *testing.T) {
	if _, err := normalizeTargets([]GatewayTarget{{ID: "a", Name: "A", URL: "not-a-url"}}); err == nil {
		t.Fatalf("expected invalid URL to fail")
	}
	if _, err := normalizeTargets([]GatewayTarget{{ID: "a", Name: "A", URL: "ftp://a.example.com"}}); err == nil {
		t.Fatalf("expected unsupported URL scheme to fail")
	}
	if _, err := normalizeTargets([]GatewayTarget{
		{ID: "dup", Name: "A", URL: "https://a.example.com"},
		{ID: "dup", Name: "B", URL: "https://b.example.com"},
	}); err == nil {
		t.Fatalf("expected duplicate IDs to fail")
	}
	if _, err := normalizeTargets([]GatewayTarget{{
		ID:   "a",
		Name: "A",
		URL:  "https://a.example.com",
		Headers: []GatewayHeader{
			{Name: "Host", Value: "example.com"},
		},
	}}); err == nil {
		t.Fatalf("expected reserved header to fail")
	}
}

func TestValidateLockedRejectsBadTLSAndHeaderNames(t *testing.T) {
	store := &Store{
		state: State{
			GatewayTargets: []GatewayTarget{{
				ID:            "primary",
				Name:          "Primary",
				URL:           "https://gateway.example.com",
				TLSServerName: "bad/name",
			}},
			DefaultGatewayTargetID: "primary",
			MasterSecret:           "master",
			AdminCodeHash:          "admin",
			ViewerCodeHash:         "viewer",
		},
	}

	if err := store.validateLocked(); err == nil {
		t.Fatalf("expected invalid TLS server name to fail")
	}

	store.state.GatewayTargets[0].TLSServerName = "gateway.internal"
	store.state.GatewayTargets[0].Headers = []GatewayHeader{{Name: "Bad Header", Value: "value"}}
	if err := store.validateLocked(); err == nil {
		t.Fatalf("expected invalid header name to fail")
	}
}

func TestUpdateAdminConfigPersistsTargetsAndCodes(t *testing.T) {
	tempDir := t.TempDir()
	store := &Store{
		path: filepath.Join(tempDir, "config.json"),
		state: State{
			GatewayTargets: []GatewayTarget{{
				ID:   "old",
				Name: "Old",
				URL:  "https://old.example.com",
			}},
			DefaultGatewayTargetID: "old",
			MasterSecret:           "stored-master",
			AdminCodeHash:          "old-admin-hash",
			ViewerCodeHash:         "old-viewer-hash",
			CreatedAt:              time.Now().UTC(),
			UpdatedAt:              time.Now().UTC(),
		},
		effectiveMasterSecret: "effective-master",
	}

	err := store.UpdateAdminConfig(UpdateAdminConfig{
		GatewayTargets: []GatewayTarget{
			{
				ID:            "primary",
				Name:          "Primary",
				URL:           "https://primary.example.com",
				TLSServerName: "primary.internal",
				Headers:       []GatewayHeader{{Name: "Authorization", Value: "Bearer token"}},
			},
			{
				ID:   "secondary",
				Name: "Secondary",
				URL:  "https://secondary.example.com",
			},
		},
		DefaultGatewayTargetID: "secondary",
		AdminAccessCode:        "admin-123456",
		ViewerAccessCode:       "viewer-654321",
	})
	if err != nil {
		t.Fatalf("UpdateAdminConfig returned error: %v", err)
	}

	if store.state.DefaultGatewayTargetID != "secondary" {
		t.Fatalf("expected default target secondary, got %q", store.state.DefaultGatewayTargetID)
	}
	if role, ok := store.VerifyAccessCode("admin-123456"); !ok || role != "admin" {
		t.Fatalf("expected admin code verification to succeed, got role=%q ok=%v", role, ok)
	}
	if role, ok := store.VerifyAccessCode("viewer-654321"); !ok || role != "viewer" {
		t.Fatalf("expected viewer code verification to succeed, got role=%q ok=%v", role, ok)
	}

	raw, err := os.ReadFile(store.path)
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}
	var persisted State
	if err := json.Unmarshal(raw, &persisted); err != nil {
		t.Fatalf("Unmarshal returned error: %v", err)
	}
	if persisted.DefaultGatewayTargetID != "secondary" {
		t.Fatalf("expected persisted default target secondary, got %q", persisted.DefaultGatewayTargetID)
	}
}
