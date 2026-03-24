package websocket

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"atlas/web/internal/database"
	"atlas/web/internal/model"
)

func newTestDatabase(t *testing.T) *database.Database {
	t.Helper()

	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd failed: %v", err)
	}
	webRoot := filepath.Clean(filepath.Join(wd, "..", ".."))
	if err := os.Chdir(webRoot); err != nil {
		t.Fatalf("Chdir failed: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(wd)
	})

	dbPath := filepath.Join(t.TempDir(), "atlas-websocket.db")
	db, err := database.New(dbPath)
	if err != nil {
		t.Fatalf("database.New failed: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	if err := db.Migrate(); err != nil {
		t.Fatalf("Migrate failed: %v", err)
	}

	return db
}

func seedTestProbe(t *testing.T, db *database.Database, probeID string) {
	t.Helper()

	if err := db.SaveProbe(&model.Probe{
		ProbeID:       probeID,
		Name:          probeID,
		Location:      "Test Lab",
		Region:        "test",
		Capabilities:  `["icmp_ping"]`,
		Status:        "online",
		LastHeartbeat: time.Now(),
		Metadata:      `{}`,
	}); err != nil {
		t.Fatalf("SaveProbe failed: %v", err)
	}
}

func TestHandleProbeUpgradeAckAccepted(t *testing.T) {
	db := newTestDatabase(t)
	seedTestProbe(t, db, "probe-1")
	upgrade := &model.ProbeUpgrade{
		UpgradeID:     "upgrade-ack-accepted",
		ProbeID:       "probe-1",
		TargetVersion: "v1.2.3",
		Status:        model.ProbeUpgradeStatusQueued,
		RequestedAt:   time.Now(),
	}
	if err := db.CreateProbeUpgrade(upgrade); err != nil {
		t.Fatalf("CreateProbeUpgrade failed: %v", err)
	}

	conn := &Connection{
		hub:     &Hub{db: db},
		ProbeID: "probe-1",
	}

	err := conn.handleProbeUpgradeAck(map[string]interface{}{
		"data": map[string]interface{}{
			"upgrade_id": "upgrade-ack-accepted",
			"accepted":   true,
		},
	})
	if err != nil {
		t.Fatalf("handleProbeUpgradeAck returned error: %v", err)
	}

	stored, err := db.GetProbeUpgrade(upgrade.UpgradeID)
	if err != nil {
		t.Fatalf("GetProbeUpgrade failed: %v", err)
	}
	if stored.Status != model.ProbeUpgradeStatusAccepted {
		t.Fatalf("expected accepted status, got %q", stored.Status)
	}
	if stored.AckedAt == nil {
		t.Fatal("expected acked_at to be set")
	}
}

func TestHandleProbeUpgradeAckRejected(t *testing.T) {
	db := newTestDatabase(t)
	seedTestProbe(t, db, "probe-2")
	upgrade := &model.ProbeUpgrade{
		UpgradeID:     "upgrade-ack-rejected",
		ProbeID:       "probe-2",
		TargetVersion: "v1.2.3",
		Status:        model.ProbeUpgradeStatusQueued,
		RequestedAt:   time.Now(),
	}
	if err := db.CreateProbeUpgrade(upgrade); err != nil {
		t.Fatalf("CreateProbeUpgrade failed: %v", err)
	}

	conn := &Connection{
		hub:     &Hub{db: db},
		ProbeID: "probe-2",
	}

	err := conn.handleProbeUpgradeAck(map[string]interface{}{
		"data": map[string]interface{}{
			"upgrade_id": "upgrade-ack-rejected",
			"accepted":   false,
			"error":      "upgrade helper is busy",
		},
	})
	if err != nil {
		t.Fatalf("handleProbeUpgradeAck returned error: %v", err)
	}

	stored, err := db.GetProbeUpgrade(upgrade.UpgradeID)
	if err != nil {
		t.Fatalf("GetProbeUpgrade failed: %v", err)
	}
	if stored.Status != model.ProbeUpgradeStatusRejected {
		t.Fatalf("expected rejected status, got %q", stored.Status)
	}
	if stored.ErrorMessage == nil || *stored.ErrorMessage != "upgrade helper is busy" {
		t.Fatalf("expected rejection error to be stored, got %#v", stored.ErrorMessage)
	}
}
