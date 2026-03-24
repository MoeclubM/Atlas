export type SupportedLocale = 'zh-CN' | 'en-US'
export type ThemeMode = 'light' | 'dark'

export const ADMIN_TOKEN_KEY = 'admin_token'
export const LOCALE_KEY = 'atlas_locale'
export const THEME_KEY = 'atlas_theme'

export function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

export function removeStorage(key: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  if (value === 'en' || value === 'en-US') return 'en-US'
  return 'zh-CN'
}

export function getInitialLocale(): SupportedLocale {
  const saved = readStorage(LOCALE_KEY)
  if (saved) return normalizeLocale(saved)
  if (typeof navigator !== 'undefined') {
    return normalizeLocale(navigator.language)
  }
  return 'zh-CN'
}

export function getInitialTheme(): ThemeMode {
  const saved = readStorage(THEME_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

export function getAdminToken(): string | null {
  return readStorage(ADMIN_TOKEN_KEY)
}
