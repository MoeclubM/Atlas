import { getFiniteCoordinate } from './coordinate'
import { parseMaybeJSON } from './parse'

function getNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }

    const trimmed = value.trim()
    if (trimmed !== '') {
      return trimmed
    }
  }

  return undefined
}

function joinUniqueStrings(
  values: Array<string | undefined>,
  separator: string
): string | undefined {
  const unique = values.filter((value, index, items): value is string => {
    if (!value) return false
    return items.indexOf(value) === index
  })

  if (!unique.length) return undefined
  return unique.join(separator)
}

export type ProbeMetadataSummary = {
  version?: string
  providerLabel?: string
  city?: string
  country?: string
  latitude?: number | null
  longitude?: number | null
}

export type ProbeSystemSupportSummary = {
  reported: boolean
  platform?: string
  rawICMPIPv4: boolean
  rawICMPIPv4Reason?: string
  rawICMPIPv6: boolean
  rawICMPIPv6Reason?: string
  icmpPing: boolean
  icmpPingReason?: string
  tcpPing: boolean
  httpTest: boolean
  traceroute: boolean
  tracerouteReason?: string
  mtr: boolean
  mtrReason?: string
  birdRoute: boolean
  birdRouteReason?: string
  birdSocketPath?: string
}

export function getProbeMetadataSummary(metadataValue: unknown): ProbeMetadataSummary {
  const metadata = parseMaybeJSON(metadataValue)
  const provider = getNonEmptyString(metadata['provider'], metadata['isp'])
  const asn = getNonEmptyString(metadata['asn'])

  return {
    version: getNonEmptyString(metadata['version']),
    providerLabel: joinUniqueStrings([provider, asn], ' / ') || asn,
    city: getNonEmptyString(metadata['city'], metadata['location_city']),
    country: getNonEmptyString(
      metadata['country'],
      metadata['country_code'],
      metadata['countryCode']
    ),
    latitude: getFiniteCoordinate(metadata['latitude']),
    longitude: getFiniteCoordinate(metadata['longitude']),
  }
}

export function getProbeProviderLabel(metadataValue: unknown): string {
  return getProbeMetadataSummary(metadataValue).providerLabel || ''
}

export function getProbeSystemSupportSummary(
  systemSupportValue: unknown,
  metadataValue?: unknown
): ProbeSystemSupportSummary {
  const systemSupport = parseMaybeJSON(systemSupportValue)
  const metadata = parseMaybeJSON(metadataValue)
  const source = Object.keys(systemSupport).length > 0 ? systemSupport : metadata

  const platform =
    getNonEmptyString(
      source['platform'],
      source['system_platform'],
      metadata['system_platform'],
      getPlatformFallback(metadata)
    ) || undefined

  const reported =
    getBooleanValue(systemSupport['reported']) ??
    hasAnyKey(source, [
      'platform',
      'system_platform',
      'support_raw_icmp_ipv4',
      'support_raw_icmp_ipv6',
      'raw_icmp_ipv4',
      'raw_icmp_ipv6',
      'support_icmp_ping',
      'support_tcp_ping',
      'support_http_test',
      'support_traceroute',
      'support_mtr',
      'support_bird_route',
      'icmp_ping',
      'tcp_ping',
      'http_test',
      'traceroute',
      'mtr',
      'bird_route',
    ])

  return {
    reported,
    platform,
    rawICMPIPv4:
      getBooleanValue(source['raw_icmp_ipv4']) ??
      getBooleanValue(source['support_raw_icmp_ipv4']) ??
      false,
    rawICMPIPv4Reason:
      getNonEmptyString(source['raw_icmp_ipv4_reason'], source['support_raw_icmp_ipv4_reason']) ||
      undefined,
    rawICMPIPv6:
      getBooleanValue(source['raw_icmp_ipv6']) ??
      getBooleanValue(source['support_raw_icmp_ipv6']) ??
      false,
    rawICMPIPv6Reason:
      getNonEmptyString(source['raw_icmp_ipv6_reason'], source['support_raw_icmp_ipv6_reason']) ||
      undefined,
    icmpPing:
      getBooleanValue(source['icmp_ping']) ?? getBooleanValue(source['support_icmp_ping']) ?? false,
    icmpPingReason:
      getNonEmptyString(source['icmp_ping_reason'], source['support_icmp_ping_reason']) ||
      undefined,
    tcpPing:
      getBooleanValue(source['tcp_ping']) ?? getBooleanValue(source['support_tcp_ping']) ?? false,
    httpTest:
      getBooleanValue(source['http_test']) ?? getBooleanValue(source['support_http_test']) ?? false,
    traceroute:
      getBooleanValue(source['traceroute']) ??
      getBooleanValue(source['support_traceroute']) ??
      false,
    tracerouteReason:
      getNonEmptyString(source['traceroute_reason'], source['support_traceroute_reason']) ||
      undefined,
    mtr: getBooleanValue(source['mtr']) ?? getBooleanValue(source['support_mtr']) ?? false,
    mtrReason: getNonEmptyString(source['mtr_reason'], source['support_mtr_reason']) || undefined,
    birdRoute:
      getBooleanValue(source['bird_route']) ??
      getBooleanValue(source['support_bird_route']) ??
      false,
    birdRouteReason:
      getNonEmptyString(source['bird_route_reason'], source['support_bird_route_reason']) ||
      undefined,
    birdSocketPath:
      getNonEmptyString(source['bird_socket_path'], source['support_bird_socket_path']) ||
      undefined,
  }
}

type ProbeWithCoordinates = {
  latitude?: number | null
  longitude?: number | null
  metadata?: unknown
}

export function normalizeProbeCoordinates<T extends ProbeWithCoordinates>(
  probe: T
): T & { latitude: number | null; longitude: number | null } {
  const metadataSummary = getProbeMetadataSummary(probe.metadata)

  return {
    ...probe,
    latitude: getFiniteCoordinate(probe.latitude) ?? metadataSummary.latitude ?? null,
    longitude: getFiniteCoordinate(probe.longitude) ?? metadataSummary.longitude ?? null,
  }
}

function getBooleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    switch (value.trim().toLowerCase()) {
      case '1':
      case 'true':
      case 'yes':
      case 'on':
        return true
      case '0':
      case 'false':
      case 'no':
      case 'off':
        return false
      default:
        return undefined
    }
  }

  return undefined
}

function hasAnyKey(record: Record<string, unknown>, keys: string[]) {
  return keys.some(key => Object.prototype.hasOwnProperty.call(record, key))
}

function getPlatformFallback(metadata: Record<string, unknown>) {
  const os = getNonEmptyString(metadata['os'])
  const arch = getNonEmptyString(metadata['arch'])

  if (os && arch) {
    return `${os}/${arch}`
  }
  return os || arch
}
