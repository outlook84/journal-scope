package security

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strings"
)

const (
	hashVersion    = "pbkdf2-sha256"
	hashIterations = 120000
	hashKeyLen     = 32
)

func HashAccessCode(code string) (string, error) {
	if strings.TrimSpace(code) == "" {
		return "", fmt.Errorf("access code must not be empty")
	}

	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}

	derived := pbkdf2SHA256([]byte(code), salt, hashIterations, hashKeyLen)
	return fmt.Sprintf("%s$%d$%s$%s", hashVersion, hashIterations, hex.EncodeToString(salt), hex.EncodeToString(derived)), nil
}

func VerifyAccessCode(encodedHash, code string) bool {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 4 || parts[0] != hashVersion || strings.TrimSpace(code) == "" {
		return false
	}

	salt, err := hex.DecodeString(parts[2])
	if err != nil {
		return false
	}
	expected, err := hex.DecodeString(parts[3])
	if err != nil {
		return false
	}

	derived := pbkdf2SHA256([]byte(code), salt, hashIterations, len(expected))
	return subtle.ConstantTimeCompare(derived, expected) == 1
}

func GenerateAccessCode(prefix string) (string, error) {
	token, err := randomBase64URL(18)
	if err != nil {
		return "", err
	}
	return strings.Trim(prefix, "-") + "-" + token, nil
}

func GenerateSecret(bytes int) (string, error) {
	return randomBase64URL(bytes)
}

func randomBase64URL(bytes int) (string, error) {
	raw := make([]byte, bytes)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate random bytes: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func pbkdf2SHA256(password, salt []byte, iterations, keyLen int) []byte {
	hLen := sha256.Size
	numBlocks := (keyLen + hLen - 1) / hLen
	derived := make([]byte, 0, numBlocks*hLen)

	for block := 1; block <= numBlocks; block++ {
		counter := []byte{byte(block >> 24), byte(block >> 16), byte(block >> 8), byte(block)}
		u := hmacSHA256(password, append(append([]byte{}, salt...), counter...))
		t := append([]byte{}, u...)
		for i := 1; i < iterations; i++ {
			u = hmacSHA256(password, u)
			for j := range t {
				t[j] ^= u[j]
			}
		}
		derived = append(derived, t...)
	}

	return derived[:keyLen]
}

func hmacSHA256(key, data []byte) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write(data)
	return mac.Sum(nil)
}
