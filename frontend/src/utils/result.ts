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

export type HTTPHeaders = Record<string, string[]>

export type HTTPAttempt = {
  seq?: number
  status?: string
  timeMs?: number
  statusCode?: number
  responseStatus?: string
  resolvedIP?: string
  finalURL?: string
  requestHeaders?: HTTPHeaders
  responseHeaders?: HTTPHeaders
  error?: string
}

function normalizeHTTPHeaders(value: unknown): HTTPHeaders | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const headers: HTTPHeaders = {}
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(rawValue)) {
      const values = rawValue
        .map((item) => {
          if (typeof item === 'string') return item
          if (typeof item === 'number' || typeof item === 'boolean') return String(item)
          return ''
        })
        .filter((item) => item !== '')

      if (values.length > 0) {
        headers[key] = values
      }
      continue
    }

    if (typeof rawValue === 'string') {
      headers[key] = [rawValue]
      continue
    }

    if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      headers[key] = [String(rawValue)]
    }
  }

  return Object.keys(headers).length > 0 ? headers : undefined
}

function normalizeHTTPAttempt(value: unknown): HTTPAttempt | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const attempt = value as Record<string, unknown>

  return {
    seq: getFiniteNumber(attempt['seq']),
    status: getNonEmptyString(attempt['status']),
    timeMs: getFiniteNumber(attempt['time_ms']),
    statusCode: getFiniteNumber(attempt['status_code']),
    responseStatus: getNonEmptyString(attempt['response_status']),
    resolvedIP: getNonEmptyString(attempt['resolved_ip']),
    finalURL: getNonEmptyString(attempt['final_url']),
    requestHeaders: normalizeHTTPHeaders(attempt['request_headers']),
    responseHeaders: normalizeHTTPHeaders(attempt['response_headers']),
    error: getNonEmptyString(attempt['error']),
  }
}

export function getHTTPAttempts(resultDataValue: unknown): HTTPAttempt[] {
  const data = parseMaybeJSON(resultDataValue)
  if (!Array.isArray(data['attempts'])) {
    return []
  }

  return data['attempts']
    .map((attempt) => normalizeHTTPAttempt(attempt))
    .filter((attempt): attempt is HTTPAttempt => attempt !== undefined)
}

export function getLatestHTTPAttempt(resultDataValue: unknown): HTTPAttempt | undefined {
  const attempts = getHTTPAttempts(resultDataValue)
  if (attempts.length > 0) {
    return attempts[attempts.length - 1]
  }

  const data = parseMaybeJSON(resultDataValue)
  return normalizeHTTPAttempt({
    status: data['status'],
    time_ms: data['last_time_ms'],
    status_code: data['status_code'],
    response_status: data['response_status'],
    resolved_ip: data['resolved_ip'],
    final_url: data['final_url'],
    request_headers: data['request_headers'],
    response_headers: data['response_headers'],
    error: data['error'],
  })
}

export function getHTTPStatusCode(summaryValue: unknown, resultDataValue: unknown): number | undefined {
  const summary = parseMaybeJSON(summaryValue)
  const summaryStatusCode = getFiniteNumber(summary['http_status_code'], summary['status_code'])
  if (summaryStatusCode !== undefined) {
    return summaryStatusCode
  }

  const latestAttempt = getLatestHTTPAttempt(resultDataValue)
  if (latestAttempt?.statusCode !== undefined) {
    return latestAttempt.statusCode
  }

  const data = parseMaybeJSON(resultDataValue)
  return getFiniteNumber(data['status_code'])
}

export type HTTPStatusTone = 'success' | 'warning' | 'error' | 'info'

export function getHTTPStatusTone(statusCode?: number): HTTPStatusTone {
  if (statusCode === undefined) {
    return 'info'
  }
  if (statusCode >= 200 && statusCode < 300) {
    return 'success'
  }
  if (statusCode >= 300 && statusCode < 400) {
    return 'warning'
  }
  return 'error'
}

export function getHTTPStatusTextClass(statusCode?: number): string {
  const tone = getHTTPStatusTone(statusCode)
  if (tone === 'success') {
    return 'good'
  }
  if (tone === 'warning') {
    return 'warn'
  }
  if (tone === 'error') {
    return 'bad'
  }
  return ''
}

export function getHTTPStatusChipColor(statusCode?: number): string {
  return getHTTPStatusTone(statusCode)
}

export function getHeaderEntries(headers: HTTPHeaders | undefined): Array<{ name: string, value: string }> {
  if (!headers) {
    return []
  }

  return Object.entries(headers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, values]) => ({
      name,
      value: values.join(', '),
    }))
}

export function getLatestHTTPRequestHeaderEntries(resultDataValue: unknown): Array<{ name: string, value: string }> {
  return getHeaderEntries(getLatestHTTPAttempt(resultDataValue)?.requestHeaders)
}

export function getLatestHTTPResponseHeaderEntries(resultDataValue: unknown): Array<{ name: string, value: string }> {
  return getHeaderEntries(getLatestHTTPAttempt(resultDataValue)?.responseHeaders)
}
