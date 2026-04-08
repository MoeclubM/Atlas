package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

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

func TestResolveLatestProbeVersionFromReleasePage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/MoeclubM/Atlas/releases/latest" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		http.Redirect(w, r, "/MoeclubM/Atlas/releases/tag/v0.1.11", http.StatusFound)
	}))
	defer server.Close()

	version, err := resolveLatestProbeVersionFromReleasePage(
		context.Background(),
		server.URL+"/MoeclubM/Atlas/releases/latest",
		server.Client(),
	)
	if err != nil {
		t.Fatalf("resolveLatestProbeVersionFromReleasePage returned error: %v", err)
	}
	if version != "v0.1.11" {
		t.Fatalf("expected v0.1.11, got %q", version)
	}
}

func TestResolveLatestProbeVersionFromAPI(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/repos/MoeclubM/Atlas/releases/latest" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"tag_name":"v0.1.11"}`))
	}))
	defer server.Close()

	version, err := resolveLatestProbeVersionFromAPI(
		context.Background(),
		server.URL+"/repos/MoeclubM/Atlas/releases/latest",
		server.Client(),
	)
	if err != nil {
		t.Fatalf("resolveLatestProbeVersionFromAPI returned error: %v", err)
	}
	if version != "v0.1.11" {
		t.Fatalf("expected v0.1.11, got %q", version)
	}
}
