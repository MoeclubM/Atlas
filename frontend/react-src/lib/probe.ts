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

function joinUniqueStrings(values: Array<string | undefined>, separator: string): string | undefined {
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
      metadata['countryCode'],
    ),
    latitude: getFiniteCoordinate(metadata['latitude']),
    longitude: getFiniteCoordinate(metadata['longitude']),
  }
}

export function getProbeProviderLabel(metadataValue: unknown): string {
  return getProbeMetadataSummary(metadataValue).providerLabel || ''
}

type ProbeWithCoordinates = {
  latitude?: number | null
  longitude?: number | null
  metadata?: unknown
}

export function normalizeProbeCoordinates<T extends ProbeWithCoordinates>(
  probe: T,
): T & { latitude: number | null; longitude: number | null } {
  const metadataSummary = getProbeMetadataSummary(probe.metadata)

  return {
    ...probe,
    latitude: getFiniteCoordinate(probe.latitude) ?? metadataSummary.latitude ?? null,
    longitude: getFiniteCoordinate(probe.longitude) ?? metadataSummary.longitude ?? null,
  }
}
