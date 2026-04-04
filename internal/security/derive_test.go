package security

import (
	"encoding/base64"
	"testing"
)

func TestDeriveBytesIsDeterministicAndContextBound(t *testing.T) {
	first, err := DeriveBytes("master-secret", "session-signing", 32)
	if err != nil {
		t.Fatalf("DeriveBytes returned error: %v", err)
	}
	second, err := DeriveBytes("master-secret", "session-signing", 32)
	if err != nil {
		t.Fatalf("DeriveBytes returned error: %v", err)
	}
	otherContext, err := DeriveBytes("master-secret", "gateway-auth", 32)
	if err != nil {
		t.Fatalf("DeriveBytes returned error: %v", err)
	}

	if string(first) != string(second) {
		t.Fatalf("expected identical derivation for same inputs")
	}
	if string(first) == string(otherContext) {
		t.Fatalf("expected different contexts to derive different values")
	}
}

func TestDeriveBytesValidatesInputs(t *testing.T) {
	if _, err := DeriveBytes("", "ctx", 16); err == nil {
		t.Fatalf("expected empty master secret to fail")
	}
	if _, err := DeriveBytes("secret", "ctx", 0); err == nil {
		t.Fatalf("expected non-positive length to fail")
	}
}

func TestDeriveStringEncodesDerivedBytes(t *testing.T) {
	derived, err := DeriveBytes("master-secret", "session-signing", 24)
	if err != nil {
		t.Fatalf("DeriveBytes returned error: %v", err)
	}
	encoded, err := DeriveString("master-secret", "session-signing", 24)
	if err != nil {
		t.Fatalf("DeriveString returned error: %v", err)
	}

	if encoded != base64.RawURLEncoding.EncodeToString(derived) {
		t.Fatalf("expected DeriveString to base64url-encode derived bytes")
	}
}
