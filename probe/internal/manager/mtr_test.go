package manager

import (
	"math"
	"testing"

	"atlas/shared/protocol"
)

func TestBuildMTRResultFromTracerouteHops(t *testing.T) {
	hops := []protocol.TracerouteHop{
		{Hop: 1, IP: "192.0.2.1", RTTs: []float64{1.2, 1.1}, Timeout: false},
		{Hop: 2, IP: "", RTTs: nil, Timeout: true},
		{Hop: 3, IP: "1.1.1.1", RTTs: []float64{12.3, 12.5, 12.1}, Timeout: false},
	}

	result := buildMTRResult("example.com", "1.1.1.1", hops, 3)
	if !result.Success {
		t.Fatal("expected mtr result to reach the target")
	}
	if result.TotalHops != 3 {
		t.Fatalf("expected 3 hops, got %d", result.TotalHops)
	}
	if result.PacketLossPercent != 0 {
		t.Fatalf("expected final hop loss 0, got %v", result.PacketLossPercent)
	}

	firstHop := result.Hops[0]
	if math.Abs(firstHop.LossPercent-33.3333333) > 0.01 {
		t.Fatalf("expected first hop partial loss, got %v", firstHop.LossPercent)
	}

	timeoutHop := result.Hops[1]
	if !timeoutHop.Timeout || timeoutHop.LossPercent != 100 {
		t.Fatalf("expected second hop timeout with 100%% loss, got %+v", timeoutHop)
	}

	finalHop := result.Hops[2]
	if finalHop.IP != "1.1.1.1" {
		t.Fatalf("expected final hop IP 1.1.1.1, got %q", finalHop.IP)
	}
	if finalHop.AvgRTTMs <= 0 || finalHop.BestRTTMs != 12.1 || finalHop.WorstRTTMs != 12.5 {
		t.Fatalf("unexpected final hop stats: %+v", finalHop)
	}
}

func TestBuildMTRResultMarksUnreachedTargetAsFailed(t *testing.T) {
	hops := []protocol.TracerouteHop{
		{Hop: 1, IP: "192.0.2.1", RTTs: []float64{1.2}, Timeout: false},
		{Hop: 2, IP: "", RTTs: nil, Timeout: true},
	}

	result := buildMTRResult("example.com", "1.1.1.1", hops, 1)
	if result.Success {
		t.Fatal("expected unreached route to be marked as failed")
	}
	if result.PacketLossPercent != 100 {
		t.Fatalf("expected packet loss 100, got %v", result.PacketLossPercent)
	}
}
