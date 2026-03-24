package manager

import "testing"

func TestParseMTRReportJSON(t *testing.T) {
	raw := []byte(`{
  "report": {
    "mtr": {
      "src": "192.0.2.10",
      "dst": "1.1.1.1"
    },
    "hubs": [
      {
        "count": 1,
        "host": "192.0.2.1",
        "Loss%": 0,
        "Snt": 4,
        "Last": 1.2,
        "Avg": 1.1,
        "Best": 0.9,
        "Wrst": 1.3,
        "StDev": 0.1
      },
      {
        "count": 2,
        "host": "1.1.1.1",
        "Loss%": 25,
        "Snt": 4,
        "Last": 12.2,
        "Avg": 12,
        "Best": 11.5,
        "Wrst": 13,
        "StDev": 0.6
      }
    ]
  }
}`)

	result, err := parseMTRReportJSON(raw, "example.com", "1.1.1.1")
	if err != nil {
		t.Fatalf("parseMTRReportJSON returned error: %v", err)
	}

	if !result.Success {
		t.Fatal("expected parsed mtr result to reach the target")
	}
	if result.TotalHops != 2 {
		t.Fatalf("expected 2 hops, got %d", result.TotalHops)
	}
	if result.PacketLossPercent != 25 {
		t.Fatalf("expected packet loss 25, got %v", result.PacketLossPercent)
	}
	if result.AvgRTTMs != 12 {
		t.Fatalf("expected avg RTT 12, got %v", result.AvgRTTMs)
	}
	if result.Hops[1].IP != "1.1.1.1" {
		t.Fatalf("expected final hop IP 1.1.1.1, got %q", result.Hops[1].IP)
	}
}

func TestParseMTRReportJSONMarksUnreachedTargetAsFailedRoute(t *testing.T) {
	raw := []byte(`{
  "report": {
    "hubs": [
      {
        "count": 1,
        "host": "192.0.2.1",
        "Loss%": 0,
        "Snt": 4,
        "Last": 1.2,
        "Avg": 1.1,
        "Best": 0.9,
        "Wrst": 1.3,
        "StDev": 0.1
      },
      {
        "count": 2,
        "host": "???",
        "Loss%": 100,
        "Snt": 4,
        "Last": 0,
        "Avg": 0,
        "Best": 0,
        "Wrst": 0,
        "StDev": 0
      }
    ]
  }
}`)

	result, err := parseMTRReportJSON(raw, "example.com", "1.1.1.1")
	if err != nil {
		t.Fatalf("parseMTRReportJSON returned error: %v", err)
	}

	if result.Success {
		t.Fatal("expected unreached mtr route to report success=false")
	}
	if result.PacketLossPercent != 100 {
		t.Fatalf("expected packet loss 100, got %v", result.PacketLossPercent)
	}
	if len(result.Hops) != 2 || !result.Hops[1].Timeout {
		t.Fatalf("expected timeout hop, got %+v", result.Hops)
	}
}
