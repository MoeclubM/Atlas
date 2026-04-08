import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from '@/pages/home-page'
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
  }) => (
    <div data-testid="world-map">{`markers:${probes.length};routes:${routes.length}`}</div>
  ),
}))

vi.mock('@/components/ui/select', () => ({
  SelectField: ({
    value,
    onValueChange,
    options,
    testId,
  }: {
    value: string
    onValueChange: (value: string) => void
    options: Array<{ value: string; label: string }>
    testId?: string
  }) => (
    <select
      data-testid={testId}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

function createProbe(probeId: string, overrides: Partial<ProbeRecord> = {}): ProbeRecord {
  return {
    probe_id: probeId,
    name: `${probeId}-node`,
    location: `${probeId}-location`,
    status: 'online',
    latitude: 30,
    longitude: 120,
    metadata: { provider: `${probeId}-isp` },
    capabilities: ['all'],
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
    ...overrides,
  }
}

describe('HomePage', () => {
  beforeEach(() => {
    apiMock.get.mockReset()
    apiMock.post.mockReset()
    apiMock.put.mockReset()
    apiMock.delete.mockReset()
    apiMock.patch.mockReset()
    apiMock.request.mockReset()
  })

  it('starts a continuous icmp task and renders dense rows', async () => {
    const user = userEvent.setup()

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/probes') {
        return {
          probes: [
            createProbe('p1', { name: 'Tokyo Node', location: 'Tokyo' }),
            createProbe('p2', {
              name: 'Offline Style',
              location: 'Singapore',
              latitude: null,
              longitude: null,
            }),
          ],
        }
      }
      if (url === '/tasks/task-icmp') {
        return {
          task: { task_id: 'task-icmp', status: 'completed' },
        }
      }
      if (url === '/tasks/task-icmp-mtr') {
        return {
          task: { task_id: 'task-icmp-mtr', status: 'completed' },
          results: [
            createResult('p1', {
              test_type: 'mtr',
              result_data: {
                hops: [
                  {
                    hop: 1,
                    ip: '10.0.0.1',
                    loss_percent: 0,
                    sent: 5,
                    avg_rtt_ms: 8,
                    best_rtt_ms: 7,
                    worst_rtt_ms: 9,
                    stddev_rtt_ms: 0.4,
                  },
                ],
                total_hops: 1,
                success: true,
                packet_loss_percent: 0,
              },
            }),
          ],
        }
      }
      if (url === '/results') {
        return {
          results: [
            createResult('p1', {
              summary: { avg_rtt_ms: 20, min_rtt_ms: 10, max_rtt_ms: 30 },
              result_data: {
                packets_sent: 4,
                packets_received: 3,
                replies: [{ time_ms: 10 }, { time_ms: 20 }, { time_ms: 30 }],
                resolved_ip: '1.1.1.1',
                target_isp: 'ISP-A',
              },
            }),
            createResult('p2', {
              status: 'failed',
              result_data: {
                packets_sent: 4,
                packets_received: 0,
              },
            }),
          ],
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })
    apiMock.post
      .mockResolvedValueOnce({ task_id: 'task-icmp' })
      .mockResolvedValueOnce({ task_id: 'task-icmp-mtr' })

    renderRoute(<HomePage />, {
      path: '/test',
      route: '/test',
    })

    expect(await screen.findByTestId('home-type-select')).toHaveValue('icmp_ping')
    await user.type(within(screen.getByTestId('home-target')).getByRole('textbox'), 'example.com')
    await user.click(screen.getByTestId('home-start'))

    expect(await screen.findByTestId('home-results')).toBeInTheDocument()
    expect(apiMock.post).toHaveBeenCalledWith(
      '/tasks',
      expect.objectContaining({
        task_type: 'icmp_ping',
        mode: 'continuous',
        target: 'example.com',
        assigned_probes: [],
      }),
    )
    expect(screen.getByText('Tokyo')).toBeInTheDocument()
    expect(screen.getByText('1.1.1.1')).toBeInTheDocument()
    expect(screen.getByText('Singapore')).toBeInTheDocument()
    expect(screen.getByTestId('world-map')).toHaveTextContent('markers:1;routes:0')

    const resultPanel = await screen.findByTestId('home-results')
    await user.click(within(resultPanel).getByText('Tokyo'))
    expect(await screen.findByTestId('home-mtr-detail')).toBeInTheDocument()
  })

  it('selects all mtr-capable probes and expands hop details', async () => {
    const user = userEvent.setup()

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/probes') {
        return {
          probes: [
            createProbe('m1', {
              name: 'Tokyo Route',
              location: 'Tokyo',
              capabilities: ['mtr'],
            }),
            createProbe('m2', {
              name: 'Seoul Route',
              location: 'Seoul',
              capabilities: ['mtr'],
              latitude: null,
              longitude: null,
            }),
            createProbe('x1', {
              name: 'Ping Only',
              location: 'London',
              capabilities: ['icmp_ping'],
            }),
          ],
        }
      }
      if (url === '/tasks/task-mtr') {
        return {
          task: { task_id: 'task-mtr', status: 'completed' },
          results: [
            createResult('m1', {
              test_type: 'mtr',
              result_data: {
                hops: [
                  {
                    hop: 1,
                    ip: '10.0.0.1',
                    loss_percent: 0,
                    sent: 5,
                    avg_rtt_ms: 12,
                    best_rtt_ms: 11,
                    worst_rtt_ms: 13,
                    stddev_rtt_ms: 0.5,
                  },
                ],
                total_hops: 1,
                success: true,
                packet_loss_percent: 0,
              },
              summary: { resolved_ip: '8.8.8.8' },
            }),
          ],
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })
    apiMock.post.mockResolvedValue({ task_id: 'task-mtr' })

    renderRoute(<HomePage />, {
      path: '/test',
      route: '/test',
    })

    expect(await screen.findByTestId('home-type-select')).toHaveValue('icmp_ping')
    await user.selectOptions(screen.getByTestId('home-type-select'), 'mtr')
    await user.type(within(screen.getByTestId('home-target')).getByRole('textbox'), '8.8.8.8')

    expect(await screen.findByText('Tokyo')).toBeInTheDocument()
    expect(screen.getByText('Seoul')).toBeInTheDocument()
    expect(screen.queryByText('London')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('home-start'))

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        '/tasks',
        expect.objectContaining({
          task_type: 'mtr',
          mode: 'single',
          assigned_probes: ['m1', 'm2'],
        }),
      ),
    )

    const resultPanel = await screen.findByTestId('home-results')
    await user.click(within(resultPanel).getByText('Tokyo'))

    expect(await screen.findByTestId('home-mtr-detail')).toBeInTheDocument()
    expect(screen.getByTestId('home-mtr-hop-row')).toBeInTheDocument()
    expect(within(resultPanel).getAllByText('Seoul').length).toBeGreaterThan(0)
  })

  it('limits traceroute to one selected probe and renders route map paths', async () => {
    const user = userEvent.setup()

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/probes') {
        return {
          probes: [
            createProbe('trace-1', {
              name: 'Trace Node',
              location: 'Berlin',
              capabilities: ['traceroute'],
            }),
            createProbe('trace-2', {
              name: 'Trace Backup',
              location: 'Paris',
              capabilities: ['traceroute'],
            }),
          ],
        }
      }
      if (url === '/tasks/task-trace') {
        return {
          task: { task_id: 'task-trace', status: 'completed' },
          results: [
            createResult('trace-2', {
              test_type: 'traceroute',
              result_data: {
                hops: [
                  {
                    hop: 1,
                    ip: '10.0.0.1',
                    hostname: 'edge-router',
                    rtts: [3.4],
                    geo: { isp: 'Transit', country: 'DE', latitude: 52.52, longitude: 13.4 },
                  },
                ],
                total_hops: 1,
                success: true,
              },
            }),
          ],
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })
    apiMock.post.mockResolvedValue({ task_id: 'task-trace' })

    renderRoute(<HomePage />, {
      path: '/test',
      route: '/test',
    })

    await user.selectOptions(await screen.findByTestId('home-type-select'), 'traceroute')
    await user.type(within(screen.getByTestId('home-target')).getByRole('textbox'), 'example.com')
    expect(screen.getByTestId('home-start')).toBeDisabled()
    await user.click(screen.getByText('Berlin'))
    expect(screen.getByTestId('home-start')).not.toBeDisabled()
    await user.click(screen.getByText('Paris'))
    await user.click(screen.getByTestId('home-start'))

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        '/tasks',
        expect.objectContaining({
          task_type: 'traceroute',
          assigned_probes: ['trace-2'],
        }),
      ),
    )

    const resultPanel = await screen.findByTestId('home-results')
    await user.click(within(resultPanel).getByText('Paris'))

    expect(await screen.findByTestId('home-traceroute-detail')).toBeInTheDocument()
    expect(screen.getAllByText('edge-router').length).toBeGreaterThan(0)
    expect(screen.getByTestId('world-map')).toHaveTextContent('markers:0;routes:1')
  })

  it('renders http details for single tests', async () => {
    const user = userEvent.setup()

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/probes') {
        return {
          probes: [
            createProbe('http-1', {
              name: 'HTTP Node',
              location: 'Sydney',
            }),
          ],
        }
      }
      if (url === '/tasks/task-http') {
        return {
          task: { task_id: 'task-http', status: 'completed' },
          results: [
            createResult('http-1', {
              test_type: 'http_test',
              target: 'https://example.com',
              result_data: {
                attempts: [
                  {
                    seq: 1,
                    status: 'success',
                    time_ms: 20.1,
                    status_code: 200,
                    resolved_ip: '3.3.3.3',
                    final_url: 'https://example.com/final',
                    request_headers: { Accept: ['*/*'] },
                    response_headers: { Server: ['nginx'] },
                  },
                ],
              },
            }),
          ],
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })
    apiMock.post.mockResolvedValue({ task_id: 'task-http' })

    renderRoute(<HomePage />, {
      path: '/test',
      route: '/test',
    })

    await user.selectOptions(await screen.findByTestId('home-type-select'), 'http_test')
    await user.type(within(screen.getByTestId('home-target')).getByRole('textbox'), 'https://example.com')
    await user.click(screen.getByTestId('home-start'))

    const resultPanel = await screen.findByTestId('home-results')
    await user.click(within(resultPanel).getByText('Sydney'))

    expect(await screen.findByText('results.httpDetail')).toBeInTheDocument()
    expect(screen.getByText('Request Headers')).toBeInTheDocument()
    expect(screen.getByText('Response Headers')).toBeInTheDocument()
  })

  it('shows the empty running state and stops continuous tasks', async () => {
    const user = userEvent.setup()

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/probes') {
        return {
          probes: [createProbe('p-running', { name: 'Runtime Node', location: 'Madrid' })],
        }
      }
      if (url === '/tasks/task-running') {
        return {
          task: { task_id: 'task-running', status: 'running' },
        }
      }
      if (url === '/results') {
        return {
          results: [],
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })
    apiMock.post.mockResolvedValue({ task_id: 'task-running' })
    apiMock.delete.mockResolvedValue({ success: true })

    renderRoute(<HomePage />, {
      path: '/test',
      route: '/test',
    })

    await user.type(within(screen.getByTestId('home-target')).getByRole('textbox'), 'example.com')
    await user.click(screen.getByTestId('home-start'))

    expect(await screen.findByText('home.noMatchedResults')).toBeInTheDocument()
    expect(screen.getByTestId('home-stop-test')).toBeInTheDocument()

    await user.click(screen.getByTestId('home-stop-test'))
    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith('/tasks/task-running'))
  })

  it('shows an unsupported message when ping probe cannot run automatic mtr', async () => {
    const user = userEvent.setup()

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/probes') {
        return {
          probes: [
            createProbe('p-unsupported', {
              name: 'Legacy Probe',
              location: 'Warsaw',
              capabilities: ['icmp_ping'],
            }),
          ],
        }
      }
      if (url === '/tasks/task-unsupported') {
        return {
          task: { task_id: 'task-unsupported', status: 'completed' },
        }
      }
      if (url === '/results') {
        return {
          results: [
            createResult('p-unsupported', {
              summary: { avg_rtt_ms: 18, min_rtt_ms: 12, max_rtt_ms: 22 },
              result_data: {
                packets_sent: 4,
                packets_received: 4,
                replies: [{ time_ms: 18 }],
              },
            }),
          ],
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })
    apiMock.post.mockResolvedValue({ task_id: 'task-unsupported' })

    renderRoute(<HomePage />, {
      path: '/test',
      route: '/test',
    })

    await user.type(within(screen.getByTestId('home-target')).getByRole('textbox'), 'example.com')
    await user.click(screen.getByTestId('home-start'))

    const resultPanel = await screen.findByTestId('home-results')
    await user.click(within(resultPanel).getByText('Warsaw'))

    expect(await screen.findByText('results.autoMtrUnsupported')).toBeInTheDocument()
  })

  it('does not render http detail blocks for tcp ping results', async () => {
    const user = userEvent.setup()

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/probes') {
        return {
          probes: [
            createProbe('tcp-only', {
              name: 'TCP Probe',
              location: 'Zurich',
              capabilities: ['tcp_ping'],
            }),
          ],
        }
      }
      if (url === '/tasks/task-tcp') {
        return {
          task: { task_id: 'task-tcp', status: 'completed' },
        }
      }
      if (url === '/results') {
        return {
          results: [
            createResult('tcp-only', {
              test_type: 'tcp_ping',
              target: 'example.com:443',
              summary: { avg_connect_time_ms: 12, min_connect_time_ms: 10, max_connect_time_ms: 14 },
              result_data: {
                resolved_ip: '1.1.1.1',
                successful_connections: 1,
                failed_connections: 0,
                attempts: [{ seq: 1, status: 'success', time_ms: 12 }],
              },
            }),
          ],
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })
    apiMock.post.mockResolvedValue({ task_id: 'task-tcp' })

    renderRoute(<HomePage />, {
      path: '/test',
      route: '/test',
    })

    await user.selectOptions(await screen.findByTestId('home-type-select'), 'tcp_ping')
    await user.type(within(screen.getByTestId('home-target')).getByRole('textbox'), 'example.com:443')
    await user.click(screen.getByTestId('home-start'))

    const resultPanel = await screen.findByTestId('home-results')
    await user.click(within(resultPanel).getByText('Zurich'))

    expect(screen.queryByText('results.httpDetail')).not.toBeInTheDocument()
    expect(await screen.findByText('results.autoMtrUnsupported')).toBeInTheDocument()
  })

  it('shows the no-mtr message when automatic mtr finishes without hop data', async () => {
    const user = userEvent.setup()

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/probes') {
        return {
          probes: [
            createProbe('p-nodata', {
              name: 'No Route Probe',
              location: 'Prague',
              capabilities: ['all'],
            }),
          ],
        }
      }
      if (url === '/tasks/task-nodata') {
        return {
          task: { task_id: 'task-nodata', status: 'completed' },
        }
      }
      if (url === '/tasks/task-nodata-mtr') {
        return {
          task: { task_id: 'task-nodata-mtr', status: 'completed' },
          results: [
            createResult('p-nodata', {
              test_type: 'mtr',
              result_data: {
                hops: [],
                total_hops: 0,
                success: false,
              },
            }),
          ],
        }
      }
      if (url === '/results') {
        return {
          results: [
            createResult('p-nodata', {
              summary: { avg_rtt_ms: 25, min_rtt_ms: 20, max_rtt_ms: 30 },
              result_data: {
                packets_sent: 4,
                packets_received: 4,
                replies: [{ time_ms: 25 }],
              },
            }),
          ],
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })
    apiMock.post
      .mockResolvedValueOnce({ task_id: 'task-nodata' })
      .mockResolvedValueOnce({ task_id: 'task-nodata-mtr' })

    renderRoute(<HomePage />, {
      path: '/test',
      route: '/test',
    })

    await user.type(within(screen.getByTestId('home-target')).getByRole('textbox'), 'example.com')
    await user.click(screen.getByTestId('home-start'))

    const resultPanel = await screen.findByTestId('home-results')
    await user.click(within(resultPanel).getByText('Prague'))

    expect(await screen.findByText('results.noMtrData')).toBeInTheDocument()
  })
})
