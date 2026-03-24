import { expect, test } from '@playwright/test'
import { expectSnackbar, useEnglishLocale, waitForAtlasReady } from './helpers'

const adminPassword = process.env.ATLAS_ADMIN_PASSWORD || 'atlas-admin'

test('logs in and saves mtr timeout config', async ({ page, request }) => {
  await waitForAtlasReady(request)
  await useEnglishLocale(page)

  await page.goto('/login')
  await page.getByTestId('login-password').locator('input').fill(adminPassword)
  await page.getByTestId('login-submit').click()

  await expect(page).toHaveURL(/\/admin$/)
  await expectSnackbar(page, 'Login success')

  await page.getByTestId('admin-tab-test').click()

  const mtrTimeoutInput = page.getByTestId('admin-mtr-timeout').locator('input')
  await expect(mtrTimeoutInput).toBeVisible()
  await mtrTimeoutInput.fill('61')
  await page.getByTestId('admin-save-test-config').click()

  await expectSnackbar(page, 'Saved')
  await expect(mtrTimeoutInput).toHaveValue('61')
})
