package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	journalscope "journal-scope"
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

	shutdownCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

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
	handler, err := server.New(cfg, store, proxyClient, sessionManager, shutdownCtx)
	if err != nil {
		log.Fatalf("build server: %v", err)
	}
	defaultTarget, ok := store.ResolveGatewayTarget(store.DefaultGatewayTargetID())
	if !ok {
		log.Fatalf("resolve default gateway target: missing default target %q", store.DefaultGatewayTargetID())
	}

	log.Printf("journal-scope listening on http://%s", cfg.ListenAddr)
	log.Printf("journal-scope version %s", journalscope.Version)
	log.Printf("proxying journal requests to %s", defaultTarget.URL)
	if cfg.TrustProxyHeaders {
		log.Printf("warning: JOURNAL_SCOPE_TRUST_PROXY_HEADERS=true; only enable this behind a trusted reverse proxy that overwrites X-Forwarded-For")
	}

	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           handler,
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
	}

	if err := serveHTTPServer(srv, nil, shutdownCtx, 10*time.Second); err != nil {
		log.Fatal(err)
	}
}

func serveHTTPServer(srv *http.Server, listener net.Listener, shutdownCtx context.Context, drainTimeout time.Duration) error {
	serveErrCh := make(chan error, 1)
	go func() {
		if listener != nil {
			serveErrCh <- srv.Serve(listener)
			return
		}
		serveErrCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-serveErrCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return errors.New("serve http: " + err.Error())
		}
		return nil
	case <-shutdownCtx.Done():
		log.Printf("received shutdown signal, stopping server")
	}

	drainCtx, cancel := context.WithTimeout(context.Background(), drainTimeout)
	defer cancel()

	if err := srv.Shutdown(drainCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Printf("graceful shutdown did not finish cleanly: %v", err)
		if closeErr := srv.Close(); closeErr != nil && !errors.Is(closeErr, http.ErrServerClosed) {
			return errors.New("force close server: " + closeErr.Error())
		}
	}

	if err := <-serveErrCh; err != nil && !errors.Is(err, http.ErrServerClosed) {
		return errors.New("serve http after shutdown: " + err.Error())
	}

	log.Printf("journal-scope stopped")
	return nil
}
