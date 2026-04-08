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
  const theme = useAppStore(state => state.theme)
  const setTheme = useAppStore(state => state.setTheme)
  const locale = useAppStore(state => state.locale)
  const setStoreLocale = useAppStore(state => state.setLocale)

  const localeItems = useMemo(
    () => [
      { label: t('common.locale.zh'), value: 'zh-CN' as SupportedLocale },
      { label: t('common.locale.en'), value: 'en-US' as SupportedLocale },
    ],
    [t]
  )

  if (location.pathname === '/login') return null

  const isDark = theme === 'dark'

  async function handleLocaleChange(next: SupportedLocale) {
    setStoreLocale(next)
    setLocale(next)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between px-4 md:px-8">
        <button
          type="button"
          className="flex items-center gap-4 rounded-sm px-1 py-1 text-left outline-none"
          onClick={() => navigate('/test')}
        >
          <div>
            <div className="text-sm font-semibold tracking-tight text-[var(--text)]">Atlas</div>
            <div className="text-xs text-[var(--text-2)]">Distributed network tests</div>
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
                  {localeItems.find(item => item.value === locale)?.label || locale}
                </span>
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                sideOffset={8}
                align="end"
                className="z-[70] min-w-40 rounded-sm border border-[var(--border)] bg-[var(--surface)] p-1.5"
              >
                {localeItems.map(item => (
                  <DropdownMenu.Item
                    key={item.value}
                    onClick={() => void handleLocaleChange(item.value)}
                    className={cn(
                      'cursor-pointer rounded-sm px-3 py-2 text-sm text-[var(--text-2)] outline-none hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
                      item.value === locale && 'bg-[var(--accent-weak)] text-[var(--accent)]'
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
