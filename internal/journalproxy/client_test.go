package journalproxy

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestParseLogQueryClampsAndMapsValues(t *testing.T) {
	values := url.Values{
		"limit":     []string{"20000"},
		"end_time":  []string{"1704067200"},
		"priority":  []string{"3"},
		"unit":      []string{"nginx.service"},
		"syslog_id": []string{"kernel"},
		"hostname":  []string{"host-a"},
		"boot_id":   []string{"boot-1"},
		"comm":      []string{"systemd"},
		"transport": []string{"stdout"},
		"pid":       []string{"123"},
		"uid":       []string{"1000"},
		"gid":       []string{"1000"},
		"match":     []string{"MESSAGE=boom", "_EXE=/usr/bin/sshd"},
	}

	query, err := ParseLogQuery(values)
	if err != nil {
		t.Fatalf("ParseLogQuery() error = %v", err)
	}

	if query.Limit != maxQueryLimit {
		t.Fatalf("Limit = %d, want %d", query.Limit, maxQueryLimit)
	}
	if query.EndTimeUnix == nil || *query.EndTimeUnix != 1704067200 {
		t.Fatalf("EndTimeUnix = %v, want 1704067200", query.EndTimeUnix)
	}
	if query.Unit != "nginx.service" || query.SyslogID != "kernel" || query.Priority != "3" {
		t.Fatalf("unexpected parsed query: %+v", query)
	}
	if query.Hostname != "host-a" || query.BootID != "boot-1" || query.Comm != "systemd" {
		t.Fatalf("unexpected parsed query: %+v", query)
	}
	if query.Transport != "stdout" || query.PID != "123" || query.UID != "1000" || query.GID != "1000" {
		t.Fatalf("unexpected parsed query: %+v", query)
	}
	if len(query.Matches) != 2 || query.Matches[0].Field != "MESSAGE" || query.Matches[0].Value != "boom" {
		t.Fatalf("unexpected parsed matches: %+v", query.Matches)
	}
}

func TestParseLogQueryDefaultsAndRejectsInvalidValues(t *testing.T) {
	query, err := ParseLogQuery(url.Values{
		"limit": []string{"0"},
	})
	if err != nil {
		t.Fatalf("ParseLogQuery() error = %v", err)
	}
	if query.Limit != 1 {
		t.Fatalf("Limit = %d, want 1", query.Limit)
	}

	query, err = ParseLogQuery(url.Values{})
	if err != nil {
		t.Fatalf("ParseLogQuery() error = %v", err)
	}
	if query.Limit != defaultQueryLimit {
		t.Fatalf("Limit = %d, want %d", query.Limit, defaultQueryLimit)
	}

	if _, err := ParseLogQuery(url.Values{"limit": []string{"abc"}}); err == nil {
		t.Fatalf("ParseLogQuery() error = nil, want invalid limit")
	}
	if _, err := ParseLogQuery(url.Values{"end_time": []string{"abc"}}); err == nil {
		t.Fatalf("ParseLogQuery() error = nil, want invalid end_time")
	}
	if _, err := ParseLogQuery(url.Values{"match": []string{"MESSAGE"}}); err == nil {
		t.Fatalf("ParseLogQuery() error = nil, want invalid match")
	}
	if _, err := ParseLogQuery(url.Values{"match": []string{"__CURSOR=abc"}}); err == nil {
		t.Fatalf("ParseLogQuery() error = nil, want invalid match field")
	}
	if _, err := ParseLogQuery(url.Values{"match": []string{"message=abc"}}); err == nil {
		t.Fatalf("ParseLogQuery() error = nil, want invalid lowercase match field")
	}
	if _, err := ParseLogQuery(url.Values{"match": []string{"TRACE-ID=abc"}}); err == nil {
		t.Fatalf("ParseLogQuery() error = nil, want invalid punctuation in match field")
	}
}

func TestBuildEntriesURLAndHelpers(t *testing.T) {
	baseURL, err := url.Parse("https://gateway.example/api/")
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}

	client := NewClient(nil)
	endTime := int64(42)
	target := client.buildEntriesURL(baseURL, LogQuery{
		EndTimeUnix: &endTime,
		Limit:       50,
		Unit:        "sshd.service",
		SyslogID:    "sshd",
		Matches: []FieldMatch{
			{Field: "MESSAGE", Value: "boom"},
			{Field: "_EXE", Value: "/usr/bin/sshd"},
		},
	}, true)

	if target.Path != "/api/entries" {
		t.Fatalf("Path = %q, want /api/entries", target.Path)
	}
	if target.Query().Get("_SYSTEMD_UNIT") != "sshd.service" {
		t.Fatalf("unit query = %q, want sshd.service", target.Query().Get("_SYSTEMD_UNIT"))
	}
	if target.Query().Get("SYSLOG_IDENTIFIER") != "sshd" {
		t.Fatalf("syslog query = %q, want sshd", target.Query().Get("SYSLOG_IDENTIFIER"))
	}
	if target.Query().Get("MESSAGE") != "boom" {
		t.Fatalf("MESSAGE query = %q, want boom", target.Query().Get("MESSAGE"))
	}
	if target.Query().Get("_EXE") != "/usr/bin/sshd" {
		t.Fatalf("_EXE query = %q, want /usr/bin/sshd", target.Query().Get("_EXE"))
	}
	if target.Query().Get("follow") != "" {
		t.Fatalf("follow query = %q, want empty value flag", target.Query().Get("follow"))
	}
	if target.RawQuery[len(target.RawQuery)-6:] != "follow" {
		t.Fatalf("RawQuery = %q, want follow flag suffix", target.RawQuery)
	}

	if buildHistoryRange(LogQuery{Limit: 25}) != "entries=:-25:25" {
		t.Fatalf("unexpected history range without end time")
	}
	if buildHistoryRange(LogQuery{EndTimeUnix: &endTime, Limit: 25}) != "realtime=:42:-25:25" {
		t.Fatalf("unexpected history range with end time")
	}
	if buildOldestRange(LogQuery{Limit: 25}) != "entries=:25:25" {
		t.Fatalf("unexpected oldest range")
	}
	if buildTailRange("") != "entries=:-1:100" {
		t.Fatalf("unexpected tail range for empty cursor")
	}
	if buildTailRange("cursor:1") != "entries=cursor:1" {
		t.Fatalf("unexpected tail range for cursor")
	}
	if joinPath("/api/", "/entries/", "") != "/api/entries" {
		t.Fatalf("joinPath returned unexpected value")
	}
}

func TestValidateBaseURLRejectsUnsafeTargets(t *testing.T) {
	testCases := []struct {
		name   string
		rawURL string
		want   string
	}{
		{name: "nil", want: "required"},
		{name: "relative", rawURL: "/api", want: "absolute"},
		{name: "unsupported scheme", rawURL: "ftp://gateway.example.com", want: "http or https"},
		{name: "userinfo", rawURL: "https://user:pass@gateway.example.com", want: "user info"},
		{name: "fragment", rawURL: "https://gateway.example.com/api#frag", want: "fragment"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			var parsed *url.URL
			if tc.rawURL != "" {
				var err error
				parsed, err = url.Parse(tc.rawURL)
				if err != nil {
					t.Fatalf("url.Parse() error = %v", err)
				}
			}
			err := ValidateBaseURL(parsed)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("ValidateBaseURL() error = %v, want substring %q", err, tc.want)
			}
		})
	}
}

func TestFetchLogsRejectsUnsafeTargetBeforeNetworkRequest(t *testing.T) {
	client := NewClient(nil)
	targetURL, err := url.Parse("ftp://gateway.example.com")
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}

	_, err = client.FetchLogs(context.Background(), RequestTarget{BaseURL: targetURL}, LogQuery{Limit: 1})
	if err == nil || !strings.Contains(err.Error(), "http or https") {
		t.Fatalf("FetchLogs() error = %v, want unsupported scheme error", err)
	}
}

func TestProbeGatewayReturnsIdentity(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/machine" {
			t.Fatalf("Path = %q, want /machine", r.URL.Path)
		}
		if got := r.Header.Get("Accept"); got != "application/json" {
			t.Fatalf("Accept = %q, want application/json", got)
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = io.WriteString(w, `{"machine_id":"machine-1","boot_id":"boot-1","hostname":"host-1","cutoff_from_realtime":"1","cutoff_to_realtime":"2"}`)
	}))
	defer upstream.Close()

	targetURL, err := url.Parse(upstream.URL)
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}

	identity, err := NewClient(nil).ProbeGateway(context.Background(), RequestTarget{BaseURL: targetURL})
	if err != nil {
		t.Fatalf("ProbeGateway() error = %v", err)
	}
	if identity.Hostname != "host-1" || identity.MachineID != "machine-1" {
		t.Fatalf("unexpected identity: %+v", identity)
	}
}

func TestProbeGatewayRejectsNonGatewayResponse(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"hostname":"host-1"}`)
	}))
	defer upstream.Close()

	targetURL, err := url.Parse(upstream.URL)
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}

	_, err = NewClient(nil).ProbeGateway(context.Background(), RequestTarget{BaseURL: targetURL})
	if err == nil || !strings.Contains(err.Error(), "machine_id") {
		t.Fatalf("ProbeGateway() error = %v, want missing machine_id error", err)
	}
}
