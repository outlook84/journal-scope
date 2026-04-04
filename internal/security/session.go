package security

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	SessionCookieName      = "journal_scope_session"
	ActiveTargetCookieName = "journal_scope_gateway_target"
)

type Role string

const (
	RoleViewer Role = "viewer"
	RoleAdmin  Role = "admin"
)

type SessionClaims struct {
	Role      Role  `json:"role"`
	ExpiresAt int64 `json:"exp"`
	IssuedAt  int64 `json:"iat"`
}

type SessionManager struct {
	secret []byte
	ttl    time.Duration
	secure bool
}

func NewSessionManager(secret string, ttl time.Duration, secure bool) *SessionManager {
	return &SessionManager{
		secret: []byte(secret),
		ttl:    ttl,
		secure: secure,
	}
}

func (m *SessionManager) SetSession(w http.ResponseWriter, role Role) error {
	now := time.Now().UTC()
	claims := SessionClaims{
		Role:      role,
		ExpiresAt: now.Add(m.ttl).Unix(),
		IssuedAt:  now.Unix(),
	}
	return m.writeCookie(w, claims)
}

func (m *SessionManager) SetActiveGatewayTarget(w http.ResponseWriter, gatewayTargetID string) {
	http.SetCookie(w, &http.Cookie{
		Name:     ActiveTargetCookieName,
		Value:    gatewayTargetID,
		Path:     "/",
		HttpOnly: true,
		Secure:   m.secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(m.ttl.Seconds()),
	})
}

func (m *SessionManager) ReadActiveGatewayTarget(r *http.Request) (string, error) {
	cookie, err := r.Cookie(ActiveTargetCookieName)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(cookie.Value), nil
}

func (m *SessionManager) ClearActiveGatewayTarget(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     ActiveTargetCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   m.secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

func (m *SessionManager) writeCookie(w http.ResponseWriter, claims SessionClaims) error {
	value, err := m.sign(claims)
	if err != nil {
		return err
	}

	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   m.secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(m.ttl.Seconds()),
	})
	return nil
}

func (m *SessionManager) ClearSession(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   m.secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

func (m *SessionManager) ReadSession(r *http.Request) (*SessionClaims, error) {
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil {
		return nil, err
	}
	return m.verify(cookie.Value)
}

func (m *SessionManager) sign(claims SessionClaims) (string, error) {
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("marshal session claims: %w", err)
	}
	payloadEncoded := base64.RawURLEncoding.EncodeToString(payload)
	signature := computeHMACSHA256(m.secret, payload)
	signatureEncoded := base64.RawURLEncoding.EncodeToString(signature)
	return payloadEncoded + "." + signatureEncoded, nil
}

func (m *SessionManager) verify(value string) (*SessionClaims, error) {
	parts := strings.Split(value, ".")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid session cookie")
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("decode session payload: %w", err)
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("decode session signature: %w", err)
	}

	expected := computeHMACSHA256(m.secret, payload)
	if !hmac.Equal(signature, expected) {
		return nil, fmt.Errorf("invalid session signature")
	}

	var claims SessionClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, fmt.Errorf("decode session claims: %w", err)
	}
	if claims.Role != RoleViewer && claims.Role != RoleAdmin {
		return nil, fmt.Errorf("invalid session role")
	}
	if time.Now().UTC().Unix() > claims.ExpiresAt {
		return nil, fmt.Errorf("session expired")
	}
	return &claims, nil
}

func computeHMACSHA256(secret, payload []byte) []byte {
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write(payload)
	return mac.Sum(nil)
}
