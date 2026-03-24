package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"atlas/web/internal/model"
)

const defaultProbeReleaseRepo = "MoeclubM/Atlas"

var normalizedReleaseVersionPattern = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

type latestProbeVersionResolver func(context.Context) (string, error)

type probeMetadataInfo struct {
	Version          string
	DeployMode       string
	UpgradeChannel   string
	UpgradeReason    string
	UpgradeSupported bool
}

type releaseVersionParts struct {
	Major int
	Minor int
	Patch int
}

type adminProbeDTO struct {
	*model.Probe
	UpgradeSupported bool                `json:"upgrade_supported"`
	UpgradeReason    string              `json:"upgrade_reason,omitempty"`
	DeployMode       string              `json:"deploy_mode,omitempty"`
	UpgradeChannel   string              `json:"upgrade_channel,omitempty"`
	LatestUpgrade    *model.ProbeUpgrade `json:"latest_upgrade,omitempty"`
}

func defaultLatestProbeVersionResolver(ctx context.Context) (string, error) {
	repo := strings.TrimSpace(os.Getenv("ATLAS_RELEASE_REPO"))
	if repo == "" {
		repo = defaultProbeReleaseRepo
	}

	parts := strings.Split(repo, "/")
	if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
		return "", fmt.Errorf("invalid ATLAS_RELEASE_REPO: %q", repo)
	}

	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "atlas-web")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to query latest probe release: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("latest probe release lookup failed with status %d", resp.StatusCode)
	}

	var payload struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", fmt.Errorf("failed to decode latest probe release: %w", err)
	}

	return normalizeRequestedUpgradeVersion(payload.TagName)
}

func normalizeRequestedUpgradeVersion(version string) (string, error) {
	version = strings.TrimSpace(version)
	if version == "" {
		return "", fmt.Errorf("upgrade version is required")
	}

	normalized := strings.TrimPrefix(version, "v")
	if normalized == "" || !normalizedReleaseVersionPattern.MatchString(normalized) {
		return "", fmt.Errorf("invalid upgrade version: %q", version)
	}

	if strings.HasPrefix(version, "v") {
		return version, nil
	}
	return "v" + normalized, nil
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
		Version:        stringValue(metadata["version"]),
		DeployMode:     stringValue(metadata["deploy_mode"]),
		UpgradeChannel: stringValue(metadata["upgrade_channel"]),
		UpgradeReason:  stringValue(metadata["upgrade_reason"]),
	}

	_, hasUpgradeSupported := metadata["upgrade_supported"]
	if hasUpgradeSupported {
		info.UpgradeSupported = boolValue(metadata["upgrade_supported"])
	} else if supportsLegacyRemoteUpgrade(info.Version, info.DeployMode) {
		info.UpgradeSupported = true
		if info.UpgradeChannel == "" {
			info.UpgradeChannel = "legacy_request_file"
		}
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

func supportsLegacyRemoteUpgrade(version, deployMode string) bool {
	if strings.EqualFold(strings.TrimSpace(deployMode), "dev-docker") {
		return false
	}

	parts, ok := parseReleaseVersionParts(version)
	if !ok {
		return false
	}

	minimum := releaseVersionParts{Major: 0, Minor: 1, Patch: 3}
	switch {
	case parts.Major != minimum.Major:
		return parts.Major > minimum.Major
	case parts.Minor != minimum.Minor:
		return parts.Minor > minimum.Minor
	default:
		return parts.Patch >= minimum.Patch
	}
}

func parseReleaseVersionParts(version string) (releaseVersionParts, bool) {
	normalized := strings.TrimPrefix(strings.TrimSpace(version), "v")
	if normalized == "" {
		return releaseVersionParts{}, false
	}

	segments := strings.Split(normalized, ".")
	if len(segments) < 3 {
		return releaseVersionParts{}, false
	}

	major, ok := parseVersionPart(segments[0])
	if !ok {
		return releaseVersionParts{}, false
	}
	minor, ok := parseVersionPart(segments[1])
	if !ok {
		return releaseVersionParts{}, false
	}
	patch, ok := parseVersionPart(segments[2])
	if !ok {
		return releaseVersionParts{}, false
	}

	return releaseVersionParts{Major: major, Minor: minor, Patch: patch}, true
}

func parseVersionPart(value string) (int, bool) {
	if value == "" {
		return 0, false
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return 0, false
		}
	}

	parsed := 0
	for _, r := range value {
		parsed = parsed*10 + int(r-'0')
	}
	return parsed, true
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
