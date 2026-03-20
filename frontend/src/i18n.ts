import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

export type SupportedLocale = 'zh-CN' | 'en-US'

const STORAGE_KEY = 'atlas_locale'

function normalizeLocale(value: string | null | undefined): SupportedLocale {
  if (value === 'en' || value === 'en-US') return 'en-US'
  return 'zh-CN'
}

export function getInitialLocale(): SupportedLocale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved) return normalizeLocale(saved)
  } catch {
    // ignore
  }

  const nav = typeof navigator !== 'undefined' ? navigator.language : 'zh-CN'
  return normalizeLocale(nav)
}

export async function setLocale(locale: SupportedLocale) {
  if (i18n.global.locale.value !== locale) {
    i18n.global.locale.value = locale as any
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // ignore
  }

  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: getInitialLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  } as Record<SupportedLocale, any>,
})
