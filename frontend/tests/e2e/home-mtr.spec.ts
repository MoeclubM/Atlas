import { expect, test } from '@playwright/test'
import { useEnglishLocale, waitForAtlasReady } from './helpers'

test('creates an mtr task and renders hop details', async ({ page, request }) => {
  await waitForAtlasReady(request)
  await useEnglishLocale(page)

  await page.goto('/test')

  await page.getByTestId('home-type-select').click()
  await page.getByTestId('home-type-option-mtr').click()
  await page.getByTestId('home-target').locator('input').fill('1.1.1.1')
  await page.getByTestId('home-start').click()

  await expect(page.getByTestId('home-results')).toBeVisible()

  const row = page.getByTestId('home-result-row').first()
  await expect(row).toBeVisible({ timeout: 90_000 })
  await row.click()

  await expect(page.getByTestId('home-mtr-detail').first()).toBeVisible()
  await expect(page.getByTestId('home-mtr-hop-row').first()).toBeVisible()
})
