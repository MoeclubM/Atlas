package client

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"atlas/shared/protocol"
)

var releaseVersionPattern = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

func (c *Client) requestUpgrade(msg protocol.ProbeUpgradeMessage) error {
	requestPath := strings.TrimSpace(os.Getenv("ATLAS_UPGRADE_REQUEST_FILE"))
	if requestPath == "" {
		return fmt.Errorf("remote upgrade is not configured on this probe")
	}

	version := strings.TrimSpace(msg.Version)
	if version != "" {
		normalized := strings.TrimPrefix(version, "v")
		if normalized == "" || !releaseVersionPattern.MatchString(normalized) {
			return fmt.Errorf("invalid upgrade version: %q", version)
		}
	}

	if err := os.MkdirAll(filepath.Dir(requestPath), 0o755); err != nil {
		return fmt.Errorf("failed to create upgrade request dir: %w", err)
	}

	tmpPath := requestPath + ".tmp"
	content := fmt.Sprintf("version=%s\nrequested_at=%d\n", version, time.Now().Unix())
	if err := os.WriteFile(tmpPath, []byte(content), 0o640); err != nil {
		return fmt.Errorf("failed to write upgrade request: %w", err)
	}

	if err := os.Rename(tmpPath, requestPath); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("failed to activate upgrade request: %w", err)
	}

	return nil
}
