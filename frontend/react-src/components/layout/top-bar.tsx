import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Languages, MoonStar, SunMedium } from 'lucide-react'
import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { setLocale, type SupportedLocale } from '@/i18n'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/state/app-store'

export function TopBar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const locale = useAppStore((state) => state.locale)
  const setStoreLocale = useAppStore((state) => state.setLocale)

  const localeItems = useMemo(
    () => [
      { label: t('common.locale.zh'), value: 'zh-CN' as SupportedLocale },
      { label: t('common.locale.en'), value: 'en-US' as SupportedLocale },
    ],
    [t],
  )

  if (location.pathname === '/login') return null

  const isDark = theme === 'dark'

  async function handleLocaleChange(next: SupportedLocale) {
    setStoreLocale(next)
    setLocale(next)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-6">
        <button
          type="button"
          className="flex items-center gap-3 rounded-sm px-2 py-1 text-left outline-none"
          onClick={() => navigate('/test')}
          data-testid="topbar"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-slate-300 bg-white text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
            A
          </span>
          <div>
            <div className="text-sm font-semibold text-slate-950 dark:text-white">Atlas</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Network observability</div>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            title={isDark ? t('home.themeLight') : t('home.themeDark')}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
          >
            {isDark ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
          </Button>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="secondary" size="sm" className="gap-2">
                <Languages className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {localeItems.find((item) => item.value === locale)?.label || locale}
                </span>
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                sideOffset={8}
                align="end"
                className="z-[70] min-w-40 rounded-md border border-slate-300 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-950"
              >
                {localeItems.map((item) => (
                  <DropdownMenu.Item
                    key={item.value}
                    onClick={() => void handleLocaleChange(item.value)}
                    className={cn(
                      'cursor-pointer rounded-md px-3 py-2 text-sm outline-none hover:bg-slate-100 dark:hover:bg-slate-900',
                      item.value === locale && 'bg-slate-100 dark:bg-slate-900',
                    )}
                  >
                    {item.label}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  )
}
