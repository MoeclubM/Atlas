package manager

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptrace"
	"strconv"
	"strings"
	"time"

	"atlas/shared/protocol"
)

// executeTCPPing 执行TCP Ping测试
func executeTCPPing(target string, params map[string]interface{}) (*protocol.TCPPingResult, error) {
	count := getIntParam(params, "count", 4)
	timeoutSec := getIntParam(params, "timeout", 5)
	timeout := time.Duration(timeoutSec) * time.Second

	ipVersion, _ := params["ip_version"].(string)
	if ipVersion == "" {
		ipVersion = "auto"
	}

	// 强制要求 host:port 或 [ipv6]:port
	host, portStr, err := net.SplitHostPort(strings.TrimSpace(target))
	if err != nil {
		return nil, fmt.Errorf("tcp_ping target must be host:port or [ipv6]:port: %w", err)
	}
	if host == "" || portStr == "" {
		return nil, fmt.Errorf("tcp_ping target must include host and port")
	}
	portNum, err := strconv.Atoi(portStr)
	if err != nil || portNum < 1 || portNum > 65535 {
		return nil, fmt.Errorf("invalid tcp port: %s", portStr)
	}

	resolvedIP := strings.Trim(host, "[]")
	if net.ParseIP(stripIPv6Zone(resolvedIP)) == nil {
		resolvedIP, err = resolveHostIPForVersion(resolvedIP, ipVersion)
		if err != nil {
			return nil, err
		}
	}

	network := "tcp"
	if ip := net.ParseIP(stripIPv6Zone(resolvedIP)); ip != nil {
		if ip.To4() != nil {
			network = "tcp4"
		} else {
			network = "tcp6"
		}
	}

	address := net.JoinHostPort(resolvedIP, portStr)

	result := &protocol.TCPPingResult{
		Target:     target,
		Attempts:   []protocol.TCPPingAttempt{},
		ResolvedIP: resolvedIP,
	}

	successful := 0
	failed := 0
	var totalTime float64
	var minTime float64
	var maxTime float64

	for i := 1; i <= count; i++ {
		start := time.Now()
		conn, err := net.DialTimeout(network, address, timeout)
		elapsed := time.Since(start)

		if err != nil {
			failed++
			result.Attempts = append(result.Attempts, protocol.TCPPingAttempt{
				Seq:    i,
				Status: "failed",
				Error:  err.Error(),
			})
			continue
		}

		_ = conn.Close()
		successful++
		timeMs := float64(elapsed.Milliseconds())
		totalTime += timeMs

		if minTime == 0 || timeMs < minTime {
			minTime = timeMs
		}
		if timeMs > maxTime {
			maxTime = timeMs
		}

		result.Attempts = append(result.Attempts, protocol.TCPPingAttempt{
			Seq:    i,
			Status: "success",
			TimeMs: timeMs,
		})
	}

	result.SuccessfulConnections = successful
	result.FailedConnections = failed

	if successful > 0 {
		result.AvgConnectTimeMs = totalTime / float64(successful)
		result.MinConnectTimeMs = minTime
		result.MaxConnectTimeMs = maxTime
	}

	return result, nil
}

// getIntParam 从参数中获取整数值
func getIntParam(params map[string]interface{}, key string, defaultValue int) int {
	if val, ok := params[key]; ok {
		switch v := val.(type) {
		case int:
			return v
		case float64:
			return int(v)
		case string:
			if i, err := strconv.Atoi(v); err == nil {
				return i
			}
		}
	}
	return defaultValue
}

func stripIPv6Zone(host string) string {
	if i := strings.IndexByte(host, '%'); i > 0 {
		return host[:i]
	}
	return host
}

func resolveHostIPForVersion(host, ipVersion string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	switch ipVersion {
	case "ipv4":
		ips, err := net.DefaultResolver.LookupIP(ctx, "ip4", host)
		if err != nil || len(ips) == 0 {
			if err != nil {
				return "", err
			}
			return "", fmt.Errorf("no ipv4 address found for host")
		}
		return ips[0].String(), nil
	case "ipv6":
		ips, err := net.DefaultResolver.LookupIP(ctx, "ip6", host)
		if err != nil || len(ips) == 0 {
			if err != nil {
				return "", err
			}
			return "", fmt.Errorf("no ipv6 address found for host")
		}
		return ips[0].String(), nil
	default: // auto: prefer ipv4
		ips4, err4 := net.DefaultResolver.LookupIP(ctx, "ip4", host)
		if err4 == nil && len(ips4) > 0 {
			return ips4[0].String(), nil
		}
		ips6, err6 := net.DefaultResolver.LookupIP(ctx, "ip6", host)
		if err6 == nil && len(ips6) > 0 {
			return ips6[0].String(), nil
		}
		if err4 != nil {
			return "", err4
		}
		return "", err6
	}
}

// executeTraceroute 执行Traceroute测试
func executeTraceroute(ctx context.Context, target string, params map[string]interface{}) (*protocol.TracerouteResult, error) {
	ipVersion, _ := params["ip_version"].(string)
	if ipVersion == "" {
		ipVersion = "auto"
	}
	queryCount := getIntParam(params, "count", 3)
	if queryCount < 1 {
		queryCount = 3
	}
	maxHops := getIntParam(params, "max_hops", 30)
	if maxHops < 1 {
		maxHops = 30
	}

	// 解析目标域名,获取实际 traceroute 的 IP 地址
	resolvedIP := strings.Trim(strings.TrimSpace(target), "[]")
	if net.ParseIP(stripIPv6Zone(resolvedIP)) == nil {
		var err error
		resolvedIP, err = resolveHostIPForVersion(resolvedIP, ipVersion)
		if err != nil {
			return nil, err
		}
	}

	hops, err := runTracerouteCommand(ctx, resolvedIP, queryCount, maxHops)
	if err != nil {
		return nil, err
	}

	result := &protocol.TracerouteResult{
		Target:     target,
		Hops:       hops,
		Success:    false,
		ResolvedIP: resolvedIP,
	}
	result.TotalHops = len(result.Hops)

	for index := len(result.Hops) - 1; index >= 0; index-- {
		if result.Hops[index].IP == "" {
			continue
		}
		result.Success = result.Hops[index].IP == resolvedIP
		break
	}

	return result, nil
}

func runTracerouteCommand(
	ctx context.Context,
	resolvedIP string,
	queryCount int,
	maxHops int,
) ([]protocol.TracerouteHop, error) {
	return runInternalTraceroute(ctx, resolvedIP, queryCount, maxHops)
}

func executeHTTPTest(target string, params map[string]interface{}) (map[string]interface{}, error) {
	count := getIntParam(params, "count", 1)
	if count < 1 {
		count = 1
	}

	target = normalizeHTTPTarget(target)

	client := &http.Client{
		Timeout: 10 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			applyChromeLikeHeaders(req)
			return nil
		},
	}

	attempts := make([]map[string]interface{}, 0, count)
	success := 0
	failed := 0
	var totalMs float64
	var minMs float64
	var maxMs float64
	var lastStatusCode int
	var lastResolvedIP string
	var lastFinalURL string
	var lastTimeMs float64
	var lastResponseStatus string
	var lastRequestHeaders map[string][]string
	var lastResponseHeaders map[string][]string

	for i := 1; i <= count; i++ {
		start := time.Now()
		req, err := http.NewRequest(http.MethodGet, target, nil)
		if err != nil {
			failed++
			attempts = append(attempts, map[string]interface{}{
				"seq":    i,
				"status": "failed",
				"error":  err.Error(),
			})
			continue
		}

		applyChromeLikeHeaders(req)

		resolvedIP := fallbackResolvedHTTPIP(req.URL.Hostname())
		trace := &httptrace.ClientTrace{
			GotConn: func(info httptrace.GotConnInfo) {
				if info.Conn == nil {
					return
				}
				host, _, err := net.SplitHostPort(info.Conn.RemoteAddr().String())
				if err == nil && host != "" {
					resolvedIP = strings.Trim(host, "[]")
				}
			},
		}
		req = req.WithContext(httptrace.WithClientTrace(req.Context(), trace))

		resp, err := client.Do(req)
		elapsed := time.Since(start)
		ms := float64(elapsed.Milliseconds())

		if err != nil {
			failed++
			attempts = append(attempts, map[string]interface{}{
				"seq":             i,
				"status":          "failed",
				"time_ms":         ms,
				"error":           err.Error(),
				"resolved_ip":     resolvedIP,
				"request_headers": cloneHeaderMap(req.Header),
			})
			continue
		}

		lastResolvedIP = resolvedIP
		lastFinalURL = resp.Request.URL.String()
		lastTimeMs = ms
		lastResponseStatus = resp.Status
		lastRequestHeaders = cloneHeaderMap(resp.Request.Header)
		lastResponseHeaders = cloneHeaderMap(resp.Header)
		lastStatusCode = resp.StatusCode

		_ = resp.Body.Close()

		// 2xx/3xx 视为成功
		if resp.StatusCode >= 200 && resp.StatusCode < 400 {
			success++
			totalMs += ms
			if minMs == 0 || ms < minMs {
				minMs = ms
			}
			if ms > maxMs {
				maxMs = ms
			}
			attempts = append(attempts, map[string]interface{}{
				"seq":              i,
				"status":           "success",
				"time_ms":          ms,
				"status_code":      resp.StatusCode,
				"response_status":  resp.Status,
				"resolved_ip":      resolvedIP,
				"final_url":        lastFinalURL,
				"request_headers":  lastRequestHeaders,
				"response_headers": lastResponseHeaders,
			})
		} else {
			failed++
			attempts = append(attempts, map[string]interface{}{
				"seq":              i,
				"status":           "failed",
				"time_ms":          ms,
				"status_code":      resp.StatusCode,
				"response_status":  resp.Status,
				"resolved_ip":      resolvedIP,
				"final_url":        lastFinalURL,
				"request_headers":  lastRequestHeaders,
				"response_headers": lastResponseHeaders,
			})
		}
	}

	result := map[string]interface{}{
		"target":              target,
		"attempts":            attempts,
		"successful_requests": success,
		"failed_requests":     failed,
	}

	if success > 0 {
		result["avg_connect_time_ms"] = totalMs / float64(success)
		result["min_connect_time_ms"] = minMs
		result["max_connect_time_ms"] = maxMs
	}

	if lastStatusCode > 0 {
		result["status_code"] = lastStatusCode
	}
	if lastTimeMs > 0 {
		result["last_time_ms"] = lastTimeMs
	}
	if lastResponseStatus != "" {
		result["response_status"] = lastResponseStatus
	}
	if lastResolvedIP != "" {
		result["resolved_ip"] = lastResolvedIP
	}
	if lastFinalURL != "" {
		result["final_url"] = lastFinalURL
	}
	if len(lastRequestHeaders) > 0 {
		result["request_headers"] = lastRequestHeaders
	}
	if len(lastResponseHeaders) > 0 {
		result["response_headers"] = lastResponseHeaders
	}

	return result, nil
}

func normalizeHTTPTarget(target string) string {
	target = strings.TrimSpace(target)
	if target == "" || strings.Contains(target, "://") {
		return target
	}
	return "http://" + target
}

func fallbackResolvedHTTPIP(host string) string {
	host = strings.Trim(strings.TrimSpace(host), "[]")
	if host == "" {
		return ""
	}
	if ip := net.ParseIP(stripIPv6Zone(host)); ip != nil {
		return host
	}
	return ""
}

func applyChromeLikeHeaders(req *http.Request) {
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Pragma", "no-cache")
	req.Header.Set("Upgrade-Insecure-Requests", "1")
}

func cloneHeaderMap(header http.Header) map[string][]string {
	if len(header) == 0 {
		return nil
	}

	cloned := make(map[string][]string, len(header))
	for key, values := range header {
		if len(values) == 0 {
			continue
		}
		next := make([]string, 0, len(values))
		for _, value := range values {
			next = append(next, value)
		}
		cloned[key] = next
	}
	return cloned
}
