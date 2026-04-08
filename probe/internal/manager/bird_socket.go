package manager

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"atlas/shared/protocol"
)

var defaultBirdSocketCandidates = []string{
	"/run/bird.ctl",
	"/run/bird/bird.ctl",
	"/var/run/bird.ctl",
	"/var/run/bird/bird.ctl",
	"/usr/local/var/run/bird.ctl",
	"/usr/local/var/run/bird/bird.ctl",
}

func executeBirdRoute(target string, params map[string]interface{}) (*protocol.BirdRouteResult, error) {
	socketPath, err := resolveBirdSocketPath(params)
	if err != nil {
		return &protocol.BirdRouteResult{
			Success: false,
			Routes:  []protocol.BirdRoute{},
		}, err
	}

	lines, err := runBirdCommand(socketPath, fmt.Sprintf("show route for %s", strings.TrimSpace(target)))
	if err != nil {
		return &protocol.BirdRouteResult{
			Success: false,
			Routes:  []protocol.BirdRoute{},
		}, err
	}

	routes := parseBirdOutput(lines)
	return &protocol.BirdRouteResult{
		Success:     true,
		Routes:      routes,
		TotalRoutes: len(routes),
	}, nil
}

func BirdControlSocketAvailable() bool {
	_, err := resolveBirdSocketPath(nil)
	return err == nil
}

func resolveBirdSocketPath(params map[string]interface{}) (string, error) {
	candidates := make([]string, 0, len(defaultBirdSocketCandidates)+3)

	if params != nil {
		if raw, ok := params["socket_path"].(string); ok && strings.TrimSpace(raw) != "" {
			candidates = append(candidates, strings.TrimSpace(raw))
		}
	}

	for _, envKey := range []string{"BIRD_CONTROL_SOCKET", "BIRD_SOCKET"} {
		if value := strings.TrimSpace(os.Getenv(envKey)); value != "" {
			candidates = append(candidates, value)
		}
	}

	candidates = append(candidates, defaultBirdSocketCandidates...)

	seen := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		candidate = filepath.Clean(candidate)
		if candidate == "." || candidate == "" {
			continue
		}
		if _, ok := seen[candidate]; ok {
			continue
		}
		seen[candidate] = struct{}{}

		info, err := os.Stat(candidate)
		if err == nil && (info.Mode()&os.ModeSocket) != 0 {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("bird control socket not found")
}

func runBirdCommand(socketPath string, command string) ([]string, error) {
	conn, err := net.DialTimeout("unix", socketPath, 2*time.Second)
	if err != nil {
		return nil, fmt.Errorf("connect bird control socket failed: %w", err)
	}
	defer conn.Close()

	reader := bufio.NewReader(conn)
	if _, err := readBirdReply(reader); err != nil {
		return nil, err
	}

	if _, err := fmt.Fprintf(conn, "%s\n", strings.TrimSpace(command)); err != nil {
		return nil, fmt.Errorf("write bird command failed: %w", err)
	}

	return readBirdReply(reader)
}

func readBirdReply(reader *bufio.Reader) ([]string, error) {
	lines := make([]string, 0)

	for {
		rawLine, err := reader.ReadString('\n')
		if err != nil {
			return nil, fmt.Errorf("read bird reply failed: %w", err)
		}
		rawLine = strings.TrimRight(rawLine, "\r\n")
		if rawLine == "" {
			continue
		}

		code, sep, payload, ok := parseBirdReplyLine(rawLine)
		if !ok {
			if trimmed := strings.TrimSpace(rawLine); trimmed != "" {
				lines = append(lines, trimmed)
			}
			continue
		}

		switch {
		case code >= 8000:
			message := strings.TrimSpace(payload)
			if message == "" {
				message = fmt.Sprintf("bird command failed with code %d", code)
			}
			return nil, fmt.Errorf("%s", message)
		case code < 1000:
			if sep == ' ' {
				return lines, nil
			}
		default:
			if trimmed := strings.TrimSpace(payload); trimmed != "" {
				lines = append(lines, trimmed)
			}
		}
	}
}

func parseBirdReplyLine(line string) (int, rune, string, bool) {
	if len(line) < 4 {
		return 0, 0, "", false
	}
	code, err := strconv.Atoi(line[:4])
	if err != nil {
		return 0, 0, "", false
	}

	if len(line) == 4 {
		return code, ' ', "", true
	}

	sep := rune(line[4])
	payload := ""
	if len(line) > 5 {
		payload = line[5:]
	}
	return code, sep, payload, true
}

func parseBirdOutput(lines []string) []protocol.BirdRoute {
	routes := make([]protocol.BirdRoute, 0)
	var current *protocol.BirdRoute

	flushCurrent := func() {
		if current == nil {
			return
		}
		if current.Network != "" {
			routes = append(routes, *current)
		}
		current = nil
	}

	for _, rawLine := range lines {
		if rawLine == "" {
			continue
		}

		trimmed := strings.TrimSpace(rawLine)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "BIRD ") || strings.HasPrefix(trimmed, "Access restricted") {
			continue
		}

		switch {
		case isBirdRouteHeader(trimmed):
			flushCurrent()
			current = &protocol.BirdRoute{}
			parseBirdRouteHeader(current, trimmed)
		case isBirdRouteAlternative(trimmed) && current != nil:
			network := current.Network
			flushCurrent()
			current = &protocol.BirdRoute{Network: network}
			parseBirdRouteHeader(current, trimmed)
		case current != nil:
			parseBirdRouteDetails(current, trimmed)
		}
	}

	flushCurrent()
	return routes
}

func isBirdRouteHeader(line string) bool {
	fields := strings.Fields(line)
	if len(fields) == 0 {
		return false
	}
	first := fields[0]
	return strings.Contains(first, "/") || net.ParseIP(strings.Trim(first, "[]")) != nil
}

func isBirdRouteAlternative(line string) bool {
	fields := strings.Fields(line)
	if len(fields) == 0 {
		return false
	}
	switch fields[0] {
	case "unicast", "blackhole", "unreachable", "prohibit", "multicast":
		return true
	default:
		return strings.HasPrefix(fields[0], "[")
	}
}

func parseBirdRouteHeader(route *protocol.BirdRoute, line string) {
	fields := strings.Fields(line)
	if len(fields) == 0 {
		return
	}

	if route.Network == "" && (strings.Contains(fields[0], "/") || net.ParseIP(strings.Trim(fields[0], "[]")) != nil) {
		route.Network = fields[0]
	}

	parseBirdRouteDetails(route, line)
}

func parseBirdRouteDetails(route *protocol.BirdRoute, line string) {
	fields := strings.Fields(line)
	for index := 0; index < len(fields); index++ {
		field := fields[index]
		switch field {
		case "via":
			if index+1 < len(fields) {
				route.Gateway = strings.Trim(fields[index+1], "[]")
			}
		case "on", "dev":
			if index+1 < len(fields) {
				route.Interface = fields[index+1]
			}
		}

		if strings.HasPrefix(field, "[") {
			protocolName := strings.Trim(field, "[]")
			if protocolName != "" && route.Protocol == "" {
				parts := strings.Fields(protocolName)
				if len(parts) > 0 {
					route.Protocol = parts[0]
				}
			}
		}
	}
}
