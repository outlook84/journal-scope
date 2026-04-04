package journalproxy

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	defaultQueryLimit = 1000
	maxQueryLimit     = 10000
)

var validJournalFieldName = regexp.MustCompile(`^_?[A-Z0-9_]+$`)

type Client struct {
	baseTransport *http.Transport
	httpClient    *http.Client
	streamClient  *http.Client
}

type Header struct {
	Name  string
	Value string
}

type RequestTarget struct {
	BaseURL       *url.URL
	Headers       []Header
	TLSServerName string
}

type LogQuery struct {
	EndTimeUnix *int64
	Limit       int
	Priority    string
	Unit        string
	SyslogID    string
	Hostname    string
	BootID      string
	Comm        string
	Transport   string
	PID         string
	UID         string
	GID         string
	Matches     []FieldMatch
}

type FieldMatch struct {
	Field string
	Value string
}

func NewClient(transport *http.Transport) *Client {
	baseTransport := transport
	if baseTransport == nil {
		baseTransport = &http.Transport{
			Proxy: http.ProxyFromEnvironment,
			DialContext: (&net.Dialer{
				Timeout:   30 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			ForceAttemptHTTP2:     true,
			MaxIdleConns:          100,
			IdleConnTimeout:       90 * time.Second,
			TLSHandshakeTimeout:   10 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
		}
	}

	return &Client{
		baseTransport: baseTransport,
		httpClient: &http.Client{
			Timeout:   30 * time.Second,
			Transport: baseTransport,
		},
		streamClient: &http.Client{Transport: baseTransport.Clone()},
	}
}

func ParseLogQuery(values url.Values) (LogQuery, error) {
	limit := defaultQueryLimit
	if rawLimit := values.Get("limit"); rawLimit != "" {
		parsedLimit, err := strconv.Atoi(rawLimit)
		if err != nil {
			return LogQuery{}, fmt.Errorf("invalid limit: %w", err)
		}
		limit = parsedLimit
	}
	if limit < 1 {
		limit = 1
	}
	if limit > maxQueryLimit {
		limit = maxQueryLimit
	}

	var endTimeUnix *int64
	if rawEndTime := values.Get("end_time"); rawEndTime != "" {
		parsedEndTime, err := strconv.ParseInt(rawEndTime, 10, 64)
		if err != nil {
			return LogQuery{}, fmt.Errorf("invalid end_time: %w", err)
		}
		endTimeUnix = &parsedEndTime
	}

	matches := make([]FieldMatch, 0, len(values["match"]))
	for _, rawMatch := range values["match"] {
		eqIndex := strings.Index(rawMatch, "=")
		if eqIndex <= 0 || eqIndex == len(rawMatch)-1 {
			return LogQuery{}, fmt.Errorf("invalid match: %q", rawMatch)
		}
		field := strings.TrimSpace(rawMatch[:eqIndex])
		value := strings.TrimSpace(rawMatch[eqIndex+1:])
		if field == "" || value == "" {
			return LogQuery{}, fmt.Errorf("invalid match: %q", rawMatch)
		}
		if strings.HasPrefix(field, "__") {
			return LogQuery{}, fmt.Errorf("invalid match field: %s", field)
		}
		if !validJournalFieldName.MatchString(field) {
			return LogQuery{}, fmt.Errorf("invalid match field: %s", field)
		}
		matches = append(matches, FieldMatch{Field: field, Value: value})
	}

	return LogQuery{
		EndTimeUnix: endTimeUnix,
		Limit:       limit,
		Priority:    values.Get("priority"),
		Unit:        values.Get("unit"),
		SyslogID:    values.Get("syslog_id"),
		Hostname:    values.Get("hostname"),
		BootID:      values.Get("boot_id"),
		Comm:        values.Get("comm"),
		Transport:   values.Get("transport"),
		PID:         values.Get("pid"),
		UID:         values.Get("uid"),
		GID:         values.Get("gid"),
		Matches:     matches,
	}, nil
}

func (c *Client) FetchLogs(ctx context.Context, target RequestTarget, query LogQuery) (*http.Response, error) {
	return c.fetchLogsWithRange(ctx, target, query, buildHistoryRange(query))
}

func (c *Client) FetchOldestLogs(ctx context.Context, target RequestTarget, query LogQuery) (*http.Response, error) {
	return c.fetchLogsWithRange(ctx, target, query, buildOldestRange(query))
}

func (c *Client) fetchLogsWithRange(ctx context.Context, target RequestTarget, query LogQuery, rangeHeader string) (*http.Response, error) {
	endpoint := c.buildEntriesURL(target.BaseURL, query, false)
	client := c.clientForTarget(false, target)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Range", rangeHeader)
	applyHeaders(req, target.Headers)
	return client.Do(req)
}

func (c *Client) TailLogs(ctx context.Context, target RequestTarget, query LogQuery, cursor string) (*http.Response, error) {
	endpoint := c.buildEntriesURL(target.BaseURL, query, true)
	client := c.clientForTarget(true, target)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Range", buildTailRange(cursor))
	applyHeaders(req, target.Headers)
	return client.Do(req)
}

func (c *Client) FetchFieldValues(ctx context.Context, target RequestTarget, fieldName string) (*http.Response, error) {
	endpoint := cloneURL(target.BaseURL)
	endpoint.Path = joinPath(endpoint.Path, "fields", fieldName)
	endpoint.RawQuery = ""
	client := c.clientForTarget(false, target)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "text/plain")
	applyHeaders(req, target.Headers)
	return client.Do(req)
}

func applyHeaders(req *http.Request, headers []Header) {
	for _, header := range headers {
		if header.Name == "" || header.Value == "" {
			continue
		}
		req.Header.Set(header.Name, header.Value)
	}
}

func (c *Client) clientForTarget(stream bool, target RequestTarget) *http.Client {
	if target.TLSServerName == "" {
		if stream {
			return c.streamClient
		}
		return c.httpClient
	}

	transport := c.baseTransport.Clone()
	if transport.TLSClientConfig != nil {
		transport.TLSClientConfig = transport.TLSClientConfig.Clone()
	} else {
		transport.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	}
	transport.TLSClientConfig.ServerName = target.TLSServerName

	client := &http.Client{Transport: transport}
	if !stream {
		client.Timeout = 30 * time.Second
	}
	return client
}

func (c *Client) buildEntriesURL(baseURL *url.URL, query LogQuery, follow bool) *url.URL {
	target := cloneURL(baseURL)
	target.Path = joinPath(target.Path, "entries")
	values := buildGatewayFilterQuery(query)
	target.RawQuery = values.Encode()
	if follow {
		if target.RawQuery == "" {
			target.RawQuery = "follow"
		} else {
			target.RawQuery += "&follow"
		}
	}
	return target
}

func buildHistoryRange(query LogQuery) string {
	if query.EndTimeUnix == nil {
		return fmt.Sprintf("entries=:-%d:%d", query.Limit, query.Limit)
	}
	return fmt.Sprintf("realtime=:%d:-%d:%d", *query.EndTimeUnix, query.Limit, query.Limit)
}

func buildOldestRange(query LogQuery) string {
	return fmt.Sprintf("entries=:%d:%d", query.Limit, query.Limit)
}

func buildTailRange(cursor string) string {
	if cursor == "" {
		return "entries=:-1:100"
	}
	return "entries=" + cursor
}

func buildGatewayFilterQuery(query LogQuery) url.Values {
	values := url.Values{}
	if query.Unit != "" {
		values.Set("_SYSTEMD_UNIT", query.Unit)
	}
	if query.SyslogID != "" {
		values.Set("SYSLOG_IDENTIFIER", query.SyslogID)
	}
	if query.Priority != "" {
		values.Set("PRIORITY", query.Priority)
	}
	if query.Hostname != "" {
		values.Set("_HOSTNAME", query.Hostname)
	}
	if query.BootID != "" {
		values.Set("_BOOT_ID", query.BootID)
	}
	if query.Comm != "" {
		values.Set("_COMM", query.Comm)
	}
	if query.Transport != "" {
		values.Set("_TRANSPORT", query.Transport)
	}
	if query.PID != "" {
		values.Set("_PID", query.PID)
	}
	if query.UID != "" {
		values.Set("_UID", query.UID)
	}
	if query.GID != "" {
		values.Set("_GID", query.GID)
	}
	for _, match := range query.Matches {
		if match.Field == "" || match.Value == "" {
			continue
		}
		values.Add(match.Field, match.Value)
	}
	return values
}

func cloneURL(source *url.URL) *url.URL {
	clone := *source
	return &clone
}

func joinPath(parts ...string) string {
	joined := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.Trim(part, "/")
		if trimmed == "" {
			continue
		}
		joined = append(joined, trimmed)
	}
	return "/" + strings.Join(joined, "/")
}
