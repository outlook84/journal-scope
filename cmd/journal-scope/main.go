package main

import (
	"log"
	"net/http"

	"journal-scope/internal/config"
	"journal-scope/internal/gatewaytls"
	"journal-scope/internal/journalproxy"
	"journal-scope/internal/runtimeconfig"
	"journal-scope/internal/security"
	"journal-scope/internal/server"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	store, bootstrap, err := runtimeconfig.LoadOrCreate(cfg)
	if err != nil {
		log.Fatalf("load runtime config: %v", err)
	}

	if bootstrap.Created {
		log.Printf("initialized runtime config in %s", cfg.DataDir)
		if bootstrap.GeneratedAdminCode != "" {
			log.Printf("generated admin access code: %s", bootstrap.GeneratedAdminCode)
		}
		if bootstrap.GeneratedViewerCode != "" {
			log.Printf("generated viewer access code: %s", bootstrap.GeneratedViewerCode)
		}
	}
	if bootstrap.RegeneratedAdminCode != "" {
		log.Printf("regenerated admin access code because admin_code_hash was empty: %s", bootstrap.RegeneratedAdminCode)
	}

	sessionSecret := store.SessionSecret()
	if sessionSecret == "" {
		log.Fatalf("derive session secret: empty result")
	}

	gatewayTLSConfig, err := gatewaytls.BuildTLSConfig(cfg, store.MasterSecret())
	if err != nil {
		log.Fatalf("build gateway TLS config: %v", err)
	}
	var transport *http.Transport
	if gatewayTLSConfig != nil {
		transport = http.DefaultTransport.(*http.Transport).Clone()
		transport.TLSClientConfig = gatewayTLSConfig
	}

	proxyClient := journalproxy.NewClient(transport)
	sessionManager := security.NewSessionManager(sessionSecret, cfg.SessionTTL, cfg.CookieSecure)
	handler, err := server.New(cfg, store, proxyClient, sessionManager)
	if err != nil {
		log.Fatalf("build server: %v", err)
	}
	defaultTarget, ok := store.ResolveGatewayTarget(store.DefaultGatewayTargetID())
	if !ok {
		log.Fatalf("resolve default gateway target: missing default target %q", store.DefaultGatewayTargetID())
	}

	log.Printf("journal-scope listening on http://%s", cfg.ListenAddr)
	log.Printf("proxying journal requests to %s", defaultTarget.URL)
	if cfg.TrustProxyHeaders {
		log.Printf("warning: JOURNAL_SCOPE_TRUST_PROXY_HEADERS=true; only enable this behind a trusted reverse proxy that overwrites X-Forwarded-For")
	}

	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           handler,
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
	}

	log.Fatal(srv.ListenAndServe())
}
