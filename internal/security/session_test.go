package security

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSessionManagerSetAndReadSession(t *testing.T) {
	manager := NewSessionManager("session-secret", time.Hour, true)
	recorder := httptest.NewRecorder()

	if err := manager.SetSession(recorder, RoleAdmin); err != nil {
		t.Fatalf("SetSession returned error: %v", err)
	}

	response := recorder.Result()
	cookies := response.Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected one cookie, got %d", len(cookies))
	}
	if !cookies[0].Secure {
		t.Fatalf("expected secure cookie")
	}

	request := httptest.NewRequest("GET", "/", nil)
	request.AddCookie(cookies[0])

	claims, err := manager.ReadSession(request)
	if err != nil {
		t.Fatalf("ReadSession returned error: %v", err)
	}
	if claims.Role != RoleAdmin {
		t.Fatalf("unexpected claims: %+v", claims)
	}
}

func TestSessionManagerSetAndReadActiveGatewayTarget(t *testing.T) {
	manager := NewSessionManager("session-secret", time.Hour, false)
	recorder := httptest.NewRecorder()

	manager.SetActiveGatewayTarget(recorder, "new-target")

	request := httptest.NewRequest("GET", "/", nil)
	request.AddCookie(recorder.Result().Cookies()[0])
	targetID, err := manager.ReadActiveGatewayTarget(request)
	if err != nil {
		t.Fatalf("ReadActiveGatewayTarget returned error: %v", err)
	}
	if targetID != "new-target" {
		t.Fatalf("expected updated gateway target, got %q", targetID)
	}
}

func TestSessionManagerClearSessionExpiresCookie(t *testing.T) {
	manager := NewSessionManager("session-secret", time.Hour, false)
	recorder := httptest.NewRecorder()

	manager.ClearSession(recorder)
	cookie := recorder.Result().Cookies()[0]
	if cookie.MaxAge != -1 {
		t.Fatalf("expected cleared cookie max-age -1, got %d", cookie.MaxAge)
	}
	if cookie.Value != "" {
		t.Fatalf("expected cleared cookie to have empty value")
	}
}

func TestSessionManagerClearActiveGatewayTargetExpiresCookie(t *testing.T) {
	manager := NewSessionManager("session-secret", time.Hour, false)
	recorder := httptest.NewRecorder()

	manager.ClearActiveGatewayTarget(recorder)
	cookie := recorder.Result().Cookies()[0]
	if cookie.MaxAge != -1 {
		t.Fatalf("expected cleared cookie max-age -1, got %d", cookie.MaxAge)
	}
	if cookie.Value != "" {
		t.Fatalf("expected cleared cookie to have empty value")
	}
}

func TestSessionManagerVerifyRejectsInvalidCookies(t *testing.T) {
	manager := NewSessionManager("session-secret", time.Hour, false)

	validClaims := SessionClaims{
		Role:      RoleViewer,
		IssuedAt:  time.Now().UTC().Unix(),
		ExpiresAt: time.Now().UTC().Add(time.Hour).Unix(),
	}
	signed, err := manager.sign(validClaims)
	if err != nil {
		t.Fatalf("sign returned error: %v", err)
	}

	if _, err := manager.verify(strings.Replace(signed, ".", "x.", 1)); err == nil {
		t.Fatalf("expected tampered cookie to fail verification")
	}

	expired, err := manager.sign(SessionClaims{
		Role:      RoleViewer,
		IssuedAt:  time.Now().UTC().Add(-2 * time.Hour).Unix(),
		ExpiresAt: time.Now().UTC().Add(-time.Hour).Unix(),
	})
	if err != nil {
		t.Fatalf("sign returned error: %v", err)
	}
	if _, err := manager.verify(expired); err == nil {
		t.Fatalf("expected expired cookie to fail verification")
	}
}
