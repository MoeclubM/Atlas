package manager

import (
	"testing"

	"golang.org/x/net/icmp"
	"golang.org/x/net/ipv4"
	"golang.org/x/net/ipv6"
)

func TestTraceIPv4ProbeMatchesEmbeddedPacket(t *testing.T) {
	id := 321
	seq := 17

	payload, err := (&icmp.Message{
		Type: ipv4.ICMPTypeEcho,
		Code: 0,
		Body: &icmp.Echo{ID: id, Seq: seq},
	}).Marshal(nil)
	if err != nil {
		t.Fatalf("marshal icmpv4 echo failed: %v", err)
	}

	embedded := make([]byte, ipv4.HeaderLen+8)
	embedded[0] = 0x45
	embedded[9] = traceProtocolIPv4
	copy(embedded[ipv4.HeaderLen:], payload[:8])

	if !traceProbeMatchesEmbeddedPacket(traceProtocolIPv4, embedded, id, seq) {
		t.Fatal("expected embedded ipv4 echo packet to match")
	}
	if traceProbeMatchesEmbeddedPacket(traceProtocolIPv4, embedded, id, seq+1) {
		t.Fatal("expected mismatched ipv4 sequence to fail")
	}
}

func TestTraceIPv6ProbeMatchesEmbeddedPacket(t *testing.T) {
	id := 654
	seq := 9

	payload, err := (&icmp.Message{
		Type: ipv6.ICMPTypeEchoRequest,
		Code: 0,
		Body: &icmp.Echo{ID: id, Seq: seq},
	}).Marshal(nil)
	if err != nil {
		t.Fatalf("marshal icmpv6 echo failed: %v", err)
	}

	embedded := make([]byte, ipv6.HeaderLen+8)
	embedded[0] = 0x60
	embedded[6] = traceProtocolIPv6
	copy(embedded[ipv6.HeaderLen:], payload[:8])

	if !traceProbeMatchesEmbeddedPacket(traceProtocolIPv6, embedded, id, seq) {
		t.Fatal("expected embedded ipv6 echo packet to match")
	}
	if traceProbeMatchesEmbeddedPacket(traceProtocolIPv6, embedded, id+1, seq) {
		t.Fatal("expected mismatched ipv6 identifier to fail")
	}
}
