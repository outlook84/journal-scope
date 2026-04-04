package server

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"journal-scope/internal/journalproxy"
)

const bootSummaryCacheTTL = 30 * time.Second

type bootSummary struct {
	BootID                  string `json:"bootId"`
	FirstSeenRealtimeUsec   string `json:"firstSeenRealtimeUsec"`
	FirstSeenCursor         string `json:"firstSeenCursor,omitempty"`
	FirstSeenMessagePreview string `json:"firstSeenMessagePreview,omitempty"`
	LastSeenRealtimeUsec    string `json:"lastSeenRealtimeUsec"`
	LastSeenCursor          string `json:"lastSeenCursor,omitempty"`
	LastSeenMessagePreview  string `json:"lastSeenMessagePreview,omitempty"`
}

type bootSummaryCache struct {
	ttl     time.Duration
	mu      sync.Mutex
	entries map[string]*bootSummaryCacheEntry
}

type bootSummaryCacheEntry struct {
	expiresAt time.Time
	summaries []bootSummary
	err       error
	loading   bool
	waitCh    chan struct{}
}

func newBootSummaryCache(ttl time.Duration) *bootSummaryCache {
	return &bootSummaryCache{
		ttl:     ttl,
		entries: make(map[string]*bootSummaryCacheEntry),
	}
}

func (c *bootSummaryCache) getOrLoad(key string, loader func() ([]bootSummary, error)) ([]bootSummary, error) {
	for {
		c.mu.Lock()
		entry, ok := c.entries[key]
		now := time.Now().UTC()

		if ok && !entry.loading && now.Before(entry.expiresAt) {
			summaries := append([]bootSummary(nil), entry.summaries...)
			err := entry.err
			c.mu.Unlock()
			return summaries, err
		}

		if ok && entry.loading {
			waitCh := entry.waitCh
			c.mu.Unlock()
			<-waitCh
			continue
		}

		waitCh := make(chan struct{})
		c.entries[key] = &bootSummaryCacheEntry{loading: true, waitCh: waitCh}
		c.mu.Unlock()

		summaries, err := loader()

		c.mu.Lock()
		c.entries[key] = &bootSummaryCacheEntry{
			expiresAt: now.Add(c.ttl),
			summaries: append([]bootSummary(nil), summaries...),
			err:       err,
		}
		close(waitCh)
		c.mu.Unlock()

		return summaries, err
	}
}

func parseFieldValueLines(text string) []string {
	if text == "" {
		return nil
	}

	seen := make(map[string]struct{})
	values := make([]string, 0)
	for _, line := range strings.Split(text, "\n") {
		value := strings.TrimSpace(line)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		values = append(values, value)
	}
	return values
}

func parseBootAnchor(body io.Reader, bootID string) (bootSummary, error) {
	scanner := bufio.NewScanner(body)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var payload struct {
			RealtimeTimestamp string `json:"__REALTIME_TIMESTAMP"`
			Cursor            string `json:"__CURSOR"`
			Message           any    `json:"MESSAGE"`
		}
		if err := json.Unmarshal([]byte(line), &payload); err != nil {
			return bootSummary{}, fmt.Errorf("decode latest boot log: %w", err)
		}

		return bootSummary{
			BootID:                  bootID,
			FirstSeenRealtimeUsec:   strings.TrimSpace(payload.RealtimeTimestamp),
			FirstSeenCursor:         strings.TrimSpace(payload.Cursor),
			FirstSeenMessagePreview: summarizeMessage(payload.Message),
		}, nil
	}
	if err := scanner.Err(); err != nil {
		return bootSummary{}, fmt.Errorf("scan latest boot log: %w", err)
	}

	return bootSummary{BootID: bootID}, nil
}

func summarizeMessage(message any) string {
	switch value := message.(type) {
	case string:
		return value
	case nil:
		return ""
	default:
		raw, err := json.Marshal(value)
		if err != nil {
			return ""
		}
		return string(raw)
	}
}

func (s *Server) loadBootSummaries(ctx context.Context, target resolvedGatewayTarget) ([]bootSummary, error) {
	resp, err := s.journal.FetchFieldValues(ctx, journalproxy.RequestTarget{
		BaseURL:       target.BaseURL,
		Headers:       target.Headers,
		TLSServerName: target.TLSServerName,
	}, "_BOOT_ID")
	if err != nil {
		return nil, fmt.Errorf("fetch boot ids: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("fetch boot ids: upstream HTTP %d", resp.StatusCode)
	}

	rawValues, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read boot ids: %w", err)
	}
	bootIDs := parseFieldValueLines(string(rawValues))
	summaries := make([]bootSummary, 0, len(bootIDs))

	for _, bootID := range bootIDs {
		oldestResp, err := s.journal.FetchOldestLogs(ctx, journalproxy.RequestTarget{
			BaseURL:       target.BaseURL,
			Headers:       target.Headers,
			TLSServerName: target.TLSServerName,
		}, journalproxy.LogQuery{
			Limit:  1,
			BootID: bootID,
		})
		if err != nil {
			return nil, fmt.Errorf("fetch first log for boot %s: %w", bootID, err)
		}

		summary := bootSummary{BootID: bootID}
		if oldestResp.StatusCode >= 200 && oldestResp.StatusCode < 300 {
			summary, err = parseBootAnchor(oldestResp.Body, bootID)
			oldestResp.Body.Close()
			if err != nil {
				return nil, err
			}
		} else {
			oldestResp.Body.Close()
			return nil, fmt.Errorf("fetch first log for boot %s: upstream HTTP %d", bootID, oldestResp.StatusCode)
		}

		latestResp, err := s.journal.FetchLogs(ctx, journalproxy.RequestTarget{
			BaseURL:       target.BaseURL,
			Headers:       target.Headers,
			TLSServerName: target.TLSServerName,
		}, journalproxy.LogQuery{
			Limit:  1,
			BootID: bootID,
		})
		if err != nil {
			return nil, fmt.Errorf("fetch latest log for boot %s: %w", bootID, err)
		}

		if latestResp.StatusCode >= 200 && latestResp.StatusCode < 300 {
			latest, err := parseBootAnchor(latestResp.Body, bootID)
			latestResp.Body.Close()
			if err != nil {
				return nil, err
			}
			summary.LastSeenRealtimeUsec = latest.FirstSeenRealtimeUsec
			summary.LastSeenCursor = latest.FirstSeenCursor
			summary.LastSeenMessagePreview = latest.FirstSeenMessagePreview
		} else {
			latestResp.Body.Close()
			return nil, fmt.Errorf("fetch latest log for boot %s: upstream HTTP %d", bootID, latestResp.StatusCode)
		}

		summaries = append(summaries, summary)
	}

	slices.SortStableFunc(summaries, func(a, b bootSummary) int {
		if a.FirstSeenRealtimeUsec != b.FirstSeenRealtimeUsec {
			if a.FirstSeenRealtimeUsec > b.FirstSeenRealtimeUsec {
				return -1
			}
			return 1
		}
		return strings.Compare(a.BootID, b.BootID)
	})

	return summaries, nil
}

func (s *Server) handleBootSummaries(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	target, err := s.gatewayTargetForRequest(r)
	if err != nil {
		s.logErrorf(r, "/api/fields/boot-ids/meta", "boot summaries fetch failed: invalid runtime gateway err=%v", err)
		http.Error(w, "invalid runtime gateway url", http.StatusInternalServerError)
		return
	}

	cacheKey := s.activeGatewayTargetID(r)
	if cacheKey == "" {
		cacheKey = target.BaseURL.String()
	}

	summaries, err := s.bootSummaryCache.getOrLoad(cacheKey, func() ([]bootSummary, error) {
		return s.loadBootSummaries(r.Context(), target)
	})
	if err != nil {
		s.logWarnf(r, "/api/fields/boot-ids/meta", "boot summaries fetch failed target=%s err=%v", redactURLForLog(target.BaseURL), err)
		http.Error(w, fmt.Sprintf("fetch boot summaries: %v", err), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, summaries)
}
