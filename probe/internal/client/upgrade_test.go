package client

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"atlas/shared/protocol"
)

func TestRequestUpgradeWritesQueueFile(t *testing.T) {
	requestDir := t.TempDir()
	t.Setenv("ATLAS_UPGRADE_REQUEST_DIR", requestDir)

	c := &Client{}
	if err := c.requestUpgrade(protocol.ProbeUpgradeMessage{
		UpgradeID: "upgrade-1",
		Version:   "v1.2.3",
	}); err != nil {
		t.Fatalf("requestUpgrade returned error: %v", err)
	}

	entries, err := os.ReadDir(requestDir)
	if err != nil {
		t.Fatalf("ReadDir failed: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 queued request, got %d", len(entries))
	}
	if !strings.HasSuffix(entries[0].Name(), ".env") {
		t.Fatalf("expected queued request file to end with .env, got %q", entries[0].Name())
	}

	content, err := os.ReadFile(filepath.Join(requestDir, entries[0].Name()))
	if err != nil {
		t.Fatalf("ReadFile failed: %v", err)
	}
	text := string(content)
	if !strings.Contains(text, "upgrade_id=upgrade-1") {
		t.Fatalf("missing upgrade_id in request file: %q", text)
	}
	if !strings.Contains(text, "version=v1.2.3") {
		t.Fatalf("missing version in request file: %q", text)
	}
}

func TestRequestUpgradeRejectsWhenQueued(t *testing.T) {
	requestDir := t.TempDir()
	t.Setenv("ATLAS_UPGRADE_REQUEST_DIR", requestDir)

	queuedPath := filepath.Join(requestDir, "upgrade-existing.env")
	if err := os.WriteFile(queuedPath, []byte("version=v1.0.0\n"), 0o640); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	c := &Client{}
	err := c.requestUpgrade(protocol.ProbeUpgradeMessage{
		UpgradeID: "upgrade-2",
		Version:   "v1.2.3",
	})
	if err == nil {
		t.Fatal("expected requestUpgrade to reject queued upgrade")
	}
	if !strings.Contains(err.Error(), "already queued") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDetectRemoteUpgradeConfigUnsupported(t *testing.T) {
	t.Setenv("ATLAS_UPGRADE_REQUEST_DIR", "")
	t.Setenv("PROBE_DEPLOY_MODE", "dev-docker")

	cfg := detectRemoteUpgradeConfig()
	if cfg.Supported {
		t.Fatal("expected upgrade to be unsupported")
	}
	if cfg.DeployMode != "dev-docker" {
		t.Fatalf("expected deploy mode dev-docker, got %q", cfg.DeployMode)
	}
	if cfg.Reason == "" {
		t.Fatal("expected unsupported reason to be populated")
	}
}
