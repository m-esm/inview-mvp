import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const catalogue = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/o-gallery-catalogue.json'), 'utf8'),
) as unknown

const emptyPages = [
  { path: '/g/o-gallery', name: 'welcome' },
  { path: '/g/o-gallery/works', name: 'works' },
  { path: '/g/o-gallery/prices', name: 'prices' },
  { path: '/g/o-gallery/about', name: 'about' },
  { path: '/dashboard/o-gallery', name: 'dashboard-login' },
] as const

const filledPages = [
  { path: '/g/o-gallery', name: 'welcome-filled' },
  { path: '/g/o-gallery/works', name: 'works-filled' },
  { path: '/g/o-gallery/prices', name: 'prices-filled' },
  { path: '/g/o-gallery/works/vis-work-01', name: 'work-detail' },
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

async function mockCatalogue(page: Page) {
  await page.route('**/api/pilot**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(catalogue),
    })
  })
}

async function shot(page: Page, name: string, vp: (typeof viewports)[number], lang: (typeof langs)[number]) {
  await page.waitForTimeout(600)
  await expect(page.locator('body')).toBeVisible()
  await expect(page).toHaveScreenshot(`${name}-${vp.name}-${lang}.png`, {
    animations: 'disabled',
    fullPage: false,
    maxDiffPixelRatio: 0.03,
  })
}

test.describe('visual empty', () => {
  for (const vp of viewports) {
    for (const lang of langs) {
      for (const route of emptyPages) {
        test(`${route.name} ${vp.name} ${lang}`, async ({ page }) => {
          await page.setViewportSize({ width: vp.width, height: vp.height })
          await seedLang(page, lang)
          await page.goto(route.path, { waitUntil: 'load' })
          await shot(page, route.name, vp, lang)
        })
      }
    }
  }
})

test.describe('visual filled', () => {
  for (const vp of viewports) {
    for (const lang of langs) {
      for (const route of filledPages) {
        test(`${route.name} ${vp.name} ${lang}`, async ({ page }) => {
          await page.setViewportSize({ width: vp.width, height: vp.height })
          await seedLang(page, lang)
          await mockCatalogue(page)
          await page.goto(route.path, { waitUntil: 'load' })
          // Wait until the mocked catalogue replaces the empty seed.
          await expect(page.getByText(/Quiet Surfaces|سطح‌های آرام|Sara Emami|Morning Line/).first()).toBeVisible({
            timeout: 10_000,
          })
          await shot(page, route.name, vp, lang)
        })
      }
    }
  }
})
