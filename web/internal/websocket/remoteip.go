package websocket

import (
	"net"
	"net/http"
	"strings"
)

func extractRemoteIP(r *http.Request) string {
	if r == nil {
		return ""
	}

	candidates := []string{
		r.Header.Get("X-Forwarded-For"),
		r.Header.Get("X-Real-IP"),
		r.RemoteAddr,
	}

	for _, candidate := range candidates {
		if ip := normalizeRemoteIP(candidate); ip != "" {
			return ip
		}
	}

	return ""
}

func normalizeRemoteIP(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}

	if idx := strings.IndexByte(raw, ','); idx >= 0 {
		raw = strings.TrimSpace(raw[:idx])
	}

	if host, _, err := net.SplitHostPort(raw); err == nil {
		return strings.TrimSpace(host)
	}

	return strings.Trim(raw, "[]")
}
