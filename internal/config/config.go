package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"time"
)

type Config struct {
	ListenAddr            string
	StaticDir             string
	DataDir               string
	ReadHeaderTimeout     time.Duration
	SessionTTL            time.Duration
	CookieSecure          bool
	TrustProxyHeaders     bool
	MasterSecret          string
	BootstrapGatewayURL   *url.URL
	BootstrapAdminCode    string
	BootstrapViewerCode   string
	GatewayCAFile         string
	GatewayClientCertFile string
	GatewayClientKeyFile  string
}

func Load() (Config, error) {
	listenAddr := getenv("JOURNAL_SCOPE_LISTEN_ADDR", "127.0.0.1:3030")
	staticDir := os.Getenv("JOURNAL_SCOPE_STATIC_DIR")
	dataDir := getenv("JOURNAL_SCOPE_DATA_DIR", "data")
	sessionTTLRaw := getenv("JOURNAL_SCOPE_SESSION_TTL", "168h")
	cookieSecure := getenvBool("JOURNAL_SCOPE_COOKIE_SECURE", false)
	trustProxyHeaders := getenvBool("JOURNAL_SCOPE_TRUST_PROXY_HEADERS", false)
	masterSecret := os.Getenv("JOURNAL_SCOPE_MASTER_SECRET")
	gatewayURLRaw := getenv("JOURNAL_SCOPE_BOOTSTRAP_GATEWAY_URL", "http://127.0.0.1:19531")
	bootstrapAdminCode := os.Getenv("JOURNAL_SCOPE_BOOTSTRAP_ADMIN_CODE")
	bootstrapViewerCode := os.Getenv("JOURNAL_SCOPE_BOOTSTRAP_VIEWER_CODE")
	gatewayCAFile := os.Getenv("JOURNAL_SCOPE_GATEWAY_CA_FILE")
	gatewayClientCertFile := os.Getenv("JOURNAL_SCOPE_GATEWAY_CLIENT_CERT_FILE")
	gatewayClientKeyFile := os.Getenv("JOURNAL_SCOPE_GATEWAY_CLIENT_KEY_FILE")

	gatewayURL, err := url.Parse(gatewayURLRaw)
	if err != nil {
		return Config{}, fmt.Errorf("parse JOURNAL_SCOPE_BOOTSTRAP_GATEWAY_URL: %w", err)
	}
	if gatewayURL.Scheme == "" || gatewayURL.Host == "" {
		return Config{}, fmt.Errorf("JOURNAL_SCOPE_BOOTSTRAP_GATEWAY_URL must include scheme and host")
	}

	sessionTTL, err := time.ParseDuration(sessionTTLRaw)
	if err != nil {
		return Config{}, fmt.Errorf("parse JOURNAL_SCOPE_SESSION_TTL: %w", err)
	}
	if sessionTTL <= 0 {
		return Config{}, fmt.Errorf("JOURNAL_SCOPE_SESSION_TTL must be positive")
	}

	return Config{
		ListenAddr:            listenAddr,
		StaticDir:             staticDir,
		DataDir:               dataDir,
		ReadHeaderTimeout:     10 * time.Second,
		SessionTTL:            sessionTTL,
		CookieSecure:          cookieSecure,
		TrustProxyHeaders:     trustProxyHeaders,
		MasterSecret:          masterSecret,
		BootstrapGatewayURL:   gatewayURL,
		BootstrapAdminCode:    bootstrapAdminCode,
		BootstrapViewerCode:   bootstrapViewerCode,
		GatewayCAFile:         gatewayCAFile,
		GatewayClientCertFile: gatewayClientCertFile,
		GatewayClientKeyFile:  gatewayClientKeyFile,
	}, nil
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func getenvBool(key string, fallback bool) bool {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return fallback
	}
	return value
}
