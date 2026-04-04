package gatewaytls

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/youmark/pkcs8"

	"journal-scope/internal/config"
	"journal-scope/internal/journalproxy"
)

func TestBuildTLSConfigLoadsEncryptedPKCS8ClientKey(t *testing.T) {
	caCertPEM, caCert, caKey := mustCreateCA(t)
	clientCertPEM, clientKey := mustCreateLeafCertificate(t, caCert, caKey, false, "journal-client")
	encryptedKeyPEM := mustEncryptPKCS8PrivateKeyPEM(t, clientKey, "master-secret")

	tempDir := t.TempDir()
	cfg := config.Config{
		GatewayCAFile:         writeTempFile(t, tempDir, "ca.pem", caCertPEM),
		GatewayClientCertFile: writeTempFile(t, tempDir, "client-cert.pem", clientCertPEM),
		GatewayClientKeyFile:  writeTempFile(t, tempDir, "client-key.pem", encryptedKeyPEM),
	}

	tlsConfig, err := BuildTLSConfig(cfg, "master-secret")
	if err != nil {
		t.Fatalf("BuildTLSConfig returned error: %v", err)
	}

	if tlsConfig == nil {
		t.Fatalf("expected TLS config")
	}
	if tlsConfig.MinVersion != tls.VersionTLS12 {
		t.Fatalf("MinVersion = %v, want %v", tlsConfig.MinVersion, tls.VersionTLS12)
	}
	if tlsConfig.RootCAs == nil {
		t.Fatalf("expected RootCAs to be configured")
	}
	if len(tlsConfig.Certificates) != 1 {
		t.Fatalf("expected one client certificate, got %d", len(tlsConfig.Certificates))
	}
}

func TestJournalProxySupportsMTLSAndTLSServerNameOverride(t *testing.T) {
	caCertPEM, caCert, caKey := mustCreateCA(t)
	serverCertPEM, serverKey := mustCreateLeafCertificate(t, caCert, caKey, true, "gateway.internal")
	clientCertPEM, clientKey := mustCreateLeafCertificate(t, caCert, caKey, false, "journal-client")
	encryptedClientKeyPEM := mustEncryptPKCS8PrivateKeyPEM(t, clientKey, "master-secret")

	serverTLSCert, err := tls.X509KeyPair(serverCertPEM, mustMarshalPrivateKeyPEM(t, serverKey))
	if err != nil {
		t.Fatalf("tls.X509KeyPair(server) returned error: %v", err)
	}

	clientCAs := x509.NewCertPool()
	if !clientCAs.AppendCertsFromPEM(caCertPEM) {
		t.Fatalf("AppendCertsFromPEM(clientCAs) returned false")
	}

	var seenServerName string
	var sawClientCert bool
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenServerName = r.TLS.ServerName
		sawClientCert = len(r.TLS.PeerCertificates) == 1
		if r.URL.Path != "/entries" {
			t.Fatalf("Path = %q, want /entries", r.URL.Path)
		}
		if got := r.Header.Get("Accept"); got != "application/json" {
			t.Fatalf("Accept = %q, want application/json", got)
		}
		if got := r.Header.Get("Range"); got != "entries=:-1:1" {
			t.Fatalf("Range = %q, want entries=:-1:1", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, "[]")
	})

	server := httptest.NewUnstartedServer(handler)
	server.TLS = &tls.Config{
		Certificates: []tls.Certificate{serverTLSCert},
		ClientAuth:   tls.RequireAndVerifyClientCert,
		ClientCAs:    clientCAs,
		MinVersion:   tls.VersionTLS12,
	}
	server.StartTLS()
	defer server.Close()

	tempDir := t.TempDir()
	cfg := config.Config{
		GatewayCAFile:         writeTempFile(t, tempDir, "ca.pem", caCertPEM),
		GatewayClientCertFile: writeTempFile(t, tempDir, "client-cert.pem", clientCertPEM),
		GatewayClientKeyFile:  writeTempFile(t, tempDir, "client-key.pem", encryptedClientKeyPEM),
	}

	tlsConfig, err := BuildTLSConfig(cfg, "master-secret")
	if err != nil {
		t.Fatalf("BuildTLSConfig returned error: %v", err)
	}

	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.TLSClientConfig = tlsConfig
	client := journalproxy.NewClient(transport)

	baseURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("url.Parse(server.URL) returned error: %v", err)
	}

	resp, err := client.FetchLogs(context.Background(), journalproxy.RequestTarget{
		BaseURL:       baseURL,
		TLSServerName: "gateway.internal",
	}, journalproxy.LogQuery{Limit: 1})
	if err != nil {
		t.Fatalf("FetchLogs returned error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("StatusCode = %d, want %d", resp.StatusCode, http.StatusOK)
	}
	if seenServerName != "gateway.internal" {
		t.Fatalf("server saw SNI %q, want gateway.internal", seenServerName)
	}
	if !sawClientCert {
		t.Fatalf("expected server to receive a verified client certificate")
	}
}

func mustCreateCA(t *testing.T) ([]byte, *x509.Certificate, *ecdsa.PrivateKey) {
	t.Helper()

	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("ecdsa.GenerateKey(CA) returned error: %v", err)
	}

	template := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "Journal Scope Test CA"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}

	der, err := x509.CreateCertificate(rand.Reader, template, template, privateKey.Public(), privateKey)
	if err != nil {
		t.Fatalf("x509.CreateCertificate(CA) returned error: %v", err)
	}

	certificate, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("x509.ParseCertificate(CA) returned error: %v", err)
	}

	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), certificate, privateKey
}

func mustCreateLeafCertificate(t *testing.T, caCert *x509.Certificate, caKey *ecdsa.PrivateKey, isServer bool, commonName string) ([]byte, *ecdsa.PrivateKey) {
	t.Helper()

	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("ecdsa.GenerateKey(leaf) returned error: %v", err)
	}

	template := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject:      pkix.Name{CommonName: commonName},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}
	if isServer {
		template.DNSNames = []string{commonName}
		template.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}
	}

	der, err := x509.CreateCertificate(rand.Reader, template, caCert, privateKey.Public(), caKey)
	if err != nil {
		t.Fatalf("x509.CreateCertificate(leaf) returned error: %v", err)
	}

	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), privateKey
}

func mustEncryptPKCS8PrivateKeyPEM(t *testing.T, privateKey *ecdsa.PrivateKey, masterSecret string) []byte {
	t.Helper()

	passphrase, err := deriveGatewayKeyPassphrase(masterSecret)
	if err != nil {
		t.Fatalf("deriveGatewayKeyPassphrase returned error: %v", err)
	}
	der, err := pkcs8.MarshalPrivateKey(privateKey, passphrase, nil)
	if err != nil {
		t.Fatalf("pkcs8.MarshalPrivateKey returned error: %v", err)
	}
	return pem.EncodeToMemory(&pem.Block{Type: "ENCRYPTED PRIVATE KEY", Bytes: der})
}

func mustMarshalPrivateKeyPEM(t *testing.T, privateKey *ecdsa.PrivateKey) []byte {
	t.Helper()

	der, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		t.Fatalf("x509.MarshalPKCS8PrivateKey returned error: %v", err)
	}
	return pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})
}

func writeTempFile(t *testing.T, dir, name string, contents []byte) string {
	t.Helper()

	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, contents, 0o600); err != nil {
		t.Fatalf("writeTempFile(%s) returned error: %v", name, err)
	}
	return path
}
