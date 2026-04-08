package manager

import (
	"context"
	"math"
	"net"
	"strings"

	"atlas/shared/protocol"
)

func executeMTR(ctx context.Context, target string, params map[string]interface{}) (*protocol.MTRResult, error) {
	ipVersion, _ := params["ip_version"].(string)
	if ipVersion == "" {
		ipVersion = "auto"
	}

	count := getIntParam(params, "count", 4)
	if count < 1 {
		count = 4
	}

	maxHops := getIntParam(params, "max_hops", 30)
	if maxHops < 1 {
		maxHops = 30
	}

	resolvedIP := strings.Trim(strings.TrimSpace(target), "[]")
	if net.ParseIP(stripIPv6Zone(resolvedIP)) == nil {
		var err error
		resolvedIP, err = resolveHostIPForVersion(resolvedIP, ipVersion)
		if err != nil {
			return nil, err
		}
	}

	hops, err := runTracerouteCommand(ctx, resolvedIP, count, maxHops)
	if err != nil {
		return nil, err
	}

	return buildMTRResult(target, resolvedIP, hops, count), nil
}

func buildMTRResult(
	target string,
	resolvedIP string,
	hops []protocol.TracerouteHop,
	sentPerHop int,
) *protocol.MTRResult {
	if sentPerHop < 1 {
		sentPerHop = 1
	}

	result := &protocol.MTRResult{
		Hops:       make([]protocol.MTRHop, 0, len(hops)),
		Target:     target,
		ResolvedIP: resolvedIP,
	}

	for _, hop := range hops {
		observed := len(hop.RTTs)
		lossCount := sentPerHop - observed
		if lossCount < 0 {
			lossCount = 0
		}

		mtrHop := protocol.MTRHop{
			Hop:         hop.Hop,
			IP:          hop.IP,
			Hostname:    hop.Hostname,
			LossPercent: (float64(lossCount) / float64(sentPerHop)) * 100,
			Sent:        sentPerHop,
			Timeout:     hop.IP == "" || observed == 0,
		}

		if observed > 0 {
			mtrHop.LastRTTMs = hop.RTTs[observed-1]
			mtrHop.BestRTTMs = hop.RTTs[0]
			mtrHop.WorstRTTMs = hop.RTTs[0]

			var total float64
			for _, rtt := range hop.RTTs {
				total += rtt
				if rtt < mtrHop.BestRTTMs {
					mtrHop.BestRTTMs = rtt
				}
				if rtt > mtrHop.WorstRTTMs {
					mtrHop.WorstRTTMs = rtt
				}
			}

			mtrHop.AvgRTTMs = total / float64(observed)

			var variance float64
			for _, rtt := range hop.RTTs {
				diff := rtt - mtrHop.AvgRTTMs
				variance += diff * diff
			}
			variance /= float64(observed)
			mtrHop.StdDevRTTMs = math.Sqrt(variance)
		}

		result.Hops = append(result.Hops, mtrHop)
	}

	result.TotalHops = len(result.Hops)

	summaryHop := findMTRSummaryHop(result.Hops, resolvedIP)
	if summaryHop != nil {
		result.Success = summaryHop.IP == resolvedIP && !summaryHop.Timeout
		result.PacketLossPercent = summaryHop.LossPercent
		result.MinRTTMs = summaryHop.BestRTTMs
		result.AvgRTTMs = summaryHop.AvgRTTMs
		result.MaxRTTMs = summaryHop.WorstRTTMs
		result.StdDevRTTMs = summaryHop.StdDevRTTMs
	}

	if !result.Success {
		result.PacketLossPercent = 100
	}

	return result
}

func findMTRSummaryHop(hops []protocol.MTRHop, resolvedIP string) *protocol.MTRHop {
	for index := range hops {
		if hops[index].IP == resolvedIP {
			return &hops[index]
		}
	}

	for index := len(hops) - 1; index >= 0; index-- {
		if hops[index].IP != "" {
			return &hops[index]
		}
	}

	return nil
}
