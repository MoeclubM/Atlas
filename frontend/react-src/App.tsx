import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useMemo } from 'react'
import { I18nextProvider } from 'react-i18next'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppFrame } from '@/components/layout/app-frame'
import i18n from '@/i18n'

const HomePage = lazy(async () =>
  import('@/pages/home-page').then(module => ({ default: module.HomePage }))
)
const AdminPage = lazy(async () =>
  import('@/pages/admin-page').then(module => ({ default: module.AdminPage }))
)
const LoginPage = lazy(async () =>
  import('@/pages/login-page').then(module => ({ default: module.LoginPage }))
)
const SingleResultPage = lazy(async () =>
  import('@/pages/single-result-page').then(module => ({ default: module.SingleResultPage }))
)

export default function App() {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
    []
  )

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <BrowserRouter>
          <AppFrame>
            <Suspense
              fallback={<div className="py-16 text-center text-sm text-slate-500">Loading…</div>}
            >
              <Routes>
                <Route path="/" element={<Navigate to="/test" replace />} />
                <Route path="/test" element={<HomePage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/results/single/:id" element={<SingleResultPage />} />
                <Route path="*" element={<Navigate to="/test" replace />} />
              </Routes>
            </Suspense>
          </AppFrame>
        </BrowserRouter>
      </I18nextProvider>
    </QueryClientProvider>
  )
}
