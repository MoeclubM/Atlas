package targetutil

import (
	"net"
	"net/url"
	"strings"
)

func StripIPv6Zone(host string) string {
	if i := strings.IndexByte(host, '%'); i > 0 {
		return host[:i]
	}
	return host
}

func ExtractHost(target string) string {
	target = strings.TrimSpace(target)
	if target == "" {
		return ""
	}

	if strings.Contains(target, "://") {
		u, err := url.Parse(target)
		if err == nil {
			if h := u.Hostname(); h != "" {
				return h
			}
		}
	}

	if strings.Contains(target, "/") {
		u, err := url.Parse("http://" + target)
		if err == nil {
			if h := u.Hostname(); h != "" {
				return h
			}
		}
	}

	if strings.HasPrefix(target, "[") {
		if i := strings.Index(target, "]"); i > 1 {
			host := target[1:i]
			if host != "" {
				return host
			}
		}
	}

	if host, _, err := net.SplitHostPort(target); err == nil {
		return host
	}

	if strings.Count(target, ":") >= 2 {
		return target
	}

	return target
}
