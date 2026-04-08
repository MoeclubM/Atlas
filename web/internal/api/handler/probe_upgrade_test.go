package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"atlas/shared/protocol"
	"atlas/web/internal/model"
)

func TestParseProbeMetadataInfoFallbackReason(t *testing.T) {
	info := parseProbeMetadataInfo(`{"deploy_mode":"dev-docker","upgrade_supported":"false"}`)
	if info.UpgradeSupported {
		t.Fatal("expected upgrade_supported=false")
	}
	if info.UpgradeReason == "" {
		t.Fatal("expected fallback upgrade reason")
	}
	if info.DeployMode != "dev-docker" {
		t.Fatalf("expected deploy_mode dev-docker, got %q", info.DeployMode)
	}
}

func TestParseProbeMetadataInfoSystemSupport(t *testing.T) {
	info := parseProbeMetadataInfo(`{
		"os":"linux",
		"arch":"amd64",
		"system_platform":"linux/amd64",
		"support_raw_icmp_ipv4":"true",
		"support_raw_icmp_ipv6":"false",
		"support_raw_icmp_ipv6_reason":"operation not permitted",
		"support_icmp_ping":"true",
		"support_tcp_ping":"true",
		"support_http_test":"true",
		"support_traceroute":"true",
		"support_mtr":"true",
		"support_bird_route":"false",
		"support_bird_route_reason":"bird control socket not found"
	}`)

	if !info.SystemSupport.Reported {
		t.Fatal("expected reported system support")
	}
	if info.SystemSupport.Platform != "linux/amd64" {
		t.Fatalf("expected platform linux/amd64, got %q", info.SystemSupport.Platform)
	}
	if !info.SystemSupport.RawICMPIPv4 {
		t.Fatal("expected raw icmp ipv4 support")
	}
	if info.SystemSupport.RawICMPIPv6 {
		t.Fatal("expected raw icmp ipv6 unsupported")
	}
	if info.SystemSupport.RawICMPIPv6Reason == "" {
		t.Fatal("expected raw icmp ipv6 reason")
	}
	if !info.SystemSupport.TCPPing || !info.SystemSupport.HTTPTest {
		t.Fatal("expected tcp/http support")
	}
	if info.SystemSupport.BirdRoute {
		t.Fatal("expected bird route unsupported")
	}
	if info.SystemSupport.BirdRouteReason == "" {
		t.Fatal("expected bird route reason")
	}
}

func TestUpgradeProbeQueuesLatestCommandWithoutVersion(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newTaskHandlerTestDB(t)
	if err := db.SaveProbe(&model.Probe{
		ProbeID:       "probe-upgrade-latest",
		Name:          "probe-upgrade-latest",
		Location:      "Test Lab",
		Region:        "test",
		Capabilities:  `["icmp_ping"]`,
		Status:        "online",
		LastHeartbeat: time.Now(),
		Metadata:      `{"version":"v1.0.0","upgrade_supported":"true","deploy_mode":"systemd","upgrade_channel":"queue_dir"}`,
	}); err != nil {
		t.Fatalf("SaveProbe failed: %v", err)
	}

	var sentProbeID string
	var sentMessage protocol.ProbeUpgradeMessage
	handler := &AdminHandler{
		db: db,
		sendProbeUpgrade: func(probeID string, message protocol.ProbeUpgradeMessage) error {
			sentProbeID = probeID
			sentMessage = message
			return nil
		},
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "id", Value: "probe-upgrade-latest"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/admin/probes/probe-upgrade-latest/upgrade", strings.NewReader(`{}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.UpgradeProbe(ctx)

	if recorder.Code != http.StatusAccepted {
		t.Fatalf("expected status 202, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if sentProbeID != "probe-upgrade-latest" {
		t.Fatalf("expected message sent to probe-upgrade-latest, got %q", sentProbeID)
	}
	if strings.TrimSpace(sentMessage.UpgradeID) == "" {
		t.Fatal("expected upgrade id to be sent")
	}
	if sentMessage.Version != "" {
		t.Fatalf("expected empty version in upgrade message, got %q", sentMessage.Version)
	}

	stored, err := db.GetLatestProbeUpgrade("probe-upgrade-latest")
	if err != nil {
		t.Fatalf("GetLatestProbeUpgrade failed: %v", err)
	}
	if stored == nil {
		t.Fatal("expected stored upgrade record")
	}
	if stored.TargetVersion != model.ProbeUpgradeTargetLatest {
		t.Fatalf("expected target version %q, got %q", model.ProbeUpgradeTargetLatest, stored.TargetVersion)
	}
	if stored.FromVersion != "v1.0.0" {
		t.Fatalf("expected from version v1.0.0, got %q", stored.FromVersion)
	}

	var response struct {
		Upgrade *model.ProbeUpgrade `json:"upgrade"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if response.Upgrade == nil || response.Upgrade.TargetVersion != model.ProbeUpgradeTargetLatest {
		t.Fatalf("expected response upgrade target version %q, got %#v", model.ProbeUpgradeTargetLatest, response.Upgrade)
	}
}

func TestUpgradeProbeRejectsExplicitVersion(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newTaskHandlerTestDB(t)
	if err := db.SaveProbe(&model.Probe{
		ProbeID:       "probe-upgrade-explicit",
		Name:          "probe-upgrade-explicit",
		Location:      "Test Lab",
		Region:        "test",
		Capabilities:  `["icmp_ping"]`,
		Status:        "online",
		LastHeartbeat: time.Now(),
		Metadata:      `{"version":"v1.0.0","upgrade_supported":"true","deploy_mode":"systemd","upgrade_channel":"queue_dir"}`,
	}); err != nil {
		t.Fatalf("SaveProbe failed: %v", err)
	}

	sendCalled := false
	handler := &AdminHandler{
		db: db,
		sendProbeUpgrade: func(string, protocol.ProbeUpgradeMessage) error {
			sendCalled = true
			return nil
		},
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "id", Value: "probe-upgrade-explicit"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/admin/probes/probe-upgrade-explicit/upgrade", strings.NewReader(`{"version":"v1.2.3"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.UpgradeProbe(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if sendCalled {
		t.Fatal("expected explicit version request to be rejected before sending probe message")
	}
	stored, err := db.GetLatestProbeUpgrade("probe-upgrade-explicit")
	if err != nil {
		t.Fatalf("GetLatestProbeUpgrade failed: %v", err)
	}
	if stored != nil {
		t.Fatalf("expected no stored upgrade record, got %#v", stored)
	}
}
