package manager

import (
	"bytes"
	"context"
	"fmt"
	"math"
	"net"
	"net/http"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"atlas/shared/protocol"
)

// executeICMPPing 执行ICMP Ping测试
func executeICMPPing(ctx context.Context, target string, params map[string]interface{}) (*protocol.ICMPPingResult, error) {
	// 获取参数
	count := 4
	if c, ok := params["count"].(float64); ok {
		count = int(c)
	}

	// 解析目标域名,获取实际 ping 的 IP 地址
	resolvedIP := target
	// 检查是否为 IP 地址(不包含字母则为 IP)
	ip := net.ParseIP(target)
	if ip == nil {
		// 不是纯 IP 地址,尝试 DNS 解析
		if ips, err := net.LookupIP(target); err == nil && len(ips) > 0 {
			// 优先返回 IPv4 地址
			for _, resolved := range ips {
				if resolved.To4() != nil {
					resolvedIP = resolved.String()
					break
				}
			}
			// 如果没有 IPv4,使用 IPv6
			if resolvedIP == target {
				resolvedIP = ips[0].String()
			}
		}
	}

	// 仅在 Linux/Docker 场景运行：使用标准 ping 语法
	cmd := exec.CommandContext(ctx, "ping", "-c", strconv.Itoa(count), target)

	output, err := cmd.CombinedOutput()

	// 解析输出
	result := parsePingOutput(string(output), count)

	// 设置解析后的 IP 地址
	result.ResolvedIP = resolvedIP

	// 如果有解析出的响应,即使命令返回错误也认为成功
	// Windows ping 在某些情况下可能返回非0退出码,但实际测试成功
	if len(result.Replies) > 0 {
		return result, nil
	}

	// 如果完全没有响应,返回错误
	if err != nil {
		return nil, fmt.Errorf("ping command failed: %w", err)
	}

	return result, nil
}

// parsePingOutput 解析ping命令输出
func parsePingOutput(output string, expectedCount int) *protocol.ICMPPingResult {
	result := &protocol.ICMPPingResult{
		PacketsSent:     expectedCount,
		PacketsReceived: 0,
		Replies:         []protocol.PingReply{},
	}

	lines := strings.Split(output, "\n")

	// 匹配 RTT: time=10ms, 时间=13ms, time=10.5 ms
	// Windows CN: 字节=32 时间=13ms TTL=48
	// Windows EN: bytes=32 time=13ms TTL=48
	// Linux: 64 bytes from 8.8.8.8: icmp_seq=1 ttl=118 time=10.5 ms

	// 查找 ms 前面的数值: [=<](\d+\.?\d*)\s*ms
	rttPattern := regexp.MustCompile(`[=<](\d+\.?\d*)\s*ms`)
	ttlPattern := regexp.MustCompile(`[tT][tT][lL][=:](\d+)`)

	seq := 1
	for _, line := range lines {
		// 只要包含 TTL，我们就尝试解析
		if strings.Contains(strings.ToUpper(line), "TTL") {
			// 提取RTT
			if matches := rttPattern.FindStringSubmatch(line); len(matches) > 1 {
				rtt, _ := strconv.ParseFloat(matches[1], 64)

				// 提取TTL
				ttl := 0
				if ttlMatches := ttlPattern.FindStringSubmatch(line); len(ttlMatches) > 1 {
					ttl, _ = strconv.Atoi(ttlMatches[1])
				}

				result.Replies = append(result.Replies, protocol.PingReply{
					Seq:    seq,
					TTL:    ttl,
					TimeMs: rtt,
				})
				seq++
			}
		}
	}

	result.PacketsReceived = len(result.Replies)

	// 计算统计数据
	if len(result.Replies) > 0 {
		var total, min, max float64
		min = result.Replies[0].TimeMs
		max = result.Replies[0].TimeMs

		for _, reply := range result.Replies {
			total += reply.TimeMs
			if reply.TimeMs < min {
				min = reply.TimeMs
			}
			if reply.TimeMs > max {
				max = reply.TimeMs
			}
		}

		result.AvgRTTMs = total / float64(len(result.Replies))
		result.MinRTTMs = min
		result.MaxRTTMs = max

		// 计算标准差
		var variance float64
		for _, reply := range result.Replies {
			diff := reply.TimeMs - result.AvgRTTMs
			variance += diff * diff
		}
		variance /= float64(len(result.Replies))
		result.StdDevRTTMs = math.Sqrt(variance)
	}

	result.PacketLossPercent = float64(result.PacketsSent-result.PacketsReceived) / float64(result.PacketsSent) * 100

	return result
}

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

// executeMTR 执行MTR测试
func executeMTR(ctx context.Context, target string, params map[string]interface{}) (*protocol.MTRResult, error) {
	// 检查mtr是否可用
	cmd := exec.CommandContext(ctx, "mtr", "--version")
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("mtr not available: %w", err)
	}

	ipVersion, _ := params["ip_version"].(string)
	if ipVersion == "" {
		ipVersion = "auto"
	}

	// 解析目标域名,获取实际 mtr 的 IP 地址
	resolvedIP := strings.Trim(strings.TrimSpace(target), "[]")
	if net.ParseIP(stripIPv6Zone(resolvedIP)) == nil {
		var err error
		resolvedIP, err = resolveHostIPForVersion(resolvedIP, ipVersion)
		if err != nil {
			return nil, err
		}
	}

	// 执行mtr命令
	count := getIntParam(params, "count", 10)
	if count < 1 {
		count = 1
	}
	cmd = exec.CommandContext(ctx, "mtr", "-c", strconv.Itoa(count), "-r", "-n", resolvedIP)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("mtr command failed: %w", err)
	}

	// 解析MTR输出 (简化实现)
	result := &protocol.MTRResult{
		Target:     target,
		Hops:       []protocol.MTRHop{},
		ResolvedIP: resolvedIP,
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		// 跳过表头
		if !strings.Contains(line, ".") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) >= 7 {
			hop := protocol.MTRHop{}
			hop.Hop, _ = strconv.Atoi(fields[0])
			hop.IP = fields[1]
			hop.LossPercent, _ = strconv.ParseFloat(strings.TrimSuffix(fields[2], "%"), 64)
			hop.Sent, _ = strconv.Atoi(fields[3])
			hop.AvgMs, _ = strconv.ParseFloat(fields[5], 64)

			result.Hops = append(result.Hops, hop)
		}
	}

	result.TotalHops = len(result.Hops)

	return result, nil
}

// executeTraceroute 执行Traceroute测试
func executeTraceroute(ctx context.Context, target string, params map[string]interface{}) (*protocol.TracerouteResult, error) {
	ipVersion, _ := params["ip_version"].(string)
	if ipVersion == "" {
		ipVersion = "auto"
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

	// 仅在 Linux/Docker 场景运行
	// 使用 ICMP 模式（-I）更稳定，避免 UDP 在某些网络下全超时
	cmd := exec.CommandContext(ctx, "traceroute", "-n", "-I", resolvedIP)

	var stdout bytes.Buffer
	cmd.Stdout = &stdout

	err := cmd.Run()
	if err != nil {
		// traceroute可能返回非0退出码,但仍有输出
	}

	// 解析输出 (简化实现)
	result := &protocol.TracerouteResult{
		Target:     target,
		Hops:       []protocol.TracerouteHop{},
		Success:    true,
		ResolvedIP: resolvedIP,
	}

	lines := strings.Split(stdout.String(), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// 查找跳数
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		hopNum, err := strconv.Atoi(fields[0])
		if err != nil {
			continue
		}

		hop := protocol.TracerouteHop{
			Hop:     hopNum,
			RTTs:    []float64{},
			Timeout: false,
		}

		// 提取IP和RTT
		// traceroute -n 输出中：IP 一般紧跟在 hop number 之后（fields[1]），RTT 为带 ms 的字段
		for i := 1; i < len(fields); i++ {
			if fields[i] == "*" {
				hop.Timeout = true
				continue
			}

			if strings.HasSuffix(fields[i], "ms") {
				rttStr := strings.TrimSuffix(fields[i], "ms")
				rtt, _ := strconv.ParseFloat(rttStr, 64)
				hop.RTTs = append(hop.RTTs, rtt)
				continue
			}

			// 只在 IP 还未设置时尝试设置（避免把 RTT 之类的数值覆盖掉）
			if hop.IP == "" {
				if net.ParseIP(fields[i]) != nil {
					hop.IP = fields[i]
				}
			}
		}

		result.Hops = append(result.Hops, hop)
	}

	result.TotalHops = len(result.Hops)

	return result, nil
}

func executeHTTPTest(target string, params map[string]interface{}) (map[string]interface{}, error) {
	count := getIntParam(params, "count", 1)
	if count < 1 {
		count = 1
	}

	client := &http.Client{Timeout: 10 * time.Second}

	attempts := make([]map[string]interface{}, 0, count)
	success := 0
	failed := 0
	var totalMs float64
	var minMs float64
	var maxMs float64

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

		resp, err := client.Do(req)
		elapsed := time.Since(start)
		ms := float64(elapsed.Milliseconds())

		if err != nil {
			failed++
			attempts = append(attempts, map[string]interface{}{
				"seq":    i,
				"status": "failed",
				"error":  err.Error(),
			})
			continue
		}

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
				"seq":         i,
				"status":      "success",
				"time_ms":     ms,
				"status_code": resp.StatusCode,
			})
		} else {
			failed++
			attempts = append(attempts, map[string]interface{}{
				"seq":         i,
				"status":      "failed",
				"time_ms":     ms,
				"status_code": resp.StatusCode,
			})
		}
	}

	result := map[string]interface{}{
		"target":               target,
		"attempts":             attempts,
		"successful_requests":  success,
		"failed_requests":      failed,
	}

	if success > 0 {
		result["avg_connect_time_ms"] = totalMs / float64(success)
		result["min_connect_time_ms"] = minMs
		result["max_connect_time_ms"] = maxMs
	}

	return result, nil
}

// executeBirdRoute 执行Bird路由查询测试
func executeBirdRoute(target string, params map[string]interface{}) (*protocol.BirdRouteResult, error) {
	// 检查 birdc 是否可用
	if _, err := exec.LookPath("birdc"); err != nil {
		return &protocol.BirdRouteResult{
			Success: false,
			Routes:  []protocol.BirdRoute{},
		}, fmt.Errorf("birdc command not found: %w", err)
	}

	// 执行 birdc show route for <target>
	cmd := exec.Command("birdc", "show", "route", "for", target)
	var stdout bytes.Buffer
	cmd.Stdout = &stdout

	if err := cmd.Run(); err != nil {
		return &protocol.BirdRouteResult{
			Success: false,
			Routes:  []protocol.BirdRoute{},
		}, fmt.Errorf("birdc command failed: %w", err)
	}

	// 解析输出
	routes := parseBirdOutput(stdout.String())

	return &protocol.BirdRouteResult{
		Success:     true,
		Routes:      routes,
		TotalRoutes: len(routes),
	}, nil
}

// parseBirdOutput 解析 birdc 输出
func parseBirdOutput(output string) []protocol.BirdRoute {
	var routes []protocol.BirdRoute
	lines := strings.Split(output, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "Bird") || strings.HasPrefix(line, "---") {
			continue
		}

		// 解析 birdc 输出格式
		// 格式示例: 192.168.1.0/24 via 10.0.0.1 on eth0 [BGP 2024-01-11]
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}

		route := protocol.BirdRoute{
			Network: fields[0],
		}

		// 解析 via 和 interface
		for i, field := range fields {
			if field == "via" && i+1 < len(fields) {
				route.Gateway = fields[i+1]
			}
			if field == "on" && i+1 < len(fields) {
				route.Interface = fields[i+1]
			}
		}

		// 解析协议类型（在方括号中）
		for i, field := range fields {
			if strings.HasPrefix(field, "[") && i+1 < len(fields) {
				route.Protocol = strings.Trim(field, "[]")
				break
			}
		}

		routes = append(routes, route)
	}

	return routes
}
