package gatewaytls

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"

	"github.com/youmark/pkcs8"

	"journal-scope/internal/config"
	"journal-scope/internal/security"
)

func BuildTLSConfig(cfg config.Config, masterSecret string) (*tls.Config, error) {
	if cfg.GatewayCAFile == "" && cfg.GatewayClientCertFile == "" && cfg.GatewayClientKeyFile == "" {
		return nil, nil
	}
	if (cfg.GatewayClientCertFile == "") != (cfg.GatewayClientKeyFile == "") {
		return nil, fmt.Errorf("gateway client cert and key files must be configured together")
	}

	tlsConfig := &tls.Config{
		MinVersion: tls.VersionTLS12,
	}

	if cfg.GatewayCAFile != "" {
		caPEM, err := os.ReadFile(cfg.GatewayCAFile)
		if err != nil {
			return nil, fmt.Errorf("read gateway CA file: %w", err)
		}
		roots := x509.NewCertPool()
		if !roots.AppendCertsFromPEM(caPEM) {
			return nil, fmt.Errorf("parse gateway CA file")
		}
		tlsConfig.RootCAs = roots
	}

	if cfg.GatewayClientCertFile != "" && cfg.GatewayClientKeyFile != "" {
		certPEM, err := os.ReadFile(cfg.GatewayClientCertFile)
		if err != nil {
			return nil, fmt.Errorf("read gateway client cert file: %w", err)
		}
		keyPEM, err := os.ReadFile(cfg.GatewayClientKeyFile)
		if err != nil {
			return nil, fmt.Errorf("read gateway client key file: %w", err)
		}

		decryptedKeyPEM, err := decryptKeyPEMIfNeeded(keyPEM, masterSecret)
		if err != nil {
			return nil, err
		}

		certificate, err := tls.X509KeyPair(certPEM, decryptedKeyPEM)
		if err != nil {
			return nil, fmt.Errorf("load gateway client certificate: %w", err)
		}
		tlsConfig.Certificates = []tls.Certificate{certificate}
	}

	return tlsConfig, nil
}

func decryptKeyPEMIfNeeded(keyPEM []byte, masterSecret string) ([]byte, error) {
	block, rest := pem.Decode(keyPEM)
	if block == nil {
		return nil, fmt.Errorf("decode gateway client key PEM")
	}
	if len(rest) != 0 {
		return keyPEM, nil
	}
	if x509.IsEncryptedPEMBlock(block) {
		return decryptLegacyPEMBlock(block, masterSecret)
	}
	if block.Type != "ENCRYPTED PRIVATE KEY" {
		return keyPEM, nil
	}

	passphrase, err := deriveGatewayKeyPassphrase(masterSecret)
	if err != nil {
		return nil, err
	}
	privateKey, err := pkcs8.ParsePKCS8PrivateKey(block.Bytes, passphrase)
	if err != nil {
		return nil, fmt.Errorf("decrypt gateway client key PKCS#8 PEM: %w", err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		return nil, fmt.Errorf("marshal decrypted gateway client key PKCS#8 PEM: %w", err)
	}
	return pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), nil
}

func decryptLegacyPEMBlock(block *pem.Block, masterSecret string) ([]byte, error) {
	passphrase, err := deriveGatewayKeyPassphrase(masterSecret)
	if err != nil {
		return nil, err
	}
	der, err := x509.DecryptPEMBlock(block, passphrase)
	if err != nil {
		return nil, fmt.Errorf("decrypt gateway client key PEM: %w", err)
	}
	return pem.EncodeToMemory(&pem.Block{Type: block.Type, Bytes: der}), nil
}

func deriveGatewayKeyPassphrase(masterSecret string) ([]byte, error) {
	passphrase, err := security.DeriveBytes(masterSecret, "gateway-client-key-passphrase", 32)
	if err != nil {
		return nil, fmt.Errorf("derive gateway client key passphrase: %w", err)
	}
	return passphrase, nil
}
