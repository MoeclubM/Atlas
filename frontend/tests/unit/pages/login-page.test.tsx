import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from '@/pages/login-page'
import { useAppStore } from '@/state/app-store'
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

describe('LoginPage', () => {
  beforeEach(() => {
    apiMock.get.mockReset()
    apiMock.post.mockReset()
    apiMock.put.mockReset()
    apiMock.delete.mockReset()
    apiMock.patch.mockReset()
    apiMock.request.mockReset()
  })

  it('redirects to admin when already authenticated', async () => {
    window.localStorage.setItem('admin_token', 'session-token')

    renderRoute(<LoginPage />, {
      path: '/login',
      route: '/login',
    })

    expect(await screen.findByTestId('route-admin')).toBeInTheDocument()
  })

  it('submits password, persists token and navigates on success', async () => {
    const user = userEvent.setup()
    apiMock.post.mockResolvedValue({
      success: true,
      token: 'jwt-token',
    })

    renderRoute(<LoginPage />, {
      path: '/login',
      route: '/login',
    })

    await user.type(within(screen.getByTestId('login-password')).getByLabelText('login.password'), 'atlas-admin')
    await user.click(screen.getByTestId('login-submit'))

    await screen.findByTestId('route-admin')

    expect(apiMock.post).toHaveBeenCalledWith('/admin/login', {
      password: 'atlas-admin',
    })
    expect(window.localStorage.getItem('admin_token')).toBe('jwt-token')
    expect(getLastToast()).toMatchObject({
      message: 'login.loginSuccess',
      type: 'success',
    })
  })

  it('shows validation and request errors for invalid login attempts', async () => {
    const user = userEvent.setup()
    apiMock.post.mockRejectedValue(new Error('network failed'))

    renderRoute(<LoginPage />, {
      path: '/login',
      route: '/login',
    })

    await user.click(screen.getByTestId('login-submit'))
    expect(await screen.findByText('login.passwordRequired')).toBeInTheDocument()
    expect(apiMock.post).not.toHaveBeenCalled()

    await user.type(within(screen.getByTestId('login-password')).getByLabelText('login.password'), 'wrong-password')
    await user.click(screen.getByTestId('login-submit'))

    await waitFor(() =>
      expect(getLastToast()).toMatchObject({
        message: 'login.loginFailed',
        type: 'error',
      }),
    )
  })

  it('shows the server-side wrong-password message when login is rejected normally', async () => {
    const user = userEvent.setup()
    apiMock.post.mockResolvedValue({
      success: false,
      error: 'wrong-password',
    })

    renderRoute(<LoginPage />, {
      path: '/login',
      route: '/login',
    })

    await user.type(within(screen.getByTestId('login-password')).getByLabelText('login.password'), 'wrong-password')
    await user.click(screen.getByTestId('login-submit'))

    await waitFor(() =>
      expect(getLastToast()).toMatchObject({
        message: 'wrong-password',
        type: 'error',
      }),
    )
  })
})
