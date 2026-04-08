package manager

import (
	"context"
	"fmt"
	"math"
	"net"
	"strings"
	"time"

	"atlas/shared/protocol"

	"golang.org/x/net/icmp"
	"golang.org/x/net/ipv4"
	"golang.org/x/net/ipv6"
)

const pingReplyTimeout = time.Second

type pingSession struct {
	conn     *icmp.PacketConn
	protocol int
	targetIP net.IP
	target   *net.IPAddr
	echoID   int
	isIPv4   bool
	isIPv6   bool
}

type pingReplyMeta struct {
	ttl     int
	source  string
	latency float64
}

func executeICMPPing(ctx context.Context, target string, params map[string]interface{}) (*protocol.ICMPPingResult, error) {
	count := getIntParam(params, "count", 4)
	if count < 1 {
		count = 4
	}

	ipVersion, _ := params["ip_version"].(string)
	if ipVersion == "" {
		ipVersion = "auto"
	}

	timeoutSec := getIntParam(params, "timeout", 1)
	if timeoutSec < 1 {
		timeoutSec = 1
	}
	perProbeTimeout := time.Duration(timeoutSec) * time.Second

	resolvedIP := strings.Trim(strings.TrimSpace(target), "[]")
	if net.ParseIP(stripIPv6Zone(resolvedIP)) == nil {
		var err error
		resolvedIP, err = resolveHostIPForVersion(resolvedIP, ipVersion)
		if err != nil {
			return nil, err
		}
	}

	session, err := openPingSession(resolvedIP)
	if err != nil {
		return nil, err
	}
	defer session.conn.Close()

	result := &protocol.ICMPPingResult{
		PacketsSent:     count,
		PacketsReceived: 0,
		Replies:         make([]protocol.PingReply, 0, count),
		ResolvedIP:      resolvedIP,
	}

	for seq := 1; seq <= count; seq++ {
		replyCtx, cancel := context.WithTimeout(ctx, perProbeTimeout)
		reply, err := session.sendAndReceive(replyCtx, seq)
		cancel()
		if err != nil {
			if isTraceTimeout(err) {
				continue
			}
			return nil, err
		}
		if reply == nil {
			continue
		}

		result.Replies = append(result.Replies, protocol.PingReply{
			Seq:    seq,
			TTL:    reply.ttl,
			TimeMs: reply.latency,
		})
	}

	result.PacketsReceived = len(result.Replies)
	applyPingStatistics(result)
	return result, nil
}

func openPingSession(resolvedIP string) (*pingSession, error) {
	targetIP := net.ParseIP(stripIPv6Zone(resolvedIP))
	if targetIP == nil {
		return nil, fmt.Errorf("invalid target ip: %s", resolvedIP)
	}

	session := &pingSession{
		targetIP: targetIP,
		echoID:   int(time.Now().UnixNano() & 0xffff),
	}

	if ip4 := targetIP.To4(); ip4 != nil {
		conn, err := icmp.ListenPacket("ip4:icmp", "0.0.0.0")
		if err != nil {
			return nil, fmt.Errorf("listen raw icmpv4 failed: %w", err)
		}
		if err := conn.IPv4PacketConn().SetControlMessage(ipv4.FlagTTL, true); err != nil {
			_ = conn.Close()
			return nil, fmt.Errorf("enable ipv4 control message failed: %w", err)
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
	if err := conn.IPv6PacketConn().SetControlMessage(ipv6.FlagHopLimit, true); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("enable ipv6 control message failed: %w", err)
	}
	session.conn = conn
	session.protocol = traceProtocolIPv6
	session.target = &net.IPAddr{IP: targetIP}
	session.isIPv6 = true
	return session, nil
}

func (s *pingSession) sendAndReceive(ctx context.Context, seq int) (*pingReplyMeta, error) {
	payload, err := s.marshalEcho(seq)
	if err != nil {
		return nil, err
	}

	start := time.Now()
	if _, err := s.conn.WriteTo(payload, s.target); err != nil {
		return nil, fmt.Errorf("write icmp echo failed: %w", err)
	}

	buffer := make([]byte, 1500)
	deadline := time.Now().Add(pingReplyTimeout)
	if ctxDeadline, ok := ctx.Deadline(); ok && ctxDeadline.Before(deadline) {
		deadline = ctxDeadline
	}

	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}

		if err := s.conn.SetReadDeadline(deadline); err != nil {
			return nil, fmt.Errorf("set icmp read deadline failed: %w", err)
		}

		if s.isIPv4 {
			n, cm, peer, err := s.conn.IPv4PacketConn().ReadFrom(buffer)
			if err != nil {
				return nil, err
			}
			reply, matched, err := s.parseEchoReply(buffer[:n], peer, seq, time.Since(start), cmTTL(cm))
			if err != nil {
				continue
			}
			if matched {
				return reply, nil
			}
			continue
		}

		n, cm, peer, err := s.conn.IPv6PacketConn().ReadFrom(buffer)
		if err != nil {
			return nil, err
		}
		reply, matched, err := s.parseEchoReply(buffer[:n], peer, seq, time.Since(start), cmHopLimit(cm))
		if err != nil {
			continue
		}
		if matched {
			return reply, nil
		}
	}
}

func (s *pingSession) marshalEcho(seq int) ([]byte, error) {
	var messageType icmp.Type = ipv4.ICMPTypeEcho
	if s.isIPv6 {
		messageType = ipv6.ICMPTypeEchoRequest
	}

	return (&icmp.Message{
		Type: messageType,
		Code: 0,
		Body: &icmp.Echo{
			ID:   s.echoID,
			Seq:  seq,
			Data: []byte("atlas-ping"),
		},
	}).Marshal(nil)
}

func (s *pingSession) parseEchoReply(
	payload []byte,
	peer net.Addr,
	seq int,
	elapsed time.Duration,
	ttl int,
) (*pingReplyMeta, bool, error) {
	message, err := icmp.ParseMessage(s.protocol, payload)
	if err != nil {
		return nil, false, err
	}

	echo, ok := message.Body.(*icmp.Echo)
	if !ok || echo.ID != s.echoID || echo.Seq != seq {
		return nil, false, nil
	}

	sourceIP := normalizeTraceAddr(peer)
	if sourceIP != s.targetIP.String() {
		return nil, false, nil
	}

	return &pingReplyMeta{
		ttl:     ttl,
		source:  sourceIP,
		latency: float64(elapsed.Microseconds()) / 1000,
	}, true, nil
}

func applyPingStatistics(result *protocol.ICMPPingResult) {
	result.PacketsReceived = len(result.Replies)
	if result.PacketsSent > 0 {
		result.PacketLossPercent = float64(result.PacketsSent-result.PacketsReceived) / float64(result.PacketsSent) * 100
	}
	if len(result.Replies) == 0 {
		return
	}

	var total float64
	result.MinRTTMs = result.Replies[0].TimeMs
	result.MaxRTTMs = result.Replies[0].TimeMs
	for _, reply := range result.Replies {
		total += reply.TimeMs
		if reply.TimeMs < result.MinRTTMs {
			result.MinRTTMs = reply.TimeMs
		}
		if reply.TimeMs > result.MaxRTTMs {
			result.MaxRTTMs = reply.TimeMs
		}
	}
	result.AvgRTTMs = total / float64(len(result.Replies))

	var variance float64
	for _, reply := range result.Replies {
		diff := reply.TimeMs - result.AvgRTTMs
		variance += diff * diff
	}
	variance /= float64(len(result.Replies))
	result.StdDevRTTMs = math.Sqrt(variance)
}

func cmTTL(cm *ipv4.ControlMessage) int {
	if cm == nil {
		return 0
	}
	return cm.TTL
}

func cmHopLimit(cm *ipv6.ControlMessage) int {
	if cm == nil {
		return 0
	}
	return cm.HopLimit
}
