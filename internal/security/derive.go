package security

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
)

func DeriveBytes(masterSecret, context string, length int) ([]byte, error) {
	if masterSecret == "" {
		return nil, fmt.Errorf("master secret is empty")
	}
	if length <= 0 {
		return nil, fmt.Errorf("derive length must be positive")
	}

	prk := hmacSHA256([]byte("journal-scope/master"), []byte(masterSecret))
	result := make([]byte, 0, length)
	var previous []byte
	counter := byte(1)

	for len(result) < length {
		mac := hmac.New(sha256.New, prk)
		if len(previous) > 0 {
			_, _ = mac.Write(previous)
		}
		_, _ = mac.Write([]byte(context))
		_, _ = mac.Write([]byte{counter})
		previous = mac.Sum(nil)
		result = append(result, previous...)
		counter++
	}

	return result[:length], nil
}

func DeriveString(masterSecret, context string, length int) (string, error) {
	derived, err := DeriveBytes(masterSecret, context, length)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(derived), nil
}
