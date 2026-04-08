package handler

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"atlas/web/internal/database"
	"atlas/web/internal/model"
)

func newTaskHandlerTestDB(t *testing.T) *database.Database {
	t.Helper()

	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd failed: %v", err)
	}
	webRoot := filepath.Clean(filepath.Join(wd, "..", "..", ".."))
	if err := os.Chdir(webRoot); err != nil {
		t.Fatalf("Chdir failed: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(wd)
	})

	db, err := database.New(filepath.Join(t.TempDir(), "atlas-task-handler.db"))
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

func seedTaskHandlerProbe(t *testing.T, db *database.Database, probeID string, capabilities string, status string) {
	t.Helper()

	if err := db.SaveProbe(&model.Probe{
		ProbeID:       probeID,
		Name:          probeID,
		Location:      "Test Lab",
		Region:        "test",
		Capabilities:  capabilities,
		Status:        status,
		LastHeartbeat: time.Now(),
		Metadata:      `{}`,
	}); err != nil {
		t.Fatalf("SaveProbe failed: %v", err)
	}
}

func TestResolveRouteProbeIDsAutoSelectsCompatibleOnlineProbes(t *testing.T) {
	db := newTaskHandlerTestDB(t)
	handler := &TaskHandler{db: db}

	seedTaskHandlerProbe(t, db, "probe-trace-1", `["traceroute"]`, "online")
	seedTaskHandlerProbe(t, db, "probe-ping-only", `["icmp_ping"]`, "online")
	seedTaskHandlerProbe(t, db, "probe-all", `["all"]`, "online")

	selected, err := handler.resolveRouteProbeIDs("traceroute", nil)
	if err != nil {
		t.Fatalf("resolveRouteProbeIDs returned error: %v", err)
	}

	if len(selected) != 2 {
		t.Fatalf("expected 2 traceroute-capable probes, got %d (%v)", len(selected), selected)
	}
}

func TestResolveRouteProbeIDsRejectsUnsupportedExplicitProbe(t *testing.T) {
	db := newTaskHandlerTestDB(t)
	handler := &TaskHandler{db: db}

	seedTaskHandlerProbe(t, db, "probe-ping-only", `["icmp_ping"]`, "online")

	_, err := handler.resolveRouteProbeIDs("traceroute", []string{"probe-ping-only"})
	if err == nil {
		t.Fatal("expected unsupported probe error")
	}
	if err.Error() != "probe probe-ping-only does not support traceroute" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResolveTracerouteProbeIDsRequiresExactlyOneExplicitProbe(t *testing.T) {
	db := newTaskHandlerTestDB(t)
	handler := &TaskHandler{db: db}

	seedTaskHandlerProbe(t, db, "probe-trace-1", `["traceroute"]`, "online")
	seedTaskHandlerProbe(t, db, "probe-trace-2", `["traceroute"]`, "online")

	if _, err := handler.resolveTracerouteProbeIDs(nil); err == nil {
		t.Fatal("expected explicit single probe requirement error")
	} else if err.Error() != "traceroute requires exactly one assigned probe" {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := handler.resolveTracerouteProbeIDs([]string{"probe-trace-1", "probe-trace-2"}); err == nil {
		t.Fatal("expected multiple probe rejection error")
	} else if err.Error() != "traceroute requires exactly one assigned probe" {
		t.Fatalf("unexpected error: %v", err)
	}

	selected, err := handler.resolveTracerouteProbeIDs([]string{"probe-trace-2"})
	if err != nil {
		t.Fatalf("resolveTracerouteProbeIDs returned error: %v", err)
	}
	if len(selected) != 1 || selected[0] != "probe-trace-2" {
		t.Fatalf("expected probe-trace-2, got %v", selected)
	}
}

func TestResolveRouteProbeIDsSupportsMTRCapabilityFiltering(t *testing.T) {
	db := newTaskHandlerTestDB(t)
	handler := &TaskHandler{db: db}

	seedTaskHandlerProbe(t, db, "probe-mtr-1", `["mtr"]`, "online")
	seedTaskHandlerProbe(t, db, "probe-trace-only", `["traceroute"]`, "online")

	selected, err := handler.resolveRouteProbeIDs("mtr", nil)
	if err != nil {
		t.Fatalf("resolveRouteProbeIDs returned error: %v", err)
	}

	if len(selected) != 1 || selected[0] != "probe-mtr-1" {
		t.Fatalf("expected only mtr-capable probe, got %v", selected)
	}
}
