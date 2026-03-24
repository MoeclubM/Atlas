import { describe, expect, it } from 'vitest'
import {
  buildLatencyScale,
  getLatencyHex,
  getLatencyTextClass,
  getLatencyTone,
} from '@/lib/latency'
import {
  getAvgLatency,
  getHeaderEntries,
  getHTTPAttempts,
  getHTTPStatusChipColor,
  getHTTPStatusCode,
  getHTTPStatusTextClass,
  getHTTPStatusTone,
  getLatestHTTPAttempt,
  getLatestHTTPRequestHeaderEntries,
  getLatestHTTPResponseHeaderEntries,
  getMTRResult,
  getPacketLossPercent,
  getPacketLossStats,
  getResolvedIP,
  getStddevLatency,
  getTargetNetworkInfo,
  getTracerouteResult,
} from '@/lib/result'

describe('latency helpers', () => {
  it('maps latency and status to tones, colors and text classes', () => {
    expect(getLatencyTone(undefined, 'pending')).toBe('neutral')
    expect(getLatencyTone(10, 'success')).toBe('excellent')
    expect(getLatencyTone(30, 'success')).toBe('good')
    expect(getLatencyTone(70, 'success')).toBe('fair')
    expect(getLatencyTone(120, 'success')).toBe('warn')
    expect(getLatencyTone(240, 'success')).toBe('bad')
    expect(getLatencyTone(10, 'failed')).toBe('bad')
    expect(getLatencyHex(10, 'success')).toBe('#20b26b')
    expect(getLatencyTextClass(10, 'success')).toBe('latency-excellent')
    expect(getLatencyTextClass(undefined, 'pending')).toBe('')
  })

  it('builds a scale from finite samples and handles outliers', () => {
    expect(buildLatencyScale([null, null])).toBeNull()
    expect(buildLatencyScale([5])).toEqual({ floor: 3, ceiling: 7 })

    const scale = buildLatencyScale([
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      21, 22, 23, 24, 25, 26, 27, 28, 29, 1000,
    ])
    expect(scale).not.toBeNull()
    expect(scale!.floor).toBeLessThan(10)
    expect(scale!.ceiling).toBeLessThan(1000)
  })
})

describe('result helpers', () => {
  it('extracts resolved ip and packet loss from summary or payload', () => {
    expect(getResolvedIP({ resolved_ip: '1.1.1.1' }, {})).toBe('1.1.1.1')
    expect(getResolvedIP({}, {}, 'https://8.8.8.8/test')).toBe('8.8.8.8')
    expect(getResolvedIP({}, {}, 'example.com')).toBeUndefined()

    expect(getPacketLossStats({ packets_sent: 4, packets_received: 3 })).toEqual({
      failed: 1,
      total: 4,
    })
    expect(
      getPacketLossStats({ successful_connections: 3, failed_connections: 1 }),
    ).toEqual({
      failed: 1,
      total: 4,
    })
    expect(getPacketLossPercent({ packet_loss_percent: 25 }, {})).toBe(25)
    expect(getPacketLossPercent({}, { packets_sent: 4, packets_received: 3 })).toBe(25)
  })

  it('extracts latency and target network fields', () => {
    expect(getAvgLatency({ avg_rtt_ms: 22.3 }, {})).toBe(22.3)
    expect(getAvgLatency({}, { avg_connect_time_ms: 45 })).toBe(45)
    expect(getStddevLatency({ stddev_rtt_ms: 3.1 }, {})).toBe(3.1)
    expect(getTargetNetworkInfo({ target_isp: 'ISP-A' }, { target_asn: 'AS100' })).toEqual({
      isp: 'ISP-A',
      asn: 'AS100',
      asName: undefined,
    })
  })

  it('normalizes traceroute and mtr payloads with geo information', () => {
    const traceroute = getTracerouteResult({
      hops: [
        {
          hop: 1,
          ip: '10.0.0.1',
          hostname: 'router',
          rtts: [1.1, 1.2],
          geo: {
            isp: 'ISP-A',
            country: 'CN',
            region: 'ZJ',
            city: 'Hangzhou',
            latitude: 30,
            longitude: 120,
          },
        },
      ],
      total_hops: 1,
      success: true,
    })
    expect(traceroute).toMatchObject({
      totalHops: 1,
      success: true,
    })
    expect(traceroute?.hops[0]?.geo?.city).toBe('Hangzhou')

    const mtr = getMTRResult({
      hops: [
        {
          hop: 1,
          ip: '10.0.0.1',
          hostname: 'router',
          loss_percent: 0.5,
          sent: 10,
          last_rtt_ms: 1,
          avg_rtt_ms: 2,
          best_rtt_ms: 1,
          worst_rtt_ms: 5,
          stddev_rtt_ms: 0.6,
          geo: { isp: 'ISP-B', country: 'US' },
        },
      ],
      total_hops: 1,
      success: true,
      packet_loss_percent: 0.5,
    })
    expect(mtr).toMatchObject({
      totalHops: 1,
      success: true,
      packetLossPercent: 0.5,
    })
    expect(mtr?.hops[0]?.hostname).toBe('router')
  })

  it('normalizes http attempts, headers and status helpers', () => {
    const resultData = {
      attempts: [
        {
          seq: 1,
          status: 'success',
          time_ms: 11.2,
          status_code: 200,
          response_status: '200 OK',
          resolved_ip: '1.1.1.1',
          final_url: 'https://example.com',
          request_headers: { Accept: ['*/*'] },
          response_headers: { Server: 'nginx', Age: 1 },
        },
      ],
      status_code: 204,
    }

    expect(getHTTPAttempts(resultData)).toHaveLength(1)
    expect(getLatestHTTPAttempt(resultData)).toMatchObject({
      status: 'success',
      statusCode: 200,
      resolvedIP: '1.1.1.1',
      responseHeaders: { Age: ['1'], Server: ['nginx'] },
    })
    expect(getHTTPStatusCode({}, resultData)).toBe(200)
    expect(getHTTPStatusTone(200)).toBe('success')
    expect(getHTTPStatusTone(302)).toBe('warning')
    expect(getHTTPStatusTone(500)).toBe('error')
    expect(getHTTPStatusChipColor(500)).toBe('error')
    expect(getHTTPStatusTextClass(200)).toBe('good')
    expect(getHTTPStatusTextClass(302)).toBe('warn')
    expect(getHTTPStatusTextClass(500)).toBe('bad')

    expect(getHeaderEntries({ B: ['2'], A: ['1'] })).toEqual([
      { name: 'A', value: '1' },
      { name: 'B', value: '2' },
    ])
    expect(getLatestHTTPRequestHeaderEntries(resultData)).toEqual([
      { name: 'Accept', value: '*/*' },
    ])
    expect(getLatestHTTPResponseHeaderEntries(resultData)).toEqual([
      { name: 'Age', value: '1' },
      { name: 'Server', value: 'nginx' },
    ])
  })
})
