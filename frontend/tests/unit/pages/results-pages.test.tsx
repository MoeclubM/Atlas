import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SingleResultPage } from '@/pages/single-result-page'
import type { ProbeRecord, TaskResult } from '@/lib/domain'
import { renderRoute } from '../test-utils'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
  request: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  default: apiMock,
}))

vi.mock('@/components/common/world-map', () => ({
  WorldMap: ({
    probes = [],
    routes = [],
  }: {
    probes?: unknown[]
    routes?: Array<{ points?: unknown[] }>
  }) => <div data-testid="world-map">{`markers:${probes.length};routes:${routes.length}`}</div>,
}))

function createProbe(probeId: string, overrides: Partial<ProbeRecord> = {}): ProbeRecord {
  return {
    probe_id: probeId,
    name: `${probeId}-node`,
    location: `${probeId}-location`,
    latitude: 30,
    longitude: 120,
    metadata: { provider: `${probeId}-isp` },
    ...overrides,
  }
}

function createResult(probeId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    probe_id: probeId,
    status: 'success',
    target: 'example.com',
    summary: {},
    result_data: {},
    created_at: '2026-03-24T00:00:00Z',
    ...overrides,
  }
}

describe('result pages', () => {
  beforeEach(() => {
    apiMock.get.mockReset()
    apiMock.post.mockReset()
    apiMock.put.mockReset()
    apiMock.delete.mockReset()
    apiMock.patch.mockReset()
    apiMock.request.mockReset()
  })

  it('renders single-result rows and expands traceroute/http detail tables', async () => {
    const user = userEvent.setup()

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/tasks/task-single') {
        return {
          task: { task_id: 'task-single', status: 'completed' },
          results: [
            createResult('trace', {
              test_type: 'traceroute',
              summary: { resolved_ip: '1.1.1.1' },
              result_data: {
                hops: [
                  {
                    hop: 1,
                    ip: '10.0.0.1',
                    hostname: 'router',
                    rtts: [1.1, 1.2],
                    geo: { isp: 'ISP-A', country: 'JP' },
                  },
                ],
                total_hops: 1,
                success: true,
              },
            }),
            createResult('http', {
              test_type: 'http_test',
              target: 'https://example.com',
              result_data: {
                attempts: [
                  {
                    seq: 1,
                    status: 'success',
                    time_ms: 15.4,
                    status_code: 200,
                    resolved_ip: '2.2.2.2',
                    final_url: 'https://example.com/final',
                    request_headers: { Accept: ['*/*'] },
                    response_headers: { Server: 'nginx' },
                  },
                ],
              },
            }),
          ],
        }
      }
      if (url === '/probes') {
        return {
          probes: [
            createProbe('trace', { name: 'Tokyo Trace', location: 'Tokyo' }),
            createProbe('http', { name: 'Osaka HTTP', location: 'Osaka' }),
          ],
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })

    renderRoute(<SingleResultPage />, {
      path: '/results/single/:id',
      route: '/results/single/task-single',
    })

    expect(await screen.findByText('Tokyo')).toBeInTheDocument()
    expect(screen.getByText('Osaka')).toBeInTheDocument()
    expect(screen.getByTestId('world-map')).toHaveTextContent('markers:2;routes:0')

    await user.click(screen.getByText('Tokyo'))
    expect(await screen.findByText('results.tracerouteDetail')).toBeInTheDocument()
    expect(screen.getAllByText('router').length).toBeGreaterThan(0)

    await user.click(screen.getByText('Osaka'))
    expect(await screen.findByText('results.httpDetail')).toBeInTheDocument()
    expect(screen.getByText('Request Headers')).toBeInTheDocument()
    expect(screen.getByText('Response Headers')).toBeInTheDocument()
  })

  it('renders mtr failures and no-route placeholders without map markers', async () => {
    const user = userEvent.setup()

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/tasks/task-single-fallback') {
        return {
          task: { task_id: 'task-single-fallback', status: 'completed' },
          results: [
            createResult('mtr', {
              test_type: 'mtr',
              status: 'success',
              result_data: {
                hops: [
                  {
                    hop: 1,
                    ip: '10.0.0.9',
                    loss_percent: 100,
                    sent: 5,
                    timeout: true,
                  },
                ],
                total_hops: 1,
                success: false,
              },
            }),
            createResult('plain', {
              test_type: 'icmp_ping',
              status: '',
              result_data: {},
            }),
          ],
        }
      }
      if (url === '/probes') {
        return {
          probes: [
            createProbe('mtr', {
              name: 'Delhi MTR',
              location: 'Delhi',
              latitude: null,
              longitude: null,
            }),
          ],
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })

    renderRoute(<SingleResultPage />, {
      path: '/results/single/:id',
      route: '/results/single/task-single-fallback',
    })

    expect(await screen.findByText('Delhi')).toBeInTheDocument()
    expect(screen.queryByTestId('world-map')).not.toBeInTheDocument()

    await user.click(screen.getByText('Delhi'))
    expect(await screen.findByText('results.mtrDetail')).toBeInTheDocument()
    expect(screen.getAllByText('common.failed').length).toBeGreaterThan(0)

    await user.click(screen.getByText('common.unknown'))
    expect(await screen.findByText('results.noRouteData')).toBeInTheDocument()
  })

  it('renders a traceroute route map when the task is traceroute', async () => {
    const user = userEvent.setup()

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/tasks/task-single-trace') {
        return {
          task: { task_id: 'task-single-trace', status: 'completed', task_type: 'traceroute' },
          results: [
            createResult('trace-only', {
              test_type: 'traceroute',
              result_data: {
                hops: [
                  {
                    hop: 1,
                    ip: '10.0.0.1',
                    hostname: 'router',
                    rtts: [1.1, 1.2],
                    geo: { isp: 'ISP-A', country: 'JP', latitude: 35.68, longitude: 139.76 },
                  },
                ],
                total_hops: 1,
                success: true,
              },
            }),
          ],
        }
      }
      if (url === '/probes') {
        return {
          probes: [createProbe('trace-only', { name: 'Tokyo Trace', location: 'Tokyo' })],
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })

    renderRoute(<SingleResultPage />, {
      path: '/results/single/:id',
      route: '/results/single/task-single-trace',
    })

    expect(await screen.findByText('Tokyo')).toBeInTheDocument()
    expect(screen.getByTestId('world-map')).toHaveTextContent('markers:0;routes:1')

    await user.click(screen.getByText('Tokyo'))
    expect(await screen.findByText('results.tracerouteDetail')).toBeInTheDocument()
  })

  it('collapses expanded single-result rows and navigates back to the test workspace', async () => {
    const user = userEvent.setup()

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/tasks/task-single-collapse') {
        return {
          task: { task_id: 'task-single-collapse', status: 'completed' },
          results: [
            createResult('collapse', {
              test_type: 'icmp_ping',
              result_data: {},
            }),
          ],
        }
      }
      if (url === '/probes') {
        return {
          probes: [createProbe('collapse', { name: 'Taipei Node', location: 'Taipei' })],
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })

    renderRoute(<SingleResultPage />, {
      path: '/results/single/:id',
      route: '/results/single/task-single-collapse',
    })

    const rowLabel = await screen.findByText('Taipei')
    await user.click(rowLabel)
    expect(await screen.findByText('results.noRouteData')).toBeInTheDocument()

    await user.click(rowLabel)
    await waitFor(() => expect(screen.queryByText('results.noRouteData')).not.toBeInTheDocument())

    await user.click(screen.getByText('common.back'))
    expect(await screen.findByTestId('route-test')).toBeInTheDocument()
  })
})
