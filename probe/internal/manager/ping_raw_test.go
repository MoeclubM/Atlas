package manager

import (
	"math"
	"testing"

	"atlas/shared/protocol"
)

func TestApplyPingStatistics(t *testing.T) {
	result := &protocol.ICMPPingResult{
		PacketsSent: 4,
		Replies: []protocol.PingReply{
			{Seq: 1, TTL: 52, TimeMs: 10},
			{Seq: 2, TTL: 52, TimeMs: 20},
			{Seq: 3, TTL: 52, TimeMs: 30},
		},
	}

	applyPingStatistics(result)

	if result.PacketsReceived != 3 {
		t.Fatalf("expected 3 received packets, got %d", result.PacketsReceived)
	}
	if math.Abs(result.PacketLossPercent-25) > 0.001 {
		t.Fatalf("expected packet loss 25, got %v", result.PacketLossPercent)
	}
	if result.MinRTTMs != 10 || result.AvgRTTMs != 20 || result.MaxRTTMs != 30 {
		t.Fatalf("unexpected rtt stats: min=%v avg=%v max=%v", result.MinRTTMs, result.AvgRTTMs, result.MaxRTTMs)
	}
	if math.Abs(result.StdDevRTTMs-8.1649658) > 0.0001 {
		t.Fatalf("unexpected stddev: %v", result.StdDevRTTMs)
	}
}
