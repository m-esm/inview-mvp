import { expect, test } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000'
const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const

for (const viewport of viewports) {
  for (const lang of ['fa', 'en'] as const) {
    test(`landing layout and language controls ${viewport.name} ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.context().addCookies([{ name: 'inview-lang', value: lang, url: baseURL }])
      await page.goto('/', { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      await expect(page.locator('.landing')).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', lang)

      const dimensions = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        controls: Array.from(document.querySelectorAll('.landing a, .landing button'), (element) => {
          const { width, height } = element.getBoundingClientRect()
          return { text: element.textContent, width, height }
        }),
        paragraphs: Array.from(document.querySelectorAll('.landing p'), (element) => ({
          text: element.textContent,
          size: Number.parseFloat(getComputedStyle(element).fontSize),
        })),
      }))
      expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
      expect(dimensions.controls.length).toBeGreaterThan(0)
      for (const control of dimensions.controls) {
        expect(control.width, control.text || 'control width').toBeGreaterThanOrEqual(44)
        expect(control.height, control.text || 'control height').toBeGreaterThanOrEqual(44)
      }
      expect(dimensions.paragraphs.length).toBeGreaterThan(0)
      for (const paragraph of dimensions.paragraphs) {
        expect(paragraph.size, paragraph.text || 'paragraph size').toBeGreaterThanOrEqual(15)
      }
      await expect(page.locator('.landing-actions a[href="#contact"]')).toHaveCount(0)
      await expect(page.locator('.landing-pilot')).toHaveCount(1)
      await expect(page.locator('.landing-phone img')).toHaveAttribute('src', '/landing/work.png')

      const next = lang === 'fa' ? 'en' : 'fa'
      await page.locator('.landing-header').getByRole('button', { name: next === 'fa' ? 'فارسی' : 'English', exact: true }).click()
      await expect(page.locator('html')).toHaveAttribute('lang', next)
      await expect(page.locator('.landing-footer').getByRole('button', { name: next === 'fa' ? 'فارسی' : 'English', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await page.locator('.landing-footer').getByRole('button', { name: lang === 'fa' ? 'فارسی' : 'English', exact: true }).click()
      await expect(page.locator('html')).toHaveAttribute('lang', lang)
      await expect(page.locator('.landing-header').getByRole('button', { name: lang === 'fa' ? 'فارسی' : 'English', exact: true })).toHaveAttribute('aria-pressed', 'true')
    })
  }
}
