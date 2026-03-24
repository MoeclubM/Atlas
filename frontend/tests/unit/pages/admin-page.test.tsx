import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminPage } from '@/pages/admin-page'
import { useAppStore } from '@/state/app-store'
import type { ProbeRecord } from '@/lib/domain'
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

function getLastToast() {
  const { toasts } = useAppStore.getState()
  return toasts[toasts.length - 1]
}

function createProbe(probeId: string, overrides: Partial<ProbeRecord> = {}): ProbeRecord {
  return {
    probe_id: probeId,
    name: `${probeId}-node`,
    location: `${probeId}-location`,
    status: 'online',
    ip_address: '1.1.1.1',
    upgrade_supported: true,
    deploy_mode: 'systemd',
    upgrade_channel: 'queue_dir',
    metadata: {
      provider: `${probeId}-isp`,
      version: 'v1.0.0',
    },
    ...overrides,
  }
}

describe('AdminPage', () => {
  beforeEach(() => {
    apiMock.get.mockReset()
    apiMock.post.mockReset()
    apiMock.put.mockReset()
    apiMock.delete.mockReset()
    apiMock.patch.mockReset()
    apiMock.request.mockReset()
    globalThis.prompt = vi.fn(() => 'v2.0.0')
  })

  it('redirects to login when there is no admin session', async () => {
    renderRoute(<AdminPage />, {
      path: '/admin',
      route: '/admin',
    })

    expect(await screen.findByTestId('route-login')).toBeInTheDocument()
  })

  it('updates nodes, queues upgrades, saves config and handles utility actions', async () => {
    const user = userEvent.setup()
    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText')
    const confirmAction = vi.fn().mockResolvedValue(true)
    useAppStore.setState({ confirmAction })
    window.localStorage.setItem('admin_token', 'session-token')

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/admin/probes') {
        return {
          probes: [
            createProbe('p1', {
              name: 'Tokyo Node',
              location: 'Tokyo',
              latest_upgrade: {
                upgrade_id: 'u-1',
                target_version: 'v1.1.0',
                status: 'failed',
                error_message: 'boom',
              },
            }),
            createProbe('p2', {
              name: 'Queue Node',
              location: 'Paris',
              latest_upgrade: {
                upgrade_id: 'u-queued',
                target_version: 'v1.2.0',
                status: 'queued',
              },
            }),
            createProbe('p3', {
              name: 'Applied Node',
              location: 'Chicago',
              latest_upgrade: {
                upgrade_id: 'u-applied',
                target_version: 'v1.3.0',
                status: 'applied',
              },
            }),
            createProbe('p4', {
              name: 'Accepted Node',
              location: 'Toronto',
              latest_upgrade: {
                upgrade_id: 'u-accepted',
                target_version: 'v1.4.0',
                status: 'accepted',
              },
            }),
            createProbe('p5', {
              name: 'Unknown Status Node',
              location: 'Lab',
              latest_upgrade: {
                upgrade_id: 'u-unknown',
                target_version: 'v1.5.0',
                status: 'mystery',
              },
            }),
            createProbe('p6', {
              name: 'Dev Node',
              location: 'Test Rack',
              upgrade_supported: false,
              upgrade_reason: 'no systemd',
              metadata: {
                provider: 'lab-isp',
                version: 'v0.9.0',
              },
            }),
          ],
        }
      }
      if (url === '/admin/config') {
        return {
          shared_secret: 'secret-1',
          blocked_networks: '10.0.0.0/8',
          ping_max_runs: '100',
          tcp_ping_max_runs: '100',
          traceroute_timeout_seconds: '60',
          mtr_timeout_seconds: '60',
        }
      }
      if (url === '/admin/generate-secret') {
        return {
          shared_secret: 'secret-2',
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })
    apiMock.put.mockResolvedValue({ success: true })
    apiMock.post.mockResolvedValue({
      upgrade: {
        upgrade_id: 'u-2',
        target_version: 'v2.0.0',
        status: 'queued',
      },
    })
    apiMock.delete.mockResolvedValue({ success: true })

    renderRoute(<AdminPage />, {
      path: '/admin',
      route: '/admin',
    })

    expect(await screen.findByText('Tokyo Node')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
    expect(screen.getByText('admin.upgradeStates.applied')).toBeInTheDocument()
    expect(screen.getByText('admin.upgradeStates.accepted')).toBeInTheDocument()
    expect(screen.getByText('admin.upgradeStates.mystery')).toBeInTheDocument()
    expect(screen.getByText('no systemd')).toBeInTheDocument()
    expect(screen.getAllByText('admin.upgrade')[1]).toBeDisabled()

    const nameInputs = screen.getAllByLabelText('admin.nodeName')
    await user.clear(nameInputs[0])
    await user.type(nameInputs[0], 'Tokyo Edge')
    await user.click(screen.getAllByText('common.save')[0])

    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith('/admin/probes/p1', {
        name: 'Tokyo Edge',
      })
    )

    await user.click(screen.getAllByText('admin.upgrade')[0])
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/admin/probes/p1/upgrade', {
        version: 'v2.0.0',
      })
    )
    expect(confirmAction).toHaveBeenCalled()

    await user.click(screen.getAllByText('admin.delete')[0])
    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith('/admin/probes/p1'))

    await user.click(screen.getByTestId('admin-tab-keys'))
    await user.click(screen.getByText('admin.generate'))
    await waitFor(() => expect(screen.getByDisplayValue('secret-2')).toBeInTheDocument())
    await user.click(screen.getByText('admin.copyAddress'))
    expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining('ws://'))

    await user.click(screen.getByTestId('admin-tab-test'))
    const mtrTimeoutInput = within(screen.getByTestId('admin-mtr-timeout')).getByRole('spinbutton')
    await user.clear(mtrTimeoutInput)
    await user.type(mtrTimeoutInput, '75')
    await user.click(screen.getByTestId('admin-save-test-config'))

    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith('/admin/config', {
        shared_secret: 'secret-2',
        blocked_networks: '10.0.0.0/8',
        ping_max_runs: 100,
        tcp_ping_max_runs: 100,
        traceroute_timeout_seconds: 60,
        mtr_timeout_seconds: 75,
      })
    )

    await user.click(screen.getByText('admin.logout'))
    expect(await screen.findByTestId('route-login')).toBeInTheDocument()
  })

  it('skips upgrade and delete actions when prompt or confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const confirmAction = vi.fn().mockResolvedValue(false)
    useAppStore.setState({ confirmAction })
    window.localStorage.setItem('admin_token', 'session-token')

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/admin/probes') {
        return {
          probes: [
            createProbe('p1', {
              name: 'Cancel Node',
              location: 'Rome',
            }),
          ],
        }
      }
      if (url === '/admin/config') {
        return {
          shared_secret: 'secret-1',
          blocked_networks: '',
          ping_max_runs: '100',
          tcp_ping_max_runs: '100',
          traceroute_timeout_seconds: '60',
          mtr_timeout_seconds: '60',
        }
      }
      throw new Error(`unexpected GET ${url}`)
    })

    globalThis.prompt = vi.fn(() => null)

    renderRoute(<AdminPage />, {
      path: '/admin',
      route: '/admin',
    })

    expect(await screen.findByText('Cancel Node')).toBeInTheDocument()

    await user.click(screen.getByText('admin.upgrade'))
    expect(apiMock.post).not.toHaveBeenCalled()

    globalThis.prompt = vi.fn(() => '')
    await user.click(screen.getByText('admin.upgrade'))
    expect(confirmAction).toHaveBeenCalled()
    expect(apiMock.post).not.toHaveBeenCalled()

    await user.click(screen.getByText('admin.delete'))
    expect(apiMock.delete).not.toHaveBeenCalled()
  })

  it('shows error notifications when admin mutations fail', async () => {
    const user = userEvent.setup()
    const confirmAction = vi.fn().mockResolvedValue(true)
    useAppStore.setState({ confirmAction })
    window.localStorage.setItem('admin_token', 'session-token')

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/admin/probes') {
        return {
          probes: [
            createProbe('p1', {
              name: 'Error Node',
              location: 'Milan',
            }),
          ],
        }
      }
      if (url === '/admin/config') {
        return {
          shared_secret: 'secret-1',
          blocked_networks: '',
          ping_max_runs: '100',
          tcp_ping_max_runs: '100',
          traceroute_timeout_seconds: '60',
          mtr_timeout_seconds: '60',
        }
      }
      if (url === '/admin/generate-secret') {
        throw new Error('generate failed')
      }
      throw new Error(`unexpected GET ${url}`)
    })
    apiMock.put.mockImplementation(async (url: string) => {
      if (url === '/admin/probes/p1') throw new Error('update failed')
      if (url === '/admin/config') throw new Error('save failed')
      return { success: true }
    })
    apiMock.post.mockRejectedValue(new Error('upgrade failed'))
    apiMock.delete.mockRejectedValue(new Error('delete failed'))

    renderRoute(<AdminPage />, {
      path: '/admin',
      route: '/admin',
    })

    expect(await screen.findByText('Error Node')).toBeInTheDocument()

    await user.click(screen.getByText('common.save'))
    await waitFor(() =>
      expect(getLastToast()).toMatchObject({
        message: 'admin.updateFailed',
        type: 'error',
      })
    )

    await user.click(screen.getByText('admin.upgrade'))
    await waitFor(() =>
      expect(getLastToast()).toMatchObject({
        message: 'admin.upgradeFailed',
        type: 'error',
      })
    )

    await user.click(screen.getByText('admin.delete'))
    await waitFor(() =>
      expect(getLastToast()).toMatchObject({
        message: 'admin.deleteFailed',
        type: 'error',
      })
    )

    await user.click(screen.getByTestId('admin-tab-keys'))
    await user.click(screen.getByText('admin.generate'))
    await waitFor(() =>
      expect(getLastToast()).toMatchObject({
        message: 'admin.generateFailed',
        type: 'error',
      })
    )

    await user.click(screen.getAllByText('common.save')[0])
    await waitFor(() =>
      expect(getLastToast()).toMatchObject({
        message: 'admin.saveFailed',
        type: 'error',
      })
    )
  })
})
