package manager

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os/exec"
	"strconv"
	"strings"

	"atlas/shared/protocol"
)

type mtrJSONOutput struct {
	Report mtrJSONReport `json:"report"`
}

type mtrJSONReport struct {
	Hubs []map[string]interface{} `json:"hubs"`
}

func executeMTR(ctx context.Context, target string, params map[string]interface{}) (*protocol.MTRResult, error) {
	ipVersion, _ := params["ip_version"].(string)
	if ipVersion == "" {
		ipVersion = "auto"
	}

	count := getIntParam(params, "count", 4)
	if count < 1 {
		count = 4
	}

	maxHops := getIntParam(params, "max_hops", 30)
	if maxHops < 1 {
		maxHops = 30
	}

	resolvedIP := strings.Trim(strings.TrimSpace(target), "[]")
	if net.ParseIP(stripIPv6Zone(resolvedIP)) == nil {
		var err error
		resolvedIP, err = resolveHostIPForVersion(resolvedIP, ipVersion)
		if err != nil {
			return nil, err
		}
	}

	args := []string{
		"--report",
		"--json",
		"--no-dns",
		"--report-cycles", strconv.Itoa(count),
		"--max-ttl", strconv.Itoa(maxHops),
		resolvedIP,
	}

	output, err := exec.CommandContext(ctx, "mtr", args...).CombinedOutput()
	result, parseErr := parseMTRReportJSON(output, target, resolvedIP)
	if parseErr == nil {
		return result, nil
	}

	if err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			return nil, fmt.Errorf("mtr command failed: %w", err)
		}
		return nil, fmt.Errorf("mtr command failed: %w: %s", err, message)
	}

	return nil, parseErr
}

func parseMTRReportJSON(raw []byte, target string, resolvedIP string) (*protocol.MTRResult, error) {
	var payload mtrJSONOutput
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("failed to parse mtr json output: %w", err)
	}

	result := &protocol.MTRResult{
		Hops:       []protocol.MTRHop{},
		Target:     target,
		ResolvedIP: resolvedIP,
	}

	for index, rawHop := range payload.Report.Hubs {
		hop := normalizeMTRHop(rawHop, index+1)
		result.Hops = append(result.Hops, hop)
	}

	result.TotalHops = len(result.Hops)

	summaryHop := findMTRSummaryHop(result.Hops, resolvedIP)
	if summaryHop != nil {
		result.Success = summaryHop.IP == resolvedIP
		result.PacketLossPercent = summaryHop.LossPercent
		if result.Success {
			result.MinRTTMs = summaryHop.BestRTTMs
			result.AvgRTTMs = summaryHop.AvgRTTMs
			result.MaxRTTMs = summaryHop.WorstRTTMs
			result.StdDevRTTMs = summaryHop.StdDevRTTMs
		}
	}

	if !result.Success {
		result.PacketLossPercent = 100
	}

	return result, nil
}

func normalizeMTRHop(rawHop map[string]interface{}, fallbackHop int) protocol.MTRHop {
	hopNumber := parseMTRInt(rawHop["count"], fallbackHop)
	hostValue := parseMTRString(rawHop["host"])
	hostname, ip := splitMTRAddress(hostValue)
	lossPercent := parseMTRFloat(rawHop["Loss%"])
	sent := parseMTRInt(rawHop["Snt"], 0)

	return protocol.MTRHop{
		Hop:         hopNumber,
		IP:          ip,
		Hostname:    hostname,
		LossPercent: lossPercent,
		Sent:        sent,
		LastRTTMs:   parseMTRFloat(rawHop["Last"]),
		AvgRTTMs:    parseMTRFloat(rawHop["Avg"]),
		BestRTTMs:   parseMTRFloat(rawHop["Best"]),
		WorstRTTMs:  parseMTRFloat(rawHop["Wrst"]),
		StdDevRTTMs: parseMTRFloat(rawHop["StDev"]),
		Timeout:     ip == "" || (sent > 0 && lossPercent >= 100),
	}
}

func findMTRSummaryHop(hops []protocol.MTRHop, resolvedIP string) *protocol.MTRHop {
	for index := range hops {
		if hops[index].IP == resolvedIP {
			return &hops[index]
		}
	}

	for index := len(hops) - 1; index >= 0; index-- {
		if hops[index].IP != "" {
			return &hops[index]
		}
	}

	return nil
}

func parseMTRFloat(value interface{}) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case json.Number:
		parsed, _ := typed.Float64()
		return parsed
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		if err == nil {
			return parsed
		}
	}
	return 0
}

func parseMTRInt(value interface{}, fallback int) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case json.Number:
		parsed, err := typed.Int64()
		if err == nil {
			return int(parsed)
		}
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(typed))
		if err == nil {
			return parsed
		}
	}
	return fallback
}

func parseMTRString(value interface{}) string {
	if text, ok := value.(string); ok {
		return strings.TrimSpace(text)
	}
	return ""
}

func splitMTRAddress(value string) (string, string) {
	value = strings.TrimSpace(value)
	if value == "" || value == "???" || value == "*" {
		return "", ""
	}

	trimmedIP := strings.Trim(value, "[]")
	if parsed := net.ParseIP(stripIPv6Zone(trimmedIP)); parsed != nil {
		return "", parsed.String()
	}

	if open := strings.IndexByte(value, '('); open > 0 && strings.HasSuffix(value, ")") {
		hostname := strings.TrimSpace(value[:open])
		candidate := strings.TrimSpace(value[open+1 : len(value)-1])
		candidate = strings.Trim(candidate, "[]")
		if parsed := net.ParseIP(stripIPv6Zone(candidate)); parsed != nil {
			return hostname, parsed.String()
		}
	}

	return value, ""
}
