import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

type RenderRouteOptions = {
  path?: string
  route?: string
  renderOptions?: Omit<RenderOptions, 'wrapper'>
}

export function renderRoute(
  ui: ReactElement,
  {
    path = '/',
    route = path,
    renderOptions,
  }: RenderRouteOptions = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path={path} element={children} />
            <Route path="/admin" element={<div data-testid="route-admin">admin</div>} />
            <Route path="/login" element={<div data-testid="route-login">login</div>} />
            <Route path="/test" element={<div data-testid="route-test">test</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  return render(ui, {
    wrapper: Wrapper,
    ...renderOptions,
  })
}
