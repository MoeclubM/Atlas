import { expect, test } from '@playwright/test'
import { expectSnackbar, useEnglishLocale, waitForAtlasReady } from './helpers'

const adminPassword = process.env.ATLAS_ADMIN_PASSWORD || 'atlas-admin'

test('logs in and saves mtr timeout config', async ({ page, request }) => {
  await waitForAtlasReady(request)
  await useEnglishLocale(page)

  await page.goto('/login')
  await page.getByLabel('Password').fill(adminPassword)
  await page.getByRole('button', { name: 'Login' }).click()

  await expect(page).toHaveURL(/\/admin$/)
  await expectSnackbar(page, 'Login success')

  await page.getByRole('tab', { name: 'Test params' }).click()

  const mtrTimeoutInput = page.getByRole('spinbutton', { name: 'MTR timeout (s)' })
  await expect(mtrTimeoutInput).toBeVisible()
  await mtrTimeoutInput.fill('61')
  await page.getByRole('button', { name: 'Save' }).click()

  await expectSnackbar(page, 'Saved')
  await expect(mtrTimeoutInput).toHaveValue('61')
})
