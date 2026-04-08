import { describe, expect, it } from 'vitest'
import { buildTracerouteWorldRoute } from '@/lib/route-map'
import type { ProbeRecord } from '@/lib/domain'
import type { TracerouteResultData } from '@/lib/result'

describe('route map helpers', () => {
  it('builds a route from the probe and geolocated traceroute hops', () => {
    const probe: ProbeRecord = {
      probe_id: 'p1',
      name: 'Tokyo Node',
      location: 'Tokyo',
      latitude: 35.68,
      longitude: 139.76,
    }

    const traceroute: TracerouteResultData = {
      hops: [
        { hop: 1, ip: '10.0.0.1' },
        {
          hop: 2,
          ip: '203.0.113.1',
          hostname: 'edge',
          geo: { isp: 'Transit', country: 'JP', city: 'Tokyo', latitude: 35.68, longitude: 139.76 },
        },
        {
          hop: 3,
          ip: '1.1.1.1',
          geo: { isp: 'Cloudflare', country: 'AU', city: 'Sydney', latitude: -33.86, longitude: 151.2 },
        },
      ],
      totalHops: 3,
      success: true,
    }

    const route = buildTracerouteWorldRoute({
      probe,
      traceroute,
      getUnknownLabel: () => 'Unknown',
    })

    expect(route).not.toBeNull()
    expect(route?.points).toHaveLength(2)
    expect(route?.points[0]).toMatchObject({
      kind: 'probe',
      label: 'Tokyo',
    })
    expect(route?.points[1]).toMatchObject({
      kind: 'hop',
      label: 'Hop 3',
    })
  })

  it('returns null when no route point has coordinates', () => {
    const route = buildTracerouteWorldRoute({
      probe: { probe_id: 'p1', name: 'No Coord' },
      traceroute: {
        hops: [{ hop: 1, ip: '10.0.0.1' }],
      },
      getUnknownLabel: () => 'Unknown',
    })

    expect(route).toBeNull()
  })
})
