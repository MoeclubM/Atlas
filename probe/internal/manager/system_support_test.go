package manager

import "testing"

func TestFilterCapabilitiesBySupport(t *testing.T) {
	filtered := FilterCapabilitiesBySupport(
		[]string{"icmp_ping", "tcp_ping", "traceroute", "mtr", "bird_route", "http_test"},
		SystemSupport{
			ICMPPing:   false,
			TCPPing:    true,
			HTTPTest:   true,
			Traceroute: false,
			MTR:        false,
			BirdRoute:  true,
		},
	)

	expected := []string{"tcp_ping", "bird_route", "http_test"}
	if len(filtered) != len(expected) {
		t.Fatalf("expected %d capabilities, got %d (%v)", len(expected), len(filtered), filtered)
	}
	for index, capability := range expected {
		if filtered[index] != capability {
			t.Fatalf("expected capability %q at index %d, got %q", capability, index, filtered[index])
		}
	}
}

func TestSystemSupportApplyMetadata(t *testing.T) {
	metadata := map[string]string{}
	SystemSupport{
		Platform:          "linux/amd64",
		RawICMPIPv4:       true,
		RawICMPIPv6:       false,
		RawICMPIPv6Reason: "operation not permitted",
		ICMPPing:          true,
		TCPPing:           true,
		HTTPTest:          true,
		Traceroute:        true,
		MTR:               true,
		BirdRoute:         false,
		BirdRouteReason:   "bird control socket not found",
		BirdSocketPath:    "",
	}.ApplyMetadata(metadata)

	if metadata["system_platform"] != "linux/amd64" {
		t.Fatalf("expected platform metadata, got %q", metadata["system_platform"])
	}
	if metadata["support_raw_icmp_ipv4"] != "true" {
		t.Fatalf("expected support_raw_icmp_ipv4=true, got %q", metadata["support_raw_icmp_ipv4"])
	}
	if metadata["support_bird_route"] != "false" {
		t.Fatalf("expected support_bird_route=false, got %q", metadata["support_bird_route"])
	}
	if metadata["support_bird_route_reason"] == "" {
		t.Fatal("expected bird route reason metadata")
	}
}
