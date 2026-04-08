package database

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"atlas/web/internal/model"
)

func newTestDatabase(t *testing.T) *Database {
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

	dbPath := filepath.Join(t.TempDir(), "atlas-test.db")
	db, err := New(dbPath)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	if err := db.Migrate(); err != nil {
		t.Fatalf("Migrate failed: %v", err)
	}

	return db
}

func seedTestProbe(t *testing.T, db *Database, probeID string) {
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

func TestProbeUpgradeLifecycle(t *testing.T) {
	db := newTestDatabase(t)
	seedTestProbe(t, db, "probe-1")

	upgrade := &model.ProbeUpgrade{
		UpgradeID:     "upgrade-1",
		ProbeID:       "probe-1",
		FromVersion:   "v1.0.0",
		TargetVersion: "v1.1.0",
		Status:        model.ProbeUpgradeStatusQueued,
		RequestedAt:   time.Now(),
	}
	if err := db.CreateProbeUpgrade(upgrade); err != nil {
		t.Fatalf("CreateProbeUpgrade failed: %v", err)
	}

	if err := db.MarkProbeUpgradeAccepted(upgrade.UpgradeID); err != nil {
		t.Fatalf("MarkProbeUpgradeAccepted failed: %v", err)
	}

	active, err := db.GetActiveProbeUpgrade(upgrade.ProbeID)
	if err != nil {
		t.Fatalf("GetActiveProbeUpgrade failed: %v", err)
	}
	if active == nil || active.Status != model.ProbeUpgradeStatusAccepted {
		t.Fatalf("expected accepted active upgrade, got %#v", active)
	}

	reconciled, err := db.ReconcileProbeUpgradeVersion(upgrade.ProbeID, "v1.1.0")
	if err != nil {
		t.Fatalf("ReconcileProbeUpgradeVersion failed: %v", err)
	}
	if reconciled == nil || reconciled.Status != model.ProbeUpgradeStatusApplied {
		t.Fatalf("expected applied reconciled upgrade, got %#v", reconciled)
	}
	if reconciled.CompletedAt == nil {
		t.Fatal("expected completed_at to be set")
	}
}

func TestTimeoutStaleProbeUpgrades(t *testing.T) {
	db := newTestDatabase(t)
	seedTestProbe(t, db, "probe-2")

	upgrade := &model.ProbeUpgrade{
		UpgradeID:     "upgrade-timeout",
		ProbeID:       "probe-2",
		FromVersion:   "v1.0.0",
		TargetVersion: "v1.2.0",
		Status:        model.ProbeUpgradeStatusQueued,
		RequestedAt:   time.Now().Add(-time.Hour),
	}
	if err := db.CreateProbeUpgrade(upgrade); err != nil {
		t.Fatalf("CreateProbeUpgrade failed: %v", err)
	}

	count, err := db.TimeoutStaleProbeUpgrades(5 * time.Minute)
	if err != nil {
		t.Fatalf("TimeoutStaleProbeUpgrades failed: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 timed out upgrade, got %d", count)
	}

	stored, err := db.GetProbeUpgrade(upgrade.UpgradeID)
	if err != nil {
		t.Fatalf("GetProbeUpgrade failed: %v", err)
	}
	if stored.Status != model.ProbeUpgradeStatusTimeout {
		t.Fatalf("expected timeout status, got %q", stored.Status)
	}
	if stored.CompletedAt == nil {
		t.Fatal("expected completed_at to be set")
	}
}

func TestReconcileProbeUpgradeVersionAppliesLatestTargetWithReportedVersion(t *testing.T) {
	db := newTestDatabase(t)
	seedTestProbe(t, db, "probe-latest")

	ackedAt := time.Now().Add(-time.Minute)
	upgrade := &model.ProbeUpgrade{
		UpgradeID:     "upgrade-latest",
		ProbeID:       "probe-latest",
		FromVersion:   "v1.0.0",
		TargetVersion: model.ProbeUpgradeTargetLatest,
		Status:        model.ProbeUpgradeStatusAccepted,
		RequestedAt:   time.Now().Add(-2 * time.Minute),
		AckedAt:       &ackedAt,
	}
	if err := db.CreateProbeUpgrade(upgrade); err != nil {
		t.Fatalf("CreateProbeUpgrade failed: %v", err)
	}

	reconciled, err := db.ReconcileProbeUpgradeVersion(upgrade.ProbeID, "v1.1.0")
	if err != nil {
		t.Fatalf("ReconcileProbeUpgradeVersion failed: %v", err)
	}
	if reconciled == nil || reconciled.Status != model.ProbeUpgradeStatusApplied {
		t.Fatalf("expected applied reconciled upgrade, got %#v", reconciled)
	}
	if reconciled.TargetVersion != "v1.1.0" {
		t.Fatalf("expected target version to be updated to reported version, got %q", reconciled.TargetVersion)
	}
}

func TestReconcileProbeUpgradeVersionAppliesAcceptedLatestEvenIfVersionUnchanged(t *testing.T) {
	db := newTestDatabase(t)
	seedTestProbe(t, db, "probe-same")

	ackedAt := time.Now().Add(-time.Minute)
	upgrade := &model.ProbeUpgrade{
		UpgradeID:     "upgrade-same-version",
		ProbeID:       "probe-same",
		FromVersion:   "v1.0.0",
		TargetVersion: model.ProbeUpgradeTargetLatest,
		Status:        model.ProbeUpgradeStatusAccepted,
		RequestedAt:   time.Now().Add(-2 * time.Minute),
		AckedAt:       &ackedAt,
	}
	if err := db.CreateProbeUpgrade(upgrade); err != nil {
		t.Fatalf("CreateProbeUpgrade failed: %v", err)
	}

	reconciled, err := db.ReconcileProbeUpgradeVersion(upgrade.ProbeID, "v1.0.0")
	if err != nil {
		t.Fatalf("ReconcileProbeUpgradeVersion failed: %v", err)
	}
	if reconciled == nil || reconciled.Status != model.ProbeUpgradeStatusApplied {
		t.Fatalf("expected applied reconciled upgrade, got %#v", reconciled)
	}
	if reconciled.TargetVersion != "v1.0.0" {
		t.Fatalf("expected target version to be updated to current version, got %q", reconciled.TargetVersion)
	}
}
