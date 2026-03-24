import { beforeEach, describe, expect, it, vi } from 'vitest'

const axiosMock = vi.hoisted(() => {
  class AxiosHeadersMock {
    set = vi.fn()
  }

  const requestInterceptor = {
    fulfilled: undefined as ((config: Record<string, unknown>) => Record<string, unknown>) | undefined,
    rejected: undefined as ((error: unknown) => Promise<unknown>) | undefined,
  }
  const responseInterceptor = {
    fulfilled: undefined as ((response: { data: unknown }) => unknown) | undefined,
    rejected: undefined as ((error: unknown) => Promise<unknown>) | undefined,
  }
  const instance = {
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn((fulfilled, rejected) => {
          requestInterceptor.fulfilled = fulfilled
          requestInterceptor.rejected = rejected
          return 0
        }),
      },
      response: {
        use: vi.fn((fulfilled, rejected) => {
          responseInterceptor.fulfilled = fulfilled
          responseInterceptor.rejected = rejected
          return 0
        }),
      },
    },
  }

  return {
    AxiosHeadersMock,
    create: vi.fn(() => instance),
    instance,
    requestInterceptor,
    responseInterceptor,
  }
})

const storageMock = vi.hoisted(() => ({
  getAdminToken: vi.fn(),
}))

const appStoreMock = vi.hoisted(() => {
  const notify = vi.fn()
  return {
    notify,
    getState: vi.fn(() => ({
      notify,
    })),
  }
})

vi.mock('axios', () => ({
  default: {
    create: axiosMock.create,
  },
  AxiosHeaders: axiosMock.AxiosHeadersMock,
}))

vi.mock('@/lib/storage', () => ({
  getAdminToken: storageMock.getAdminToken,
}))

vi.mock('@/state/app-store', () => ({
  useAppStore: {
    getState: appStoreMock.getState,
  },
}))

import client from '@/lib/api-client'

describe('api client', () => {
  beforeEach(() => {
    storageMock.getAdminToken.mockReset()
    appStoreMock.notify.mockReset()
    appStoreMock.getState.mockClear()
    axiosMock.instance.request.mockReset()
    axiosMock.instance.get.mockReset()
    axiosMock.instance.post.mockReset()
    axiosMock.instance.put.mockReset()
    axiosMock.instance.delete.mockReset()
    axiosMock.instance.patch.mockReset()
  })

  it('configures axios with base defaults and injects auth headers when a token exists', async () => {
    expect(axiosMock.create).toHaveBeenCalledWith({
      baseURL: '/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    storageMock.getAdminToken.mockReturnValue('admin-token')

    const config = await axiosMock.requestInterceptor.fulfilled?.({})
    expect(config?.headers).toBeInstanceOf(axiosMock.AxiosHeadersMock)
    expect((config?.headers as InstanceType<typeof axiosMock.AxiosHeadersMock>).set).toHaveBeenCalledWith(
      'Authorization',
      'Bearer admin-token',
    )
  })

  it('leaves headers untouched without a token and propagates request interceptor errors', async () => {
    storageMock.getAdminToken.mockReturnValue(null)
    const headers = new axiosMock.AxiosHeadersMock()

    const config = await axiosMock.requestInterceptor.fulfilled?.({ headers })
    expect(config?.headers).toBe(headers)
    expect(headers.set).not.toHaveBeenCalled()

    const error = new Error('request failed')
    await expect(axiosMock.requestInterceptor.rejected?.(error)).rejects.toBe(error)
  })

  it('unwraps successful responses and reports response failures with fallback messages', async () => {
    expect(axiosMock.responseInterceptor.fulfilled?.({ data: { ok: true } })).toEqual({ ok: true })

    const apiError = { response: { data: { error: 'denied' } } }
    await expect(axiosMock.responseInterceptor.rejected?.(apiError)).rejects.toBe(apiError)
    expect(appStoreMock.notify).toHaveBeenCalledWith('denied', 'error')

    appStoreMock.notify.mockClear()
    const networkError = { message: 'timeout' }
    await expect(axiosMock.responseInterceptor.rejected?.(networkError)).rejects.toBe(networkError)
    expect(appStoreMock.notify).toHaveBeenCalledWith('timeout', 'error')

    appStoreMock.notify.mockClear()
    const unknownError = {}
    await expect(axiosMock.responseInterceptor.rejected?.(unknownError)).rejects.toBe(unknownError)
    expect(appStoreMock.notify).toHaveBeenCalledWith('errors.requestFailed', 'error')
  })

  it('delegates request helpers to the axios instance methods', async () => {
    axiosMock.instance.request.mockResolvedValueOnce({ ok: 'direct' })
    axiosMock.instance.request.mockResolvedValueOnce({ ok: 'request' })
    axiosMock.instance.get.mockResolvedValueOnce({ ok: 'get' })
    axiosMock.instance.post.mockResolvedValueOnce({ ok: 'post' })
    axiosMock.instance.put.mockResolvedValueOnce({ ok: 'put' })
    axiosMock.instance.delete.mockResolvedValueOnce({ ok: 'delete' })
    axiosMock.instance.patch.mockResolvedValueOnce({ ok: 'patch' })

    await expect(client({ url: '/health' })).resolves.toEqual({ ok: 'direct' })
    await expect(client.request({ url: '/tasks' })).resolves.toEqual({ ok: 'request' })
    await expect(client.get('/probes', { params: { status: 'online' } })).resolves.toEqual({ ok: 'get' })
    await expect(client.post('/tasks', { target: 'example.com' })).resolves.toEqual({ ok: 'post' })
    await expect(client.put('/admin/config', { ping_max_runs: 100 })).resolves.toEqual({ ok: 'put' })
    await expect(client.delete('/tasks/1')).resolves.toEqual({ ok: 'delete' })
    await expect(client.patch('/tasks/1', { status: 'cancelled' })).resolves.toEqual({ ok: 'patch' })

    expect(axiosMock.instance.request).toHaveBeenNthCalledWith(1, { url: '/health' })
    expect(axiosMock.instance.request).toHaveBeenNthCalledWith(2, { url: '/tasks' })
    expect(axiosMock.instance.get).toHaveBeenCalledWith('/probes', { params: { status: 'online' } })
    expect(axiosMock.instance.post).toHaveBeenCalledWith('/tasks', { target: 'example.com' }, undefined)
    expect(axiosMock.instance.put).toHaveBeenCalledWith('/admin/config', { ping_max_runs: 100 }, undefined)
    expect(axiosMock.instance.delete).toHaveBeenCalledWith('/tasks/1', undefined)
    expect(axiosMock.instance.patch).toHaveBeenCalledWith('/tasks/1', { status: 'cancelled' }, undefined)
  })
})
