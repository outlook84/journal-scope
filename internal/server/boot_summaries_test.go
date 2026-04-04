package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"journal-scope/internal/config"
	"journal-scope/internal/journalproxy"
	"journal-scope/internal/runtimeconfig"
	"journal-scope/internal/security"
)

func TestBootSummariesEndpointSortsAndCaches(t *testing.T) {
	var fieldRequests atomic.Int32
	var entryRequests atomic.Int32

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/fields/_BOOT_ID":
			fieldRequests.Add(1)
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = w.Write([]byte("boot-old\nboot-new\n"))
		case r.URL.Path == "/entries":
			entryRequests.Add(1)
			w.Header().Set("Content-Type", "application/json")
			switch {
			case r.URL.Query().Get("_BOOT_ID") == "boot-old" && r.Header.Get("Range") == "entries=:1:1":
				_, _ = w.Write([]byte("{\"__REALTIME_TIMESTAMP\":\"050\",\"MESSAGE\":\"boot old start\",\"__CURSOR\":\"cursor-old-first\"}\n"))
			case r.URL.Query().Get("_BOOT_ID") == "boot-old":
				_, _ = w.Write([]byte("{\"__REALTIME_TIMESTAMP\":\"100\",\"MESSAGE\":\"boot old end\",\"__CURSOR\":\"cursor-old-last\"}\n"))
			case r.URL.Query().Get("_BOOT_ID") == "boot-new" && r.Header.Get("Range") == "entries=:1:1":
				_, _ = w.Write([]byte("{\"__REALTIME_TIMESTAMP\":\"150\",\"MESSAGE\":\"boot new start\",\"__CURSOR\":\"cursor-new-first\"}\n"))
			case r.URL.Query().Get("_BOOT_ID") == "boot-new":
				_, _ = w.Write([]byte("{\"__REALTIME_TIMESTAMP\":\"200\",\"MESSAGE\":\"boot new end\",\"__CURSOR\":\"cursor-new-last\"}\n"))
			default:
				http.Error(w, "unexpected boot id", http.StatusBadRequest)
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()

	handler := newAuthedServerHandler(t, upstream.URL)

	first := performBootSummaryRequest(t, handler)
	if len(first) != 2 {
		t.Fatalf("len(first) = %d, want 2", len(first))
	}
	if first[0].BootID != "boot-new" || first[0].FirstSeenRealtimeUsec != "150" || first[0].LastSeenRealtimeUsec != "200" {
		t.Fatalf("first[0] = %+v, want boot-new sorted first", first[0])
	}
	if first[1].BootID != "boot-old" || first[1].FirstSeenRealtimeUsec != "050" || first[1].LastSeenRealtimeUsec != "100" {
		t.Fatalf("first[1] = %+v, want boot-old sorted second", first[1])
	}

	second := performBootSummaryRequest(t, handler)
	if len(second) != 2 {
		t.Fatalf("len(second) = %d, want 2", len(second))
	}

	if got := fieldRequests.Load(); got != 1 {
		t.Fatalf("fieldRequests = %d, want 1", got)
	}
	if got := entryRequests.Load(); got != 4 {
		t.Fatalf("entryRequests = %d, want 4", got)
	}
}

func newAuthedServerHandler(t *testing.T, gatewayURL string) http.Handler {
	t.Helper()

	parsedGatewayURL, err := url.Parse(gatewayURL)
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}

	dataDir := t.TempDir()
	cfg := config.Config{
		DataDir:             dataDir,
		SessionTTL:          time.Hour,
		BootstrapGatewayURL: parsedGatewayURL,
		BootstrapAdminCode:  "admin-code",
		BootstrapViewerCode: "viewer-code",
	}

	store, _, err := runtimeconfig.LoadOrCreate(cfg)
	if err != nil {
		t.Fatalf("LoadOrCreate() error = %v", err)
	}

	sessionManager := security.NewSessionManager("test-secret", time.Hour, false)
	handler, err := New(cfg, store, journalproxy.NewClient(nil), sessionManager, context.Background())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recorder := httptest.NewRecorder()
		if err := sessionManager.SetSession(recorder, security.RoleViewer); err != nil {
			t.Fatalf("SetSession() error = %v", err)
		}
		for _, cookie := range recorder.Result().Cookies() {
			r.AddCookie(cookie)
		}

		targetRecorder := httptest.NewRecorder()
		sessionManager.SetActiveGatewayTarget(targetRecorder, store.DefaultGatewayTargetID())
		for _, cookie := range targetRecorder.Result().Cookies() {
			r.AddCookie(cookie)
		}

		handler.ServeHTTP(w, r)
	})
}

func performBootSummaryRequest(t *testing.T, handler http.Handler) []bootSummary {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, "/api/fields/boot-ids/meta", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}

	var summaries []bootSummary
	if err := json.Unmarshal(recorder.Body.Bytes(), &summaries); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	return summaries
}

func TestParseFieldValueLinesDeduplicatesWithoutSorting(t *testing.T) {
	got := parseFieldValueLines(" boot-b \nboot-a\n\nboot-b\n")
	want := []string{"boot-b", "boot-a"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("parseFieldValueLines() = %v, want %v", got, want)
	}
}

func TestBootSummaryCacheUsesTTL(t *testing.T) {
	cache := newBootSummaryCache(5 * time.Millisecond)
	var loads atomic.Int32

	load := func() ([]bootSummary, error) {
		call := loads.Add(1)
		return []bootSummary{{BootID: "boot", FirstSeenRealtimeUsec: string(rune('0' + call))}}, nil
	}

	first, err := cache.getOrLoad("target-a", load)
	if err != nil {
		t.Fatalf("first getOrLoad() error = %v", err)
	}
	second, err := cache.getOrLoad("target-a", load)
	if err != nil {
		t.Fatalf("second getOrLoad() error = %v", err)
	}
	if loads.Load() != 1 {
		t.Fatalf("loads after cached lookup = %d, want 1", loads.Load())
	}
	if first[0].FirstSeenRealtimeUsec != second[0].FirstSeenRealtimeUsec {
		t.Fatalf("cached values differ: first=%v second=%v", first, second)
	}

	time.Sleep(10 * time.Millisecond)

	third, err := cache.getOrLoad("target-a", load)
	if err != nil {
		t.Fatalf("third getOrLoad() error = %v", err)
	}
	if loads.Load() != 2 {
		t.Fatalf("loads after ttl expiry = %d, want 2", loads.Load())
	}
	if third[0].FirstSeenRealtimeUsec == second[0].FirstSeenRealtimeUsec {
		t.Fatalf("expected refreshed cache value after ttl expiry, got %v", third)
	}
}
