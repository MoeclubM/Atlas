import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'
import { getInitialLocale, LOCALE_KEY, type SupportedLocale, writeStorage } from '@/lib/storage'

export type { SupportedLocale } from '@/lib/storage'

const resources = {
  'zh-CN': { translation: zhCN },
  'en-US': { translation: enUS },
} as const

void i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLocale(),
  fallbackLng: 'zh-CN',
  interpolation: {
    escapeValue: false,
  },
})

export function setLocale(locale: SupportedLocale) {
  void i18n.changeLanguage(locale)
  writeStorage(LOCALE_KEY, locale)
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
}

export default i18n
