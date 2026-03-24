package client

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"atlas/shared/protocol"
)

var releaseVersionPattern = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

type remoteUpgradeConfig struct {
	RequestDir string
	Supported  bool
	Channel    string
	DeployMode string
	Reason     string
}

func detectRemoteUpgradeConfig() remoteUpgradeConfig {
	cfg := remoteUpgradeConfig{
		RequestDir: strings.TrimSpace(os.Getenv("ATLAS_UPGRADE_REQUEST_DIR")),
		DeployMode: strings.TrimSpace(os.Getenv("PROBE_DEPLOY_MODE")),
	}

	if cfg.DeployMode == "" {
		switch {
		case cfg.RequestDir != "":
			cfg.DeployMode = "systemd"
		default:
			cfg.DeployMode = "standalone"
		}
	}

	switch {
	case cfg.RequestDir != "":
		cfg.Supported = true
		cfg.Channel = "queue_dir"
	default:
		cfg.Supported = false
		cfg.Channel = "none"
		cfg.Reason = "probe is not configured for remote upgrade"
	}

	return cfg
}

func (c *Client) requestUpgrade(msg protocol.ProbeUpgradeMessage) error {
	cfg := detectRemoteUpgradeConfig()
	if !cfg.Supported {
		return errors.New(cfg.Reason)
	}

	version := strings.TrimSpace(msg.Version)
	if version != "" {
		normalized := strings.TrimPrefix(version, "v")
		if normalized == "" || !releaseVersionPattern.MatchString(normalized) {
			return fmt.Errorf("invalid upgrade version: %q", version)
		}
	}

	content := fmt.Sprintf(
		"upgrade_id=%s\nversion=%s\nrequested_at=%d\n",
		strings.TrimSpace(msg.UpgradeID),
		version,
		time.Now().Unix(),
	)

	if cfg.RequestDir != "" {
		return enqueueUpgradeRequest(cfg.RequestDir, content)
	}

	return errors.New(cfg.Reason)
}

func enqueueUpgradeRequest(requestDir, content string) error {
	if err := os.MkdirAll(requestDir, 0o755); err != nil {
		return fmt.Errorf("failed to create upgrade request dir: %w", err)
	}

	if err := ensureUpgradeQueueIsIdle(requestDir); err != nil {
		return err
	}

	tmpFile, err := os.CreateTemp(requestDir, "upgrade-*.tmp")
	if err != nil {
		return fmt.Errorf("failed to create upgrade request temp file: %w", err)
	}
	tmpPath := tmpFile.Name()
	finalName := strings.TrimSuffix(filepath.Base(tmpPath), ".tmp") + ".env"
	finalPath := filepath.Join(requestDir, finalName)

	if _, err := tmpFile.WriteString(content); err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpPath)
		return fmt.Errorf("failed to write upgrade request: %w", err)
	}
	if err := tmpFile.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("failed to close upgrade request temp file: %w", err)
	}
	if err := os.Chmod(tmpPath, 0o640); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("failed to set upgrade request permissions: %w", err)
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("failed to activate upgrade request: %w", err)
	}

	return nil
}

func ensureUpgradeQueueIsIdle(requestDir string) error {
	entries, err := os.ReadDir(requestDir)
	if err != nil {
		return fmt.Errorf("failed to inspect upgrade queue: %w", err)
	}

	for _, entry := range entries {
		name := entry.Name()
		if strings.HasSuffix(name, ".env") {
			return fmt.Errorf("another upgrade request is already queued")
		}
		if strings.HasSuffix(name, ".active") {
			return fmt.Errorf("another upgrade is already in progress")
		}
	}

	return nil
}
