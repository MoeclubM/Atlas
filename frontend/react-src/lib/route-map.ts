import { hasValidCoordinates } from '@/lib/coordinate'
import type { ProbeRecord } from '@/lib/domain'
import type { TracerouteResultData } from '@/lib/result'

export type WorldMapRoutePoint = {
  id: string
  label: string
  subtitle?: string
  latitude: number
  longitude: number
  kind: 'probe' | 'hop'
}

export type WorldMapRoute = {
  id: string
  points: WorldMapRoutePoint[]
}

export function buildTracerouteWorldRoute({
  probe,
  traceroute,
  getUnknownLabel,
}: {
  probe?: ProbeRecord
  traceroute?: TracerouteResultData
  getUnknownLabel: () => string
}): WorldMapRoute | null {
  if (!traceroute?.hops?.length) {
    return null
  }

  const points: WorldMapRoutePoint[] = []

  if (probe && hasValidCoordinates(probe.latitude, probe.longitude)) {
    points.push({
      id: `${probe.probe_id}-probe`,
      label: probe.location || probe.name || getUnknownLabel(),
      subtitle: probe.name || probe.probe_id,
      latitude: probe.latitude,
      longitude: probe.longitude as number,
      kind: 'probe',
    })
  }

  for (const hop of traceroute.hops) {
    const latitude = hop.geo?.latitude
    const longitude = hop.geo?.longitude
    if (!hasValidCoordinates(latitude, longitude)) {
      continue
    }

    const candidate: WorldMapRoutePoint = {
      id: `${probe?.probe_id || 'route'}-hop-${hop.hop}`,
      label: `Hop ${hop.hop}`,
      subtitle: [hop.ip, hop.hostname, hop.geo?.isp, hop.geo?.country, hop.geo?.city]
        .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
        .join(' · '),
      latitude,
      longitude: longitude as number,
      kind: 'hop',
    }

    const previous = points[points.length - 1]
    if (
      previous &&
      previous.latitude === candidate.latitude &&
      previous.longitude === candidate.longitude
    ) {
      continue
    }

    points.push(candidate)
  }

  if (!points.length) {
    return null
  }

  return {
    id: `traceroute-${probe?.probe_id || 'route'}`,
    points,
  }
}
