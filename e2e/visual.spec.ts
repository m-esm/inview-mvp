import { expect, test, type Page } from '@playwright/test'

const pages = [
  { path: '/g/o-gallery', name: 'welcome' },
  { path: '/g/o-gallery/works', name: 'works' },
  { path: '/g/o-gallery/prices', name: 'prices' },
  { path: '/g/o-gallery/about', name: 'about' },
  { path: '/dashboard/o-gallery', name: 'dashboard-login' },
] as const

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const

const langs = ['fa', 'en'] as const

async function seedLang(page: Page, lang: 'fa' | 'en') {
  await page.addInitScript((l) => {
    try {
        localStorage.setItem(
        'inview-demo-v1',
        JSON.stringify({
          lang: l,
          langChosen: true,
          phone: null,
          saved: [],
          follows: [],
          stamps: [],
        }),
      )
    } catch {
      /* ignore */
    }
  }, lang)
}

test.describe('visual', () => {
  for (const vp of viewports) {
    for (const lang of langs) {
      for (const route of pages) {
        test(`${route.name} ${vp.name} ${lang}`, async ({ page }) => {
          await page.setViewportSize({ width: vp.width, height: vp.height })
          await seedLang(page, lang)
          await page.goto(route.path, { waitUntil: 'load' })
          // Let the ink-rule and reveal settle once.
          await page.waitForTimeout(600)
          await expect(page.locator('body')).toBeVisible()
          await expect(page).toHaveScreenshot(`${route.name}-${vp.name}-${lang}.png`, {
            animations: 'disabled',
            fullPage: false,
            maxDiffPixelRatio: 0.03,
          })
        })
      }
    }
  }
})
