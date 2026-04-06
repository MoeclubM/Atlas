package manager

import (
	"fmt"
	"runtime"
	"strings"

	"golang.org/x/net/icmp"
	"golang.org/x/net/ipv4"
	"golang.org/x/net/ipv6"
)

type SystemSupport struct {
	Platform string

	RawICMPIPv4       bool
	RawICMPIPv4Reason string
	RawICMPIPv6       bool
	RawICMPIPv6Reason string

	ICMPPing        bool
	TCPPing         bool
	HTTPTest        bool
	Traceroute      bool
	MTR             bool
	BirdRoute       bool
	BirdRouteReason string
	BirdSocketPath  string
}

func DetectSystemSupport() SystemSupport {
	support := SystemSupport{
		Platform: runtime.GOOS + "/" + runtime.GOARCH,
		TCPPing:  true,
		HTTPTest: true,
	}

	if err := detectRawICMPIPv4(); err == nil {
		support.RawICMPIPv4 = true
	} else {
		support.RawICMPIPv4Reason = sanitizeSupportReason(err)
	}

	if err := detectRawICMPIPv6(); err == nil {
		support.RawICMPIPv6 = true
	} else {
		support.RawICMPIPv6Reason = sanitizeSupportReason(err)
	}

	rawSupported := support.RawICMPIPv4 || support.RawICMPIPv6
	support.ICMPPing = rawSupported
	support.Traceroute = rawSupported
	support.MTR = rawSupported

	if socketPath, err := resolveBirdSocketPath(nil); err == nil {
		support.BirdRoute = true
		support.BirdSocketPath = socketPath
	} else {
		support.BirdRouteReason = sanitizeSupportReason(err)
	}

	return support
}

func FilterCapabilitiesBySupport(capabilities []string, support SystemSupport) []string {
	filtered := make([]string, 0, len(capabilities))
	seen := make(map[string]struct{}, len(capabilities))

	for _, capability := range capabilities {
		capability = strings.TrimSpace(capability)
		if capability == "" {
			continue
		}
		if _, exists := seen[capability]; exists {
			continue
		}
		seen[capability] = struct{}{}

		switch capability {
		case "icmp_ping":
			if support.ICMPPing {
				filtered = append(filtered, capability)
			}
		case "traceroute":
			if support.Traceroute {
				filtered = append(filtered, capability)
			}
		case "mtr":
			if support.MTR {
				filtered = append(filtered, capability)
			}
		case "bird_route":
			if support.BirdRoute {
				filtered = append(filtered, capability)
			}
		default:
			filtered = append(filtered, capability)
		}
	}

	return filtered
}

func (s SystemSupport) ApplyMetadata(metadata map[string]string) {
	if metadata == nil {
		return
	}

	metadata["system_platform"] = s.Platform
	metadata["support_raw_icmp_ipv4"] = boolString(s.RawICMPIPv4)
	metadata["support_raw_icmp_ipv6"] = boolString(s.RawICMPIPv6)
	metadata["support_icmp_ping"] = boolString(s.ICMPPing)
	metadata["support_tcp_ping"] = boolString(s.TCPPing)
	metadata["support_http_test"] = boolString(s.HTTPTest)
	metadata["support_traceroute"] = boolString(s.Traceroute)
	metadata["support_mtr"] = boolString(s.MTR)
	metadata["support_bird_route"] = boolString(s.BirdRoute)

	if reason := s.RawICMPReason(); reason != "" {
		metadata["support_icmp_ping_reason"] = reason
		metadata["support_traceroute_reason"] = reason
		metadata["support_mtr_reason"] = reason
	}
	if s.RawICMPIPv4Reason != "" {
		metadata["support_raw_icmp_ipv4_reason"] = s.RawICMPIPv4Reason
	}
	if s.RawICMPIPv6Reason != "" {
		metadata["support_raw_icmp_ipv6_reason"] = s.RawICMPIPv6Reason
	}
	if s.BirdRouteReason != "" {
		metadata["support_bird_route_reason"] = s.BirdRouteReason
	}
	if s.BirdSocketPath != "" {
		metadata["bird_socket_path"] = s.BirdSocketPath
	}
}

func (s SystemSupport) RawICMPReason() string {
	switch {
	case s.RawICMPIPv4Reason != "" && s.RawICMPIPv6Reason != "":
		if s.RawICMPIPv4Reason == s.RawICMPIPv6Reason {
			return s.RawICMPIPv4Reason
		}
		return fmt.Sprintf("ipv4: %s; ipv6: %s", s.RawICMPIPv4Reason, s.RawICMPIPv6Reason)
	case s.RawICMPIPv4Reason != "":
		return "ipv4: " + s.RawICMPIPv4Reason
	case s.RawICMPIPv6Reason != "":
		return "ipv6: " + s.RawICMPIPv6Reason
	default:
		return ""
	}
}

func detectRawICMPIPv4() error {
	conn, err := icmp.ListenPacket("ip4:icmp", "0.0.0.0")
	if err != nil {
		return err
	}
	defer conn.Close()

	if err := conn.IPv4PacketConn().SetControlMessage(ipv4.FlagTTL, true); err != nil {
		return err
	}
	return nil
}

func detectRawICMPIPv6() error {
	conn, err := icmp.ListenPacket("ip6:ipv6-icmp", "::")
	if err != nil {
		return err
	}
	defer conn.Close()

	if err := conn.IPv6PacketConn().SetControlMessage(ipv6.FlagHopLimit, true); err != nil {
		return err
	}
	return nil
}

func sanitizeSupportReason(err error) string {
	if err == nil {
		return ""
	}
	return strings.TrimSpace(err.Error())
}

func boolString(value bool) string {
	if value {
		return "true"
	}
	return "false"
}
