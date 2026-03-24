import { describe, expect, it } from 'vitest'
import {
  deriveHomeRows,
  getRouteResultMaps,
  getSparkSamplesFromResult,
  type HomeResultRow,
} from '@/lib/home'
import type { ProbeRecord, TaskResult } from '@/lib/domain'

function createProbe(id: string, overrides: Partial<ProbeRecord> = {}): ProbeRecord {
  return {
    probe_id: id,
    location: `Location ${id}`,
    metadata: { provider: `ISP ${id}` },
    ...overrides,
  }
}

function createResult(probeId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    probe_id: probeId,
    status: 'success',
    summary: {},
    result_data: {},
    ...overrides,
  }
}

describe('home helpers', () => {
  it('collects spark samples for icmp and tcp results', () => {
    expect(
      getSparkSamplesFromResult(
        createResult('p1', {
          result_data: {
            packets_sent: 4,
            replies: [{ time_ms: 10 }, { time_ms: 20 }, { time_ms: 0 }],
          },
        }),
        'icmp_ping',
      ),
    ).toEqual([10, 20, null, null])

    expect(
      getSparkSamplesFromResult(
        createResult('p1', {
          result_data: {
            attempts: [
              { status: 'success', time_ms: 12 },
              { status: 'failed', time_ms: 0 },
            ],
          },
        }),
        'tcp_ping',
      ),
    ).toEqual([12, null])

    expect(
      getSparkSamplesFromResult(
        createResult('p1', {
          result_data: { successful_connections: 1, failed_connections: 2 },
        }),
        'tcp_ping',
      ),
    ).toEqual([null, null, null])

    expect(
      getSparkSamplesFromResult(
        createResult('p1', {
          status: 'failed',
          result_data: {},
        }),
        'icmp_ping',
      ),
    ).toEqual([null])

    expect(
      getSparkSamplesFromResult(
        createResult('p1', {
          status: 'failed',
          result_data: {},
        }),
        'tcp_ping',
      ),
    ).toEqual([null])

    expect(
      getSparkSamplesFromResult(
        createResult('p1', {
          status: 'failed',
          result_data: {},
          summary: {},
        }),
        'custom_probe',
      ),
    ).toEqual([null])

    expect(
      getSparkSamplesFromResult(
        createResult('p1', {
          status: 'success',
          result_data: {},
          summary: {},
        }),
        'custom_probe',
      ),
    ).toEqual([])
  })

  it('derives dense home rows and placeholder probes', () => {
    const probesMap = new Map<string, ProbeRecord>([
      ['p1', createProbe('p1', { location: 'Tokyo' })],
      ['p2', createProbe('p2', { location: 'Singapore' })],
    ])

    const rows = deriveHomeRows({
      taskResults: [
        createResult('p1', {
          status: 'success',
          target: 'example.com',
          summary: { avg_rtt_ms: 20, min_rtt_ms: 10, max_rtt_ms: 30 },
          result_data: {
            packets_sent: 4,
            packets_received: 4,
            resolved_ip: '1.1.1.1',
            target_isp: 'ISP-A',
            target_asn: 'AS100',
            target_as_name: 'Transit',
          },
        }),
        createResult('p1', {
          status: 'success',
          target: 'example.com',
          summary: { avg_rtt_ms: 40, min_rtt_ms: 15, max_rtt_ms: 45 },
          result_data: {
            packets_sent: 4,
            packets_received: 3,
            resolved_ip: '1.1.1.1',
            target_isp: 'ISP-A',
            target_asn: 'AS100',
            target_as_name: 'Transit',
          },
        }),
      ],
      probesMap,
      activeProbeIds: ['p1', 'p2'],
      target: 'example.com',
      getUnknownLabel: () => 'Unknown',
      getPlaceholderStatus: () => 'pending',
    })

    const tokyo = rows.find((row) => row.probe_id === 'p1') as HomeResultRow
    expect(tokyo).toMatchObject({
      location: 'Tokyo',
      provider: 'ISP p1',
      resolved_ip: '1.1.1.1',
      send_count: 2,
      status: 'success',
      target_isp: 'ISP-A',
      target_asn: 'AS100',
      target_as_name: 'Transit',
    })
    expect(tokyo.avg_latency).toBe(30)
    expect(tokyo.min_latency).toBe(10)
    expect(tokyo.max_latency).toBe(45)
    expect(tokyo.packet_loss).toBe(25)

    expect(rows.find((row) => row.probe_id === 'p2')).toMatchObject({
      location: 'Singapore',
      status: 'pending',
    })
  })

  it('derives row status from http, traceroute and mtr fallbacks', () => {
    const probesMap = new Map<string, ProbeRecord>([
      ['http', createProbe('http', { location: 'Hong Kong' })],
      ['trace', createProbe('trace', { location: 'Sydney', metadata: {} })],
      ['mtr', createProbe('mtr', { location: 'Frankfurt' })],
      ['avg-only', createProbe('avg-only', { location: 'Paris' })],
      ['unknown', createProbe('unknown', { location: 'Madrid' })],
    ])

    const rows = deriveHomeRows({
      taskResults: [
        createResult('http', {
          status: '',
          result_data: {
            attempts: [{ status: 'timeout', time_ms: 12.5, status_code: 504 }],
          },
        }),
        createResult('trace', {
          status: '',
          result_data: {
            hops: [{ hop: 1, ip: '10.0.0.1' }],
            success: true,
          },
        }),
        createResult('mtr', {
          status: '',
          result_data: {
            hops: [{ hop: 1, ip: '10.0.0.2', loss_percent: 100 }],
            success: false,
          },
        }),
        createResult('avg-only', {
          status: '',
          summary: { avg_rtt_ms: 18.2 },
          result_data: {},
        }),
        createResult('unknown', {
          status: '',
          summary: {},
          result_data: {},
        }),
      ],
      probesMap,
      activeProbeIds: [],
      target: '8.8.8.8',
      getUnknownLabel: () => 'Unknown',
      getPlaceholderStatus: () => 'pending',
    })

    expect(rows.find((row) => row.probe_id === 'http')).toMatchObject({
      location: 'Hong Kong',
      status: 'timeout',
      last_latency: 12.5,
      http_status_code: 504,
    })
    expect(rows.find((row) => row.probe_id === 'trace')).toMatchObject({
      location: 'Sydney',
      provider: '-',
      status: 'success',
    })
    expect(rows.find((row) => row.probe_id === 'mtr')).toMatchObject({
      location: 'Frankfurt',
      status: 'failed',
    })
    expect(rows.find((row) => row.probe_id === 'avg-only')).toMatchObject({
      location: 'Paris',
      status: 'success',
      last_latency: 18.2,
    })
    expect(rows.find((row) => row.probe_id === 'unknown')).toMatchObject({
      location: 'Madrid',
      status: 'unknown',
      resolved_ip: '8.8.8.8',
    })
  })

  it('builds route result maps for traceroute, mtr and http results', () => {
    const maps = getRouteResultMaps([
      createResult('trace', {
        result_data: {
          hops: [{ hop: 1, ip: '10.0.0.1' }],
        },
      }),
      createResult('mtr', {
        result_data: {
          hops: [{ hop: 1, ip: '10.0.0.2', loss_percent: 0 }],
        },
      }),
      createResult('http', {
        result_data: {
          attempts: [{ seq: 1, status_code: 200 }],
        },
      }),
    ])

    expect(maps.tracerouteData.trace?.hops).toHaveLength(1)
    expect(maps.mtrData.mtr?.hops).toHaveLength(1)
    expect(maps.httpData.http?.attempts).toHaveLength(1)
  })
})
