package handler

import (
	"encoding/json"
	"strings"

	"atlas/web/internal/model"
)

type probeMetadataInfo struct {
	Version          string
	DeployMode       string
	UpgradeChannel   string
	UpgradeReason    string
	UpgradeSupported bool
	SystemSupport    adminProbeSystemSupportDTO
}

type adminProbeSystemSupportDTO struct {
	Reported          bool   `json:"reported"`
	Platform          string `json:"platform,omitempty"`
	RawICMPIPv4       bool   `json:"raw_icmp_ipv4"`
	RawICMPIPv4Reason string `json:"raw_icmp_ipv4_reason,omitempty"`
	RawICMPIPv6       bool   `json:"raw_icmp_ipv6"`
	RawICMPIPv6Reason string `json:"raw_icmp_ipv6_reason,omitempty"`
	ICMPPing          bool   `json:"icmp_ping"`
	ICMPPingReason    string `json:"icmp_ping_reason,omitempty"`
	TCPPing           bool   `json:"tcp_ping"`
	HTTPTest          bool   `json:"http_test"`
	Traceroute        bool   `json:"traceroute"`
	TracerouteReason  string `json:"traceroute_reason,omitempty"`
	MTR               bool   `json:"mtr"`
	MTRReason         string `json:"mtr_reason,omitempty"`
	BirdRoute         bool   `json:"bird_route"`
	BirdRouteReason   string `json:"bird_route_reason,omitempty"`
	BirdSocketPath    string `json:"bird_socket_path,omitempty"`
}

type adminProbeDTO struct {
	*model.Probe
	UpgradeSupported bool                       `json:"upgrade_supported"`
	UpgradeReason    string                     `json:"upgrade_reason,omitempty"`
	DeployMode       string                     `json:"deploy_mode,omitempty"`
	UpgradeChannel   string                     `json:"upgrade_channel,omitempty"`
	LatestUpgrade    *model.ProbeUpgrade        `json:"latest_upgrade,omitempty"`
	SystemSupport    adminProbeSystemSupportDTO `json:"system_support"`
}

func parseProbeMetadataInfo(raw string) probeMetadataInfo {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return probeMetadataInfo{}
	}

	var metadata map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &metadata); err != nil {
		return probeMetadataInfo{}
	}

	info := probeMetadataInfo{
		Version:          stringValue(metadata["version"]),
		DeployMode:       stringValue(metadata["deploy_mode"]),
		UpgradeChannel:   stringValue(metadata["upgrade_channel"]),
		UpgradeReason:    stringValue(metadata["upgrade_reason"]),
		UpgradeSupported: boolValue(metadata["upgrade_supported"]),
		SystemSupport:    parseProbeSystemSupport(metadata),
	}

	if !info.UpgradeSupported && info.UpgradeReason == "" {
		switch info.DeployMode {
		case "dev-docker":
			info.UpgradeReason = "dev probe does not support remote upgrade"
		default:
			info.UpgradeReason = "probe is not configured for remote upgrade"
		}
	}

	return info
}

func buildAdminProbeDTO(probe *model.Probe, latestUpgrade *model.ProbeUpgrade) *adminProbeDTO {
	info := parseProbeMetadataInfo(probe.Metadata)
	return &adminProbeDTO{
		Probe:            probe,
		UpgradeSupported: info.UpgradeSupported,
		UpgradeReason:    info.UpgradeReason,
		DeployMode:       info.DeployMode,
		UpgradeChannel:   info.UpgradeChannel,
		LatestUpgrade:    latestUpgrade,
		SystemSupport:    info.SystemSupport,
	}
}

func parseProbeSystemSupport(metadata map[string]interface{}) adminProbeSystemSupportDTO {
	platform := stringValue(metadata["system_platform"])
	if platform == "" {
		osValue := stringValue(metadata["os"])
		archValue := stringValue(metadata["arch"])
		switch {
		case osValue != "" && archValue != "":
			platform = osValue + "/" + archValue
		case osValue != "":
			platform = osValue
		case archValue != "":
			platform = archValue
		}
	}

	reported := hasAnyMetadataKey(
		metadata,
		"system_platform",
		"support_raw_icmp_ipv4",
		"support_raw_icmp_ipv6",
		"support_icmp_ping",
		"support_tcp_ping",
		"support_http_test",
		"support_traceroute",
		"support_mtr",
		"support_bird_route",
	)

	return adminProbeSystemSupportDTO{
		Reported:          reported,
		Platform:          platform,
		RawICMPIPv4:       boolValue(metadata["support_raw_icmp_ipv4"]),
		RawICMPIPv4Reason: stringValue(metadata["support_raw_icmp_ipv4_reason"]),
		RawICMPIPv6:       boolValue(metadata["support_raw_icmp_ipv6"]),
		RawICMPIPv6Reason: stringValue(metadata["support_raw_icmp_ipv6_reason"]),
		ICMPPing:          boolValue(metadata["support_icmp_ping"]),
		ICMPPingReason:    stringValue(metadata["support_icmp_ping_reason"]),
		TCPPing:           boolValue(metadata["support_tcp_ping"]),
		HTTPTest:          boolValue(metadata["support_http_test"]),
		Traceroute:        boolValue(metadata["support_traceroute"]),
		TracerouteReason:  stringValue(metadata["support_traceroute_reason"]),
		MTR:               boolValue(metadata["support_mtr"]),
		MTRReason:         stringValue(metadata["support_mtr_reason"]),
		BirdRoute:         boolValue(metadata["support_bird_route"]),
		BirdRouteReason:   stringValue(metadata["support_bird_route_reason"]),
		BirdSocketPath:    stringValue(metadata["bird_socket_path"]),
	}
}

func stringValue(value interface{}) string {
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	default:
		return ""
	}
}

func boolValue(value interface{}) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		switch strings.ToLower(strings.TrimSpace(v)) {
		case "1", "true", "yes", "on":
			return true
		}
	}
	return false
}

func hasAnyMetadataKey(metadata map[string]interface{}, keys ...string) bool {
	for _, key := range keys {
		if _, exists := metadata[key]; exists {
			return true
		}
	}
	return false
}
