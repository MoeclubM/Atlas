import { expect, test } from '@playwright/test'
import { useEnglishLocale, waitForAtlasReady } from './helpers'

test('creates an mtr task and renders hop details', async ({ page, request }) => {
  await waitForAtlasReady(request)
  await useEnglishLocale(page)

  await page.goto('/test')

  await page.getByRole('combobox', { name: 'Type' }).click()
  await page.getByRole('option', { name: 'MTR' }).click()
  await page.getByRole('textbox', { name: 'Enter target' }).fill('1.1.1.1')
  await page.getByRole('button', { name: 'Start Test' }).click()

  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible()

  const row = page.locator('table tbody tr').first()
  await expect(row).toBeVisible({ timeout: 90_000 })
  await row.click()

  await expect(page.getByText('MTR details').first()).toBeVisible()
  await expect(page.locator('table').nth(1).locator('tbody tr').first()).toBeVisible()
})
