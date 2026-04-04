package main

import (
	"context"
	"net"
	"net/http"
	"testing"
	"time"
)

func TestServeHTTPServerForcesCloseAfterShutdownTimeout(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen() error = %v", err)
	}
	defer listener.Close()

	requestStarted := make(chan struct{})
	releaseHandler := make(chan struct{})
	serverStopped := make(chan error, 1)

	srv := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			close(requestStarted)
			<-releaseHandler
			w.WriteHeader(http.StatusNoContent)
		}),
	}

	shutdownCtx, cancelShutdown := context.WithCancel(context.Background())
	defer cancelShutdown()

	go func() {
		serverStopped <- serveHTTPServer(srv, listener, shutdownCtx, 50*time.Millisecond)
	}()

	clientDone := make(chan struct{})
	go func() {
		defer close(clientDone)
		resp, err := http.Get("http://" + listener.Addr().String())
		if err == nil {
			resp.Body.Close()
		}
	}()

	select {
	case <-requestStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("request did not reach handler")
	}

	cancelShutdown()

	select {
	case err := <-serverStopped:
		if err != nil {
			t.Fatalf("serveHTTPServer() error = %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("serveHTTPServer() did not return after forced close")
	}

	close(releaseHandler)

	select {
	case <-clientDone:
	case <-time.After(2 * time.Second):
		t.Fatal("client request did not finish")
	}
}
