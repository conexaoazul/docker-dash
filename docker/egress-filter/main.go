// dd-egress-proxy — Docker Dash Outbound Network Filter sidecar (v6.7-alpha.2)
//
// Design: see docs/planning/v6.7/outbound-filter/02-deep-spec.md §§3-5.
//
// Accepts TCP connections, peeks at the first packet to extract the
// destination hostname (TLS SNI or HTTP Host header), compares it to the
// per-container allowlist from policy.json, and either splices the
// connection to the real destination or resets.
//
// No TLS decryption. No cert injection. The filtered container sees the
// destination's real cert, never our own.
//
// In alpha.2 the sidecar runs standalone (reached via HTTP_PROXY env, or
// manual iptables redirect from the user). The egress-runner.js helper
// lands in rc1.
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// ─── Config ──────────────────────────────────────────

type listenerCfg struct {
	addr       string
	policyPath string
	metricsAddr string
	blockLogPath string
}

func loadCfg() listenerCfg {
	return listenerCfg{
		addr:         envOr("DD_EGRESS_LISTEN", ":29193"),
		policyPath:   envOr("DD_EGRESS_POLICY_PATH", "/etc/dd-egress/policy.json"),
		metricsAddr:  envOr("DD_EGRESS_METRICS_LISTEN", ""),  // empty → disabled
		blockLogPath: envOr("DD_EGRESS_BLOCKLOG_PATH", "/var/log/dd-egress/denied.log"),
	}
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

// ─── Policy ──────────────────────────────────────────

// Policy is the on-disk shape written by Docker Dash on every create/update.
// Keeping it minimal: one flat allowlist for the whole sidecar. If we need
// per-container policies later, the keyed-by-source-IP shape is a superset.
type Policy struct {
	Version    int      `json:"version"`
	Mode       string   `json:"mode"` // "enforce" | "audit-only"
	Allowlist  []string `json:"allowlist"`
	UpdatedAt  string   `json:"updated_at"`
}

var policy atomic.Pointer[Policy]

// IMDS endpoints are ALWAYS blocked (deep-spec §13 decision 7).
var imdsEndpoints = map[string]struct{}{
	"169.254.169.254":           {},
	"metadata.google.internal":  {},
	"169.254.170.2":             {}, // ECS task role
}

func loadPolicy(path string) (*Policy, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var p Policy
	if err := json.NewDecoder(f).Decode(&p); err != nil {
		return nil, fmt.Errorf("parse policy: %w", err)
	}
	if p.Mode == "" {
		p.Mode = "enforce"
	}
	// Lower-case for case-insensitive matching.
	for i, h := range p.Allowlist {
		p.Allowlist[i] = strings.ToLower(strings.TrimSpace(h))
	}
	return &p, nil
}

// matchAllowlist returns true if hostname is allowed by current policy.
// Supports exact match and leading-wildcard (*.example.com matches a.example.com, a.b.example.com).
func matchAllowlist(allowlist []string, hostname string) bool {
	h := strings.ToLower(strings.TrimSpace(hostname))
	if h == "" {
		return false
	}
	// Strip port if present
	if i := strings.Index(h, ":"); i != -1 {
		h = h[:i]
	}
	for _, entry := range allowlist {
		if entry == h {
			return true
		}
		if strings.HasPrefix(entry, "*.") {
			suffix := entry[1:]  // ".example.com"
			if strings.HasSuffix(h, suffix) && len(h) > len(suffix) {
				return true
			}
			// Also match bare suffix (example.com matches *.example.com)
			if h == suffix[1:] {
				return true
			}
		}
	}
	return false
}

func isIMDS(host string) bool {
	h := strings.ToLower(strings.TrimSpace(host))
	if i := strings.Index(h, ":"); i != -1 {
		h = h[:i]
	}
	_, ok := imdsEndpoints[h]
	return ok
}

// ─── Peek the first packet ─────────────────────────

// peekHostname reads up to 2KB from r, tries to extract a hostname, and
// returns (hostname, consumed_bytes, error).
//
// Detection order:
//   1. TLS ClientHello SNI (first byte 0x16, 0x17, 0x15, 0x14 = TLS record)
//   2. HTTP plaintext Host header
//   3. HTTP CONNECT <host:port>
//   4. Fallback: empty → caller decides (block unless in audit-only)
func peekHostname(r *bufio.Reader) (string, []byte, error) {
	peek, err := r.Peek(5)
	if err != nil && !errors.Is(err, io.EOF) {
		return "", nil, err
	}

	// TLS ClientHello: record type 0x16, version 0x03xx
	if len(peek) >= 5 && peek[0] == 0x16 && peek[1] == 0x03 {
		recordLen := int(peek[3])<<8 | int(peek[4])
		if recordLen > 16384 {
			return "", nil, errors.New("tls record too large")
		}
		full, err := r.Peek(5 + recordLen)
		if err != nil {
			// Not enough data yet. Settle for what we have.
			full, _ = r.Peek(r.Buffered())
		}
		host := parseSNI(full)
		if host != "" {
			return host, nil, nil
		}
		return "", nil, errors.New("tls without SNI")
	}

	// HTTP plaintext: look for "GET ", "POST ", "HEAD ", "CONNECT " etc.
	peek16, _ := r.Peek(16)
	if looksLikeHTTP(peek16) {
		// Read up to 4KB (HTTP headers). Do NOT consume — we'll splice after.
		big, _ := r.Peek(4096)
		host := parseHTTPHost(big)
		if host != "" {
			return host, nil, nil
		}
		return "", nil, errors.New("http without Host header")
	}

	return "", nil, errors.New("unknown protocol")
}

func looksLikeHTTP(b []byte) bool {
	if len(b) < 4 {
		return false
	}
	for _, m := range []string{"GET ", "POST", "HEAD", "PUT ", "DELE", "CONN", "PATC", "OPTI"} {
		if bytes.HasPrefix(b, []byte(m)) {
			return true
		}
	}
	return false
}

func parseHTTPHost(b []byte) string {
	// First line = request line. CONNECT host:port HTTP/1.1
	lineEnd := bytes.Index(b, []byte("\r\n"))
	if lineEnd < 0 {
		return ""
	}
	line := string(b[:lineEnd])
	parts := strings.Fields(line)
	if len(parts) >= 2 && strings.EqualFold(parts[0], "CONNECT") {
		return parts[1]
	}
	// Otherwise scan headers for Host:
	rest := b[lineEnd+2:]
	for {
		i := bytes.Index(rest, []byte("\r\n"))
		if i < 0 {
			break
		}
		header := string(rest[:i])
		if strings.HasPrefix(strings.ToLower(header), "host:") {
			return strings.TrimSpace(header[5:])
		}
		if header == "" {
			break
		}
		rest = rest[i+2:]
	}
	return ""
}

// parseSNI extracts server_name from a (partial) TLS ClientHello.
// Returns "" if not present or parse fails.
func parseSNI(data []byte) string {
	// skip 5-byte record header
	if len(data) < 5+4 {
		return ""
	}
	body := data[5:]
	// handshake type (1 byte) + length (3 bytes)
	if len(body) < 4 || body[0] != 0x01 {
		return ""
	}
	// ClientHello: client_version (2) + random (32) + session_id_length (1) + session_id (var) + ...
	p := body[4:]
	if len(p) < 34 {
		return ""
	}
	p = p[34:]
	if len(p) < 1 {
		return ""
	}
	sessLen := int(p[0])
	p = p[1:]
	if len(p) < sessLen {
		return ""
	}
	p = p[sessLen:]
	// cipher_suites length (2) + cipher_suites
	if len(p) < 2 {
		return ""
	}
	csLen := int(p[0])<<8 | int(p[1])
	p = p[2:]
	if len(p) < csLen {
		return ""
	}
	p = p[csLen:]
	// compression_methods length (1) + compression_methods
	if len(p) < 1 {
		return ""
	}
	cmLen := int(p[0])
	p = p[1:]
	if len(p) < cmLen {
		return ""
	}
	p = p[cmLen:]
	// extensions length (2) + extensions
	if len(p) < 2 {
		return ""
	}
	extLen := int(p[0])<<8 | int(p[1])
	p = p[2:]
	if len(p) < extLen {
		return ""
	}
	ext := p[:extLen]
	// Walk extensions looking for type 0x00 (server_name)
	for len(ext) >= 4 {
		t := int(ext[0])<<8 | int(ext[1])
		l := int(ext[2])<<8 | int(ext[3])
		ext = ext[4:]
		if len(ext) < l {
			return ""
		}
		data := ext[:l]
		ext = ext[l:]
		if t != 0x00 {
			continue
		}
		// server_name_list length (2) + list
		if len(data) < 2 {
			return ""
		}
		// data[2] = type (0 = host_name)
		if len(data) < 5 {
			return ""
		}
		nameLen := int(data[3])<<8 | int(data[4])
		if len(data) < 5+nameLen {
			return ""
		}
		return string(data[5 : 5+nameLen])
	}
	return ""
}

// ─── Forwarding ────────────────────────────────────

// handleConn reads first packet, extracts hostname, checks allowlist, and
// forwards to the real destination if permitted.
func handleConn(ctx context.Context, client net.Conn, metrics *metrics) {
	defer client.Close()
	_ = client.SetDeadline(time.Now().Add(30 * time.Second))

	br := bufio.NewReaderSize(client, 8192)
	host, _, err := peekHostname(br)
	if err != nil {
		metrics.denied.Add(1)
		logDenied("unknown", 0, "protocol", err)
		return
	}

	// Strip port from host for the allow check (we re-add for dialing)
	dialHost := host
	port := "443"
	if i := strings.Index(host, ":"); i != -1 {
		port = host[i+1:]
		host = host[:i]
	} else {
		dialHost = host + ":" + port
	}

	p := policy.Load()
	mode := "enforce"
	allowed := false
	reason := ""
	switch {
	case p == nil:
		reason = "no policy loaded"
	case isIMDS(host):
		reason = "imds-pin"
	case matchAllowlist(p.Allowlist, host):
		allowed = true
	default:
		reason = "not-in-allowlist"
	}
	if p != nil {
		mode = p.Mode
	}

	if !allowed && mode == "enforce" {
		metrics.denied.Add(1)
		logDenied(host, port, reason, nil)
		if tcp, ok := client.(*net.TCPConn); ok {
			_ = tcp.SetLinger(0)
		}
		return
	}
	if !allowed && mode == "audit-only" {
		metrics.auditOnly.Add(1)
		logDenied(host, port, reason+" (audit-only — not blocked)", nil)
		// fall through to forward
	}
	metrics.allowed.Add(1)

	// Dial the real destination.
	dialCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var d net.Dialer
	upstream, err := d.DialContext(dialCtx, "tcp", dialHost)
	if err != nil {
		metrics.upstreamError.Add(1)
		logDenied(host, port, "upstream-dial-failed: "+err.Error(), nil)
		return
	}
	defer upstream.Close()

	// Replay the peeked buffer, then bidirectional copy.
	_ = client.SetDeadline(time.Time{})  // clear
	_ = upstream.SetDeadline(time.Time{})
	if buffered := br.Buffered(); buffered > 0 {
		peeked, _ := br.Peek(buffered)
		if _, werr := upstream.Write(peeked); werr != nil {
			return
		}
		_, _ = br.Discard(buffered)
	}

	done := make(chan struct{}, 2)
	go func() { _, _ = io.Copy(upstream, br); done <- struct{}{} }()
	go func() { _, _ = io.Copy(client, upstream); done <- struct{}{} }()
	<-done
}

// ─── Denied log ────────────────────────────────────

var (
	denyLogMu sync.Mutex
	denyLog   *os.File
)

func openDenyLog(path string) {
	denyLogMu.Lock()
	defer denyLogMu.Unlock()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		log.Printf("denylog mkdir: %v", err)
		return
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		log.Printf("denylog open: %v", err)
		return
	}
	denyLog = f
}

func logDenied(host, port interface{}, reason string, extraErr error) {
	line := fmt.Sprintf("%s host=%v port=%v reason=%s", time.Now().UTC().Format(time.RFC3339), host, port, reason)
	if extraErr != nil {
		line += " err=" + extraErr.Error()
	}
	line += "\n"
	log.Print(line)  // stderr
	denyLogMu.Lock()
	defer denyLogMu.Unlock()
	if denyLog != nil {
		_, _ = denyLog.WriteString(line)
	}
}

// ─── Metrics ───────────────────────────────────────

type metrics struct {
	allowed       atomic.Uint64
	denied        atomic.Uint64
	auditOnly     atomic.Uint64
	upstreamError atomic.Uint64
	reloads       atomic.Uint64
}

func (m *metrics) serveMetrics(addr string) {
	mux := http.NewServeMux()
	mux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		fmt.Fprintf(w, "dd_egress_connections_allowed_total %d\n", m.allowed.Load())
		fmt.Fprintf(w, "dd_egress_connections_blocked_total %d\n", m.denied.Load())
		fmt.Fprintf(w, "dd_egress_connections_audit_only_total %d\n", m.auditOnly.Load())
		fmt.Fprintf(w, "dd_egress_upstream_errors_total %d\n", m.upstreamError.Load())
		fmt.Fprintf(w, "dd_egress_policy_reloads_total %d\n", m.reloads.Load())
	})
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		p := policy.Load()
		if p == nil {
			http.Error(w, "no policy loaded", http.StatusServiceUnavailable)
			return
		}
		fmt.Fprintf(w, "ok policy_v%d allowlist=%d mode=%s", p.Version, len(p.Allowlist), p.Mode)
	})
	log.Printf("metrics server: %s", addr)
	_ = http.ListenAndServe(addr, mux)
}

// ─── Main ──────────────────────────────────────────

func main() {
	cfg := loadCfg()
	log.SetOutput(os.Stderr)
	log.Printf("dd-egress-proxy starting: listen=%s policy=%s", cfg.addr, cfg.policyPath)

	m := &metrics{}

	// Initial policy load (fail fast — refuse to start without policy)
	p, err := loadPolicy(cfg.policyPath)
	if err != nil {
		log.Fatalf("initial policy load failed: %v", err)
	}
	policy.Store(p)
	log.Printf("loaded policy v%d mode=%s allowlist=%d", p.Version, p.Mode, len(p.Allowlist))

	openDenyLog(cfg.blockLogPath)

	// SIGHUP handler
	hup := make(chan os.Signal, 1)
	signal.Notify(hup, syscall.SIGHUP)
	go func() {
		for range hup {
			np, err := loadPolicy(cfg.policyPath)
			if err != nil {
				log.Printf("reload failed, keeping old policy: %v", err)
				continue
			}
			policy.Store(np)
			m.reloads.Add(1)
			log.Printf("reloaded policy v%d mode=%s allowlist=%d", np.Version, np.Mode, len(np.Allowlist))
		}
	}()

	// Graceful shutdown on INT/TERM
	ctx, cancel := context.WithCancel(context.Background())
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sig
		log.Println("shutdown signal received")
		cancel()
	}()

	// Optional metrics endpoint
	if cfg.metricsAddr != "" {
		go m.serveMetrics(cfg.metricsAddr)
	}

	ln, err := net.Listen("tcp", cfg.addr)
	if err != nil {
		log.Fatalf("listen: %v", err)
	}
	log.Printf("accepting connections on %s", cfg.addr)

	go func() {
		<-ctx.Done()
		_ = ln.Close()
	}()

	for {
		conn, err := ln.Accept()
		if err != nil {
			select {
			case <-ctx.Done():
				log.Println("listener closed, exiting")
				return
			default:
				log.Printf("accept: %v", err)
				continue
			}
		}
		go handleConn(ctx, conn, m)
	}
}
