import { parseMaybeJSON } from './parse'

export function getFiniteNumber(...candidates: unknown[]): number | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate
    }
  }
  return undefined
}

export function getNonEmptyString(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim()
      if (trimmed !== '') {
        return trimmed
      }
    }
  }
  return undefined
}

function stripIPv6Zone(host: string): string {
  const zoneIndex = host.indexOf('%')
  return zoneIndex > 0 ? host.slice(0, zoneIndex) : host
}

function isIPv4(host: string): boolean {
  const parts = host.split('.')
  if (parts.length !== 4) {
    return false
  }

  return parts.every((part) => {
    if (!/^\d+$/.test(part)) {
      return false
    }

    const value = Number(part)
    return value >= 0 && value <= 255
  })
}

function isIPAddress(host: string): boolean {
  const normalized = stripIPv6Zone(host)
  if (isIPv4(normalized)) {
    return true
  }

  return normalized.includes(':') && /^[0-9A-Fa-f:.]+$/.test(normalized)
}

function extractTargetHost(target?: string): string | undefined {
  const trimmed = target?.trim()
  if (!trimmed) {
    return undefined
  }

  if (trimmed.includes('://')) {
    try {
      const parsed = new URL(trimmed)
      if (parsed.hostname) {
        return parsed.hostname
      }
    } catch {
      // Ignore malformed URL input and keep trying other formats.
    }
  }

  if (trimmed.includes('/')) {
    try {
      const parsed = new URL(`http://${trimmed}`)
      if (parsed.hostname) {
        return parsed.hostname
      }
    } catch {
      // Ignore malformed host/path input and keep trying other formats.
    }
  }

  if (trimmed.startsWith('[')) {
    const closingIndex = trimmed.indexOf(']')
    if (closingIndex > 1) {
      return trimmed.slice(1, closingIndex)
    }
  }

  const hostPortMatch = /^([^:]+):\d+$/.exec(trimmed)
  if (hostPortMatch?.[1]) {
    return hostPortMatch[1]
  }

  if ((trimmed.match(/:/g) || []).length >= 2) {
    return trimmed
  }

  return trimmed
}

export function getResolvedIP(summaryValue: unknown, resultDataValue: unknown, target?: string): string | undefined {
  const summary = parseMaybeJSON(summaryValue)
  const data = parseMaybeJSON(resultDataValue)

  const resolved = getNonEmptyString(
    data['resolved_ip'],
    summary['resolved_ip'],
    summary['resolvedIP'],
  )
  if (resolved) {
    return resolved
  }

  const targetHost = extractTargetHost(target)
  if (targetHost && isIPAddress(targetHost)) {
    return targetHost
  }

  return undefined
}

export type PacketLossStats = {
  failed: number
  total: number
}

export function getPacketLossStats(resultDataValue: unknown): PacketLossStats | undefined {
  const data = parseMaybeJSON(resultDataValue)

  const packetsSent = getFiniteNumber(data['packets_sent'])
  const packetsReceived = getFiniteNumber(data['packets_received'])
  if (packetsSent !== undefined && packetsSent > 0) {
    return {
      failed: Math.max(0, packetsSent - (packetsReceived ?? 0)),
      total: packetsSent,
    }
  }

  const successfulConnections = getFiniteNumber(data['successful_connections']) ?? 0
  const failedConnections = getFiniteNumber(data['failed_connections']) ?? 0
  const totalConnections = successfulConnections + failedConnections
  if (totalConnections > 0) {
    return {
      failed: failedConnections,
      total: totalConnections,
    }
  }

  return undefined
}

export function getPacketLossPercent(summaryValue: unknown, resultDataValue: unknown): number | undefined {
  const summary = parseMaybeJSON(summaryValue)
  const summaryLoss = getFiniteNumber(summary['packet_loss_percent'], summary['packet_loss'])
  if (summaryLoss !== undefined) {
    return summaryLoss
  }

  const stats = getPacketLossStats(resultDataValue)
  if (!stats || stats.total <= 0) {
    return undefined
  }

  return (stats.failed / stats.total) * 100
}

export function getAvgLatency(summaryValue: unknown, resultDataValue: unknown): number | undefined {
  const summary = parseMaybeJSON(summaryValue)
  const data = parseMaybeJSON(resultDataValue)

  return getFiniteNumber(
    summary['avg_rtt_ms'],
    summary['avg_latency'],
    summary['avg_connect_time_ms'],
    data['avg_rtt_ms'],
    data['avg_latency'],
    data['avg_connect_time_ms'],
  )
}

export function getMinLatency(summaryValue: unknown, resultDataValue: unknown): number | undefined {
  const summary = parseMaybeJSON(summaryValue)
  const data = parseMaybeJSON(resultDataValue)

  return getFiniteNumber(
    summary['min_rtt_ms'],
    summary['min_latency'],
    summary['min_connect_time_ms'],
    data['min_rtt_ms'],
    data['min_latency'],
    data['min_connect_time_ms'],
  )
}

export function getMaxLatency(summaryValue: unknown, resultDataValue: unknown): number | undefined {
  const summary = parseMaybeJSON(summaryValue)
  const data = parseMaybeJSON(resultDataValue)

  return getFiniteNumber(
    summary['max_rtt_ms'],
    summary['max_latency'],
    summary['max_connect_time_ms'],
    data['max_rtt_ms'],
    data['max_latency'],
    data['max_connect_time_ms'],
  )
}

export function getStddevLatency(summaryValue: unknown, resultDataValue: unknown): number | undefined {
  const summary = parseMaybeJSON(summaryValue)
  const data = parseMaybeJSON(resultDataValue)

  return getFiniteNumber(
    summary['stddev_rtt_ms'],
    summary['stddev'],
    data['stddev_rtt_ms'],
    data['stddev'],
  )
}

export type TargetNetworkInfo = {
  isp?: string
  asn?: string
  asName?: string
}

export function getTargetNetworkInfo(summaryValue: unknown, resultDataValue: unknown): TargetNetworkInfo {
  const summary = parseMaybeJSON(summaryValue)
  const data = parseMaybeJSON(resultDataValue)

  return {
    isp: getNonEmptyString(summary['target_isp'], data['target_isp']),
    asn: getNonEmptyString(summary['target_asn'], data['target_asn']),
    asName: getNonEmptyString(summary['target_as_name'], data['target_as_name']),
  }
}
