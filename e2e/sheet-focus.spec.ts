import { expect, test } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000'

// The heart buttons come from the demo gallery's static catalogue, so this spec seeds nothing.
const worksPath = '/g/rooz-gallery/works'
const heartName = 'Save: Hamid Emami'

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'inview-lang', value: 'en', url: baseURL }])
  await page.goto(worksPath)
})

test('Escape on the sign-in sheet returns focus to the heart button that opened it', async ({ page }) => {
  const heart = page.getByRole('button', { name: heartName, exact: true })
  await heart.click()

  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(page.getByLabel('Mobile number', { exact: true })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(heart).toBeFocused()
})

test('Not now on the sign-in sheet returns focus to the heart button that opened it', async ({ page }) => {
  const heart = page.getByRole('button', { name: heartName, exact: true })
  await heart.click()

  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Not now', exact: true }).click()

  await expect(sheet).toHaveCount(0)
  await expect(heart).toBeFocused()
})
