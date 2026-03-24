import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useAppStore } from '@/state/app-store'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (!options) return key

      let output = key
      for (const [name, value] of Object.entries(options)) {
        output = output.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value))
      }
      return output
    },
  }),
  I18nextProvider: ({ children }: { children: ReactNode }) => children,
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
})

Object.defineProperty(navigator, 'clipboard', {
  writable: true,
  configurable: true,
  value: {
    writeText: vi.fn(),
  },
})

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
})

afterEach(() => {
  cleanup()
  useAppStore.setState({
    theme: 'light',
    locale: 'zh-CN',
    toasts: [],
    confirm: {
      open: false,
      message: '',
    },
  })
  window.localStorage.clear()
  vi.clearAllMocks()
})
