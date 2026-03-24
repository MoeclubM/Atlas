import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { TopBar } from '@/components/layout/top-bar'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ToastRegion } from '@/components/ui/toast-region'
import { setLocale } from '@/i18n'
import { useAppStore } from '@/state/app-store'

const routeTitles: Array<{ match: RegExp; key: string }> = [
  { match: /^\/test/, key: 'route.continuousTest' },
  { match: /^\/admin/, key: 'route.admin' },
  { match: /^\/results\/single\//, key: 'route.singleResult' },
  { match: /^\/results\/continuous\//, key: 'route.continuousResult' },
  { match: /^\/login/, key: 'route.login' },
]

export function AppFrame({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { t } = useTranslation()
  const theme = useAppStore(state => state.theme)
  const locale = useAppStore(state => state.locale)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    setLocale(locale)
  }, [locale])

  useEffect(() => {
    const matched = routeTitles.find(item => item.match.test(location.pathname))
    const title = matched ? t(matched.key) : 'Atlas'
    document.title = `${title} - Atlas`
  }, [location.pathname, t])

  return (
    <div className="min-h-screen text-[var(--text)]">
      <TopBar />
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[1180px] flex-col px-4 pb-10 pt-8 md:px-8">
        {children}
      </div>
      <ToastRegion />
      <ConfirmDialog />
    </div>
  )
}
