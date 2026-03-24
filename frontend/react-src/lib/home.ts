import { parseMaybeJSON } from '@/lib/parse'
import {
  getAvgLatency,
  getHTTPStatusCode,
  getLatestHTTPAttempt,
  getMaxLatency,
  getMTRResult,
  getMinLatency,
  getPacketLossPercent,
  getResolvedIP,
  getTargetNetworkInfo,
  getTracerouteResult,
  type HTTPAttempt,
  type MTRResultData,
  type TracerouteResultData,
} from '@/lib/result'
import { getProbeProviderLabel } from '@/lib/probe'
import type { ProbeRecord, TaskResult } from '@/lib/domain'

export type HomeResultRow = {
  probe_id: string
  location: string
  provider?: string
  http_status_code?: number
  avg_latency?: number
  min_latency?: number
  max_latency?: number
  last_latency?: number
  packet_loss?: number
  send_count?: number
  status?: string
  resolved_ip?: string
  target_isp?: string
  target_asn?: string
  target_as_name?: string
}

export type HTTPTestResult = {
  target?: string
  final_url?: string
  resolved_ip?: string
  request_headers?: Record<string, string[]>
  response_headers?: Record<string, string[]>
  attempts?: HTTPAttempt[]
}

export function getSparkSamplesFromResult(
  result: TaskResult,
  taskType: string,
): Array<number | null> {
  const data = parseMaybeJSON(result.result_data)

  if (taskType === 'icmp_ping') {
    const replies = Array.isArray(data['replies'])
      ? (data['replies'] as Array<Record<string, unknown>>)
      : []
    const packetsSent =
      typeof data['packets_sent'] === 'number' && Number.isFinite(data['packets_sent'])
        ? Math.max(0, Math.floor(data['packets_sent'] as number))
        : 0

    if (replies.length > 0) {
      const samples = replies.map((reply) => {
        const timeMs = reply['time_ms'] as number | undefined
        return timeMs !== undefined && Number.isFinite(timeMs) && timeMs > 0 ? timeMs : null
      })

      while (samples.length < packetsSent) {
        samples.push(null)
      }

      return samples
    }

    if (packetsSent > 0) return Array.from({ length: packetsSent }, () => null)
    return result.status === 'failed' ? [null] : []
  }

  if (taskType === 'tcp_ping') {
    const attempts = Array.isArray(data['attempts'])
      ? (data['attempts'] as Array<Record<string, unknown>>)
      : []
    if (attempts.length > 0) {
      return attempts.map((attempt) => {
        const timeMs = attempt['time_ms'] as number | undefined
        const status = attempt['status'] as string | undefined
        return status !== 'failed' && timeMs !== undefined && Number.isFinite(timeMs) && timeMs > 0
          ? timeMs
          : null
      })
    }

    const successful =
      typeof data['successful_connections'] === 'number' &&
      Number.isFinite(data['successful_connections'])
        ? Math.max(0, Math.floor(data['successful_connections'] as number))
        : 0
    const failed =
      typeof data['failed_connections'] === 'number' && Number.isFinite(data['failed_connections'])
        ? Math.max(0, Math.floor(data['failed_connections'] as number))
        : 0
    const total = successful + failed
    if (total > 0) return Array.from({ length: total }, () => null)
    return result.status === 'failed' ? [null] : []
  }

  const latency = getAvgLatency(result.summary, result.result_data)
  if (latency !== undefined) return [latency]
  return result.status === 'failed' ? [null] : []
}

export function deriveHomeRows({
  taskResults,
  probesMap,
  activeProbeIds,
  target,
  getUnknownLabel,
  getPlaceholderStatus,
}: {
  taskResults: TaskResult[]
  probesMap: Map<string, ProbeRecord>
  activeProbeIds: string[]
  target: string
  getUnknownLabel: () => string
  getPlaceholderStatus: () => string
}): HomeResultRow[] {
  const byProbe = new Map<string, TaskResult[]>()
  for (const item of taskResults) {
    if (!byProbe.has(item.probe_id)) byProbe.set(item.probe_id, [])
    byProbe.get(item.probe_id)?.push(item)
  }

  const rows: HomeResultRow[] = []

  byProbe.forEach((items, probeId) => {
    const probe = probesMap.get(probeId)
    const latencies: number[] = []
    const mins: number[] = []
    const maxs: number[] = []

    for (const item of items) {
      const latency = getAvgLatency(item.summary, item.result_data)
      if (latency !== undefined) latencies.push(latency)

      const minL = getMinLatency(item.summary, item.result_data)
      if (minL !== undefined) mins.push(minL)

      const maxL = getMaxLatency(item.summary, item.result_data)
      if (maxL !== undefined) maxs.push(maxL)
    }

    const last = items.length ? items[items.length - 1] : undefined
    const avgLatency = latencies.length
      ? latencies.reduce((sum, current) => sum + current, 0) / latencies.length
      : undefined
    const minLatency = mins.length ? Math.min(...mins) : undefined
    const maxLatency = maxs.length ? Math.max(...maxs) : undefined
    const latestHTTPAttempt = last ? getLatestHTTPAttempt(last.result_data) : undefined
    const latestTraceroute = last ? getTracerouteResult(last.result_data) : undefined
    const latestMTR = last ? getMTRResult(last.result_data) : undefined
    const lastLatency =
      latestHTTPAttempt?.timeMs ?? (last ? getAvgLatency(last.summary, last.result_data) : undefined)
    const latestStatus = latestHTTPAttempt?.status
      ? latestHTTPAttempt.status
      : latestMTR
        ? latestMTR.success === false
          ? 'failed'
          : last?.status || 'success'
        : latestTraceroute
          ? latestTraceroute.success === false
            ? 'failed'
            : last?.status || 'success'
          : last?.status || (latencies.length > 0 ? 'success' : 'unknown')

    const lastSummary = last ? parseMaybeJSON(last.summary) : {}
    const lastData = last ? parseMaybeJSON(last.result_data) : {}
    const calculatedPacketLoss = last ? getPacketLossPercent(lastSummary, lastData) : undefined
    const resolvedIP = last ? getResolvedIP(lastSummary, lastData, target) : undefined
    const targetNetwork = getTargetNetworkInfo(lastSummary, lastData)

    rows.push({
      probe_id: probeId,
      location: probe?.location || getUnknownLabel(),
      provider: getProbeProviderLabel(probe?.metadata) || '-',
      http_status_code: last ? getHTTPStatusCode(lastSummary, lastData) : undefined,
      avg_latency: avgLatency,
      min_latency: minLatency,
      max_latency: maxLatency,
      last_latency: lastLatency,
      packet_loss: calculatedPacketLoss,
      send_count: items.length,
      status: latestStatus,
      resolved_ip: resolvedIP,
      target_isp: targetNetwork.isp,
      target_asn: targetNetwork.asn,
      target_as_name: targetNetwork.asName,
    })
  })

  for (const probeId of activeProbeIds) {
    if (rows.some((row) => row.probe_id === probeId)) continue
    const probe = probesMap.get(probeId)
    rows.push({
      probe_id: probeId,
      location: probe?.location || getUnknownLabel(),
      provider: getProbeProviderLabel(probe?.metadata) || '-',
      send_count: 0,
      status: getPlaceholderStatus(),
      resolved_ip: getResolvedIP({}, {}, target),
    })
  }

  rows.sort((left, right) => left.location.localeCompare(right.location))
  return rows
}

export function getRouteResultMaps(results: TaskResult[]) {
  const tracerouteData: Record<string, TracerouteResultData> = {}
  const mtrData: Record<string, MTRResultData> = {}
  const httpData: Record<string, HTTPTestResult> = {}

  for (const result of results) {
    const traceroute = getTracerouteResult(result.result_data)
    if (traceroute) tracerouteData[result.probe_id] = traceroute

    const mtr = getMTRResult(result.result_data)
    if (mtr) mtrData[result.probe_id] = mtr

    const data = parseMaybeJSON(result.result_data)
    if (Array.isArray(data['attempts'])) {
      httpData[result.probe_id] = data as HTTPTestResult
    }
  }

  return { tracerouteData, mtrData, httpData }
}
