package manager

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"atlas/shared/protocol"

	"golang.org/x/net/icmp"
	"golang.org/x/net/ipv4"
	"golang.org/x/net/ipv6"
)

const (
	traceProtocolIPv4 = 1
	traceProtocolIPv6 = 58
	traceProbeTimeout = time.Second
)

type traceSession struct {
	conn     *icmp.PacketConn
	protocol int
	targetIP net.IP
	target   *net.IPAddr
	echoID   int
	isIPv4   bool
	isIPv6   bool
}

type traceReply struct {
	sourceIP string
	rttMs    float64
	reached  bool
}

func runInternalTraceroute(
	ctx context.Context,
	resolvedIP string,
	queryCount int,
	maxHops int,
) ([]protocol.TracerouteHop, error) {
	targetIP := net.ParseIP(stripIPv6Zone(strings.TrimSpace(resolvedIP)))
	if targetIP == nil {
		return nil, fmt.Errorf("invalid target ip: %s", resolvedIP)
	}

	session, err := openTraceSession(targetIP)
	if err != nil {
		return nil, err
	}
	defer session.conn.Close()

	if queryCount < 1 {
		queryCount = 1
	}
	if maxHops < 1 {
		maxHops = 30
	}

	hops := make([]protocol.TracerouteHop, 0, maxHops)
	for ttl := 1; ttl <= maxHops; ttl++ {
		hop, reached, err := session.probeHop(ctx, ttl, queryCount)
		if err != nil {
			return nil, err
		}
		hops = append(hops, hop)
		if reached {
			break
		}
	}

	return hops, nil
}

func openTraceSession(targetIP net.IP) (*traceSession, error) {
	session := &traceSession{
		targetIP: targetIP,
		echoID:   int(time.Now().UnixNano() & 0xffff),
	}

	if ip4 := targetIP.To4(); ip4 != nil {
		conn, err := icmp.ListenPacket("ip4:icmp", "0.0.0.0")
		if err != nil {
			return nil, fmt.Errorf("listen raw icmpv4 failed: %w", err)
		}
		session.conn = conn
		session.protocol = traceProtocolIPv4
		session.target = &net.IPAddr{IP: ip4}
		session.targetIP = ip4
		session.isIPv4 = true
		return session, nil
	}

	conn, err := icmp.ListenPacket("ip6:ipv6-icmp", "::")
	if err != nil {
		return nil, fmt.Errorf("listen raw icmpv6 failed: %w", err)
	}
	session.conn = conn
	session.protocol = traceProtocolIPv6
	session.target = &net.IPAddr{IP: targetIP}
	session.isIPv6 = true
	return session, nil
}

func (s *traceSession) probeHop(
	ctx context.Context,
	ttl int,
	queryCount int,
) (protocol.TracerouteHop, bool, error) {
	hop := protocol.TracerouteHop{
		Hop:  ttl,
		RTTs: make([]float64, 0, queryCount),
	}
	reached := false

	for probeIndex := 0; probeIndex < queryCount; probeIndex++ {
		if err := ctx.Err(); err != nil {
			return hop, false, err
		}

		seq := ttl*100 + probeIndex + 1
		if err := s.setTTL(ttl); err != nil {
			return hop, false, err
		}

		payload, err := s.marshalProbe(seq)
		if err != nil {
			return hop, false, err
		}

		start := time.Now()
		if _, err := s.conn.WriteTo(payload, s.target); err != nil {
			return hop, false, fmt.Errorf("write traceroute probe failed: %w", err)
		}

		reply, err := s.readReply(ctx, seq, start)
		if err != nil {
			if isTraceTimeout(err) {
				continue
			}
			return hop, false, err
		}
		if reply == nil {
			continue
		}

		if hop.IP == "" {
			hop.IP = reply.sourceIP
		}
		hop.RTTs = append(hop.RTTs, reply.rttMs)
		reached = reached || reply.reached
	}

	hop.Timeout = len(hop.RTTs) == 0
	return hop, reached, nil
}

func (s *traceSession) setTTL(ttl int) error {
	if s.isIPv4 {
		if err := s.conn.IPv4PacketConn().SetTTL(ttl); err != nil {
			return fmt.Errorf("set ipv4 ttl failed: %w", err)
		}
		return nil
	}

	if err := s.conn.IPv6PacketConn().SetHopLimit(ttl); err != nil {
		return fmt.Errorf("set ipv6 hop limit failed: %w", err)
	}
	return nil
}

func (s *traceSession) marshalProbe(seq int) ([]byte, error) {
	var messageType icmp.Type
	if s.isIPv4 {
		messageType = ipv4.ICMPTypeEcho
	} else {
		messageType = ipv6.ICMPTypeEchoRequest
	}

	return (&icmp.Message{
		Type: messageType,
		Code: 0,
		Body: &icmp.Echo{
			ID:   s.echoID,
			Seq:  seq,
			Data: []byte("atlas-trace"),
		},
	}).Marshal(nil)
}

func (s *traceSession) readReply(
	ctx context.Context,
	seq int,
	start time.Time,
) (*traceReply, error) {
	buffer := make([]byte, 1500)
	deadline := time.Now().Add(traceProbeTimeout)
	if ctxDeadline, ok := ctx.Deadline(); ok && ctxDeadline.Before(deadline) {
		deadline = ctxDeadline
	}

	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if err := s.conn.SetReadDeadline(deadline); err != nil {
			return nil, fmt.Errorf("set traceroute read deadline failed: %w", err)
		}

		n, peer, err := s.conn.ReadFrom(buffer)
		if err != nil {
			return nil, err
		}

		reply, matched, err := s.parseReply(buffer[:n], peer, seq, time.Since(start))
		if err != nil {
			continue
		}
		if matched {
			return reply, nil
		}
	}
}

func (s *traceSession) parseReply(
	payload []byte,
	peer net.Addr,
	seq int,
	elapsed time.Duration,
) (*traceReply, bool, error) {
	message, err := icmp.ParseMessage(s.protocol, payload)
	if err != nil {
		return nil, false, err
	}

	switch body := message.Body.(type) {
	case *icmp.Echo:
		if body.ID != s.echoID || body.Seq != seq {
			return nil, false, nil
		}
		return &traceReply{
			sourceIP: normalizeTraceAddr(peer),
			rttMs:    float64(elapsed.Microseconds()) / 1000,
			reached:  normalizeTraceAddr(peer) == s.targetIP.String(),
		}, true, nil
	case *icmp.TimeExceeded:
		if !traceProbeMatchesEmbeddedPacket(s.protocol, body.Data, s.echoID, seq) {
			return nil, false, nil
		}
		return &traceReply{
			sourceIP: normalizeTraceAddr(peer),
			rttMs:    float64(elapsed.Microseconds()) / 1000,
			reached:  false,
		}, true, nil
	case *icmp.DstUnreach:
		if !traceProbeMatchesEmbeddedPacket(s.protocol, body.Data, s.echoID, seq) {
			return nil, false, nil
		}
		return &traceReply{
			sourceIP: normalizeTraceAddr(peer),
			rttMs:    float64(elapsed.Microseconds()) / 1000,
			reached:  normalizeTraceAddr(peer) == s.targetIP.String(),
		}, true, nil
	default:
		return nil, false, nil
	}
}

func traceProbeMatchesEmbeddedPacket(protocol int, data []byte, echoID int, seq int) bool {
	if protocol == traceProtocolIPv4 {
		return traceIPv4ProbeMatches(data, echoID, seq)
	}
	return traceIPv6ProbeMatches(data, echoID, seq)
}

func traceIPv4ProbeMatches(data []byte, echoID int, seq int) bool {
	if len(data) < ipv4.HeaderLen {
		return false
	}
	headerLen := int(data[0]&0x0f) * 4
	if headerLen < ipv4.HeaderLen || len(data) < headerLen+8 {
		return false
	}

	message, err := icmp.ParseMessage(traceProtocolIPv4, data[headerLen:])
	if err != nil {
		return false
	}

	echo, ok := message.Body.(*icmp.Echo)
	return ok && echo.ID == echoID && echo.Seq == seq
}

func traceIPv6ProbeMatches(data []byte, echoID int, seq int) bool {
	if len(data) < ipv6.HeaderLen+8 {
		return false
	}
	if data[6] != traceProtocolIPv6 {
		return false
	}

	message, err := icmp.ParseMessage(traceProtocolIPv6, data[ipv6.HeaderLen:])
	if err != nil {
		return false
	}

	echo, ok := message.Body.(*icmp.Echo)
	return ok && echo.ID == echoID && echo.Seq == seq
}

func normalizeTraceAddr(addr net.Addr) string {
	switch typed := addr.(type) {
	case *net.IPAddr:
		if typed.IP != nil {
			return typed.IP.String()
		}
	case *net.UDPAddr:
		if typed.IP != nil {
			return typed.IP.String()
		}
	}

	if addr == nil {
		return ""
	}

	value := addr.String()
	if host, _, err := net.SplitHostPort(value); err == nil {
		value = host
	}
	return strings.Trim(strings.TrimSpace(value), "[]")
}

func isTraceTimeout(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}
