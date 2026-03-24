package handler

import "testing"

func TestNormalizeRequestedUpgradeVersion(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "already prefixed", input: "v1.2.3", want: "v1.2.3"},
		{name: "missing prefix", input: "1.2.3", want: "v1.2.3"},
		{name: "invalid", input: "release candidate", wantErr: true},
		{name: "empty", input: "", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeRequestedUpgradeVersion(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("expected %q, got %q", tt.want, got)
			}
		})
	}
}

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

func TestParseProbeMetadataInfoLegacyUpgradeSupport(t *testing.T) {
	info := parseProbeMetadataInfo(`{"version":"v0.1.7","os":"linux","arch":"amd64"}`)
	if !info.UpgradeSupported {
		t.Fatal("expected legacy probe to be upgrade-compatible")
	}
	if info.UpgradeChannel != "legacy_request_file" {
		t.Fatalf("expected legacy_request_file channel, got %q", info.UpgradeChannel)
	}
	if info.UpgradeReason != "" {
		t.Fatalf("expected empty upgrade reason, got %q", info.UpgradeReason)
	}
}

func TestSupportsLegacyRemoteUpgrade(t *testing.T) {
	tests := []struct {
		name       string
		version    string
		deployMode string
		want       bool
	}{
		{name: "legacy supported", version: "v0.1.7", want: true},
		{name: "minimum supported", version: "v0.1.3", want: true},
		{name: "too old", version: "v0.1.2", want: false},
		{name: "dev docker stays disabled", version: "v0.1.9", deployMode: "dev-docker", want: false},
		{name: "non release version", version: "dev", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := supportsLegacyRemoteUpgrade(tt.version, tt.deployMode)
			if got != tt.want {
				t.Fatalf("expected %v, got %v", tt.want, got)
			}
		})
	}
}
