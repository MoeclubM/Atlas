import { expect, type APIRequestContext, type Page } from '@playwright/test'

export async function useEnglishLocale(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('atlas_locale', 'en-US')
  })
}

export async function waitForAtlasReady(request: APIRequestContext) {
  let lastError = 'unknown readiness failure'

  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const health = await request.get('/api/health')
      if (!health.ok()) {
        lastError = `/api/health returned ${health.status()}`
        await delay(1000)
        continue
      }

      const probes = await request.get('/api/probes')
      if (!probes.ok()) {
        lastError = `/api/probes returned ${probes.status()}`
        await delay(1000)
        continue
      }

      const payload = (await probes.json()) as {
        probes?: Array<{
          status?: string
          capabilities?: unknown
        }>
      }

      const hasOnlineMTRProbe = (payload.probes || []).some(probe => {
        const capabilities = normalizeCapabilities(probe.capabilities)
        return probe.status === 'online' && capabilities.includes('mtr')
      })

      if (hasOnlineMTRProbe) return

      lastError = 'no online probe with mtr capability'
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }

    await delay(1000)
  }

  throw new Error(`Atlas readiness check failed: ${lastError}`)
}

export async function expectSnackbar(page: Page, message: string) {
  const snackbar = page.getByTestId('ui-snackbar').filter({ hasText: message }).last()
  await expect(snackbar).toContainText(message)
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeCapabilities(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string')
      }
    } catch {
      return []
    }
  }

  return []
}
