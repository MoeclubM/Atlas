import { create } from 'zustand'
import {
  ADMIN_TOKEN_KEY,
  getInitialLocale,
  getInitialTheme,
  LOCALE_KEY,
  THEME_KEY,
  type SupportedLocale,
  type ThemeMode,
  removeStorage,
  writeStorage,
} from '@/lib/storage'

export type NotifyType = 'success' | 'info' | 'warning' | 'error'

export type ToastItem = {
  id: number
  message: string
  type: NotifyType
}

type ConfirmState = {
  open: boolean
  title?: string
  message: string
  resolver?: (value: boolean) => void
}

type AppState = {
  theme: ThemeMode
  locale: SupportedLocale
  toasts: ToastItem[]
  confirm: ConfirmState
  setTheme: (theme: ThemeMode) => void
  setLocale: (locale: SupportedLocale) => void
  notify: (message: string, type?: NotifyType) => void
  dismissToast: (id: number) => void
  confirmAction: (message: string, options?: { title?: string }) => Promise<boolean>
  resolveConfirm: (value: boolean) => void
  clearAdminToken: () => void
}

let toastSeq = 1

export const useAppStore = create<AppState>((set, get) => ({
  theme: getInitialTheme(),
  locale: getInitialLocale(),
  toasts: [],
  confirm: {
    open: false,
    message: '',
  },
  setTheme: (theme) => {
    writeStorage(THEME_KEY, theme)
    set({ theme })
  },
  setLocale: (locale) => {
    writeStorage(LOCALE_KEY, locale)
    set({ locale })
  },
  notify: (message, type = 'info') => {
    const item: ToastItem = { id: toastSeq++, message, type }
    set((state) => ({ toasts: [...state.toasts, item] }))
  },
  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  },
  confirmAction: (message, options) =>
    new Promise<boolean>((resolve) => {
      set({
        confirm: {
          open: true,
          title: options?.title,
          message,
          resolver: resolve,
        },
      })
    }),
  resolveConfirm: (value) => {
    const current = get().confirm
    current.resolver?.(value)
    set({
      confirm: {
        open: false,
        message: '',
      },
    })
  },
  clearAdminToken: () => {
    removeStorage(ADMIN_TOKEN_KEY)
  },
}))
