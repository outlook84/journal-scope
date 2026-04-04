package security

import (
	"regexp"
	"strings"
	"testing"
)

func TestHashAccessCodeRoundTrip(t *testing.T) {
	hash, err := HashAccessCode("viewer-123456")
	if err != nil {
		t.Fatalf("HashAccessCode returned error: %v", err)
	}

	if !VerifyAccessCode(hash, "viewer-123456") {
		t.Fatalf("VerifyAccessCode should accept the original code")
	}
	if VerifyAccessCode(hash, "viewer-654321") {
		t.Fatalf("VerifyAccessCode should reject a different code")
	}
}

func TestHashAccessCodeRejectsEmptyInput(t *testing.T) {
	if _, err := HashAccessCode("   "); err == nil {
		t.Fatalf("HashAccessCode should reject empty codes")
	}
}

func TestVerifyAccessCodeRejectsMalformedHash(t *testing.T) {
	if VerifyAccessCode("not-a-valid-hash", "viewer-123456") {
		t.Fatalf("VerifyAccessCode should reject malformed hashes")
	}
}

func TestGenerateAccessCodeTrimsPrefixDashes(t *testing.T) {
	code, err := GenerateAccessCode("--admin-")
	if err != nil {
		t.Fatalf("GenerateAccessCode returned error: %v", err)
	}

	if !strings.HasPrefix(code, "admin-") {
		t.Fatalf("expected code to start with admin-, got %q", code)
	}
	if matched := regexp.MustCompile(`^[A-Za-z0-9_-]+-[A-Za-z0-9_-]+$`).MatchString(code); !matched {
		t.Fatalf("expected code to be URL-safe, got %q", code)
	}
}

func TestGenerateSecretReturnsURLSafeValue(t *testing.T) {
	secret, err := GenerateSecret(32)
	if err != nil {
		t.Fatalf("GenerateSecret returned error: %v", err)
	}

	if secret == "" {
		t.Fatalf("expected non-empty secret")
	}
	if strings.Contains(secret, "=") {
		t.Fatalf("expected RawURLEncoding output without padding, got %q", secret)
	}
}
