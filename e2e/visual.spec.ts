import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { EMPTY_CATALOGUE, seedCatalogue, type SeedRecord } from './seed-catalogue'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000'

const catalogue = (
  JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/o-gallery-catalogue.json'), 'utf8'),
  ) as { record: SeedRecord }
).record

const emptyPages = [
  { path: '/g/o-gallery', name: 'welcome' },
  { path: '/g/o-gallery/works', name: 'works' },
  { path: '/g/o-gallery/prices', name: 'prices' },
  { path: '/g/o-gallery/about', name: 'about' },
  { path: '/staff/o-gallery', name: 'dashboard-login' },
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

const MAX_DIFF_PIXELS = 0

const PERSIAN_SYSTEM_SERIF_FALLBACK = ['.gate-panel h2', '.gate-card .brand span']

function hostFontMasks(page: Page, lang: (typeof langs)[number]) {
  if (lang !== 'fa') return []
  return PERSIAN_SYSTEM_SERIF_FALLBACK.map((selector) => page.locator(selector))
}

async function waitForFonts(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

test.describe('visual landing', () => {
  for (const vp of viewports) {
    for (const lang of langs) {
      test(`landing ${vp.name} ${lang}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await seedLang(page, lang)
        await page.goto('/', { waitUntil: 'load' })
        await waitForFonts(page)
        await expect(page.locator('.landing')).toBeVisible()
        await expect(page).toHaveScreenshot(`landing-${vp.name}-${lang}.png`, {
          animations: 'disabled',
          fullPage: true,
          mask: hostFontMasks(page, lang),
          maxDiffPixels: MAX_DIFF_PIXELS,
        })
      })
    }
  }
})

// The server reads the language from this cookie before it renders the page.
async function seedLang(page: Page, lang: 'fa' | 'en') {
  await page.context().addCookies([{ name: 'inview-lang', value: lang, url: baseURL }])
}

async function shot(page: Page, name: string, vp: (typeof viewports)[number], lang: (typeof langs)[number]) {
  await page.waitForTimeout(600)
  await waitForFonts(page)
  await expect(page.locator('body')).toBeVisible()
  await expect(page).toHaveScreenshot(`${name}-${vp.name}-${lang}.png`, {
    animations: 'disabled',
    fullPage: false,
    mask: hostFontMasks(page, lang),
    maxDiffPixels: MAX_DIFF_PIXELS,
  })
}

test.describe('visual empty', () => {
  for (const vp of viewports) {
    for (const lang of langs) {
      for (const route of emptyPages) {
        test(`${route.name} ${vp.name} ${lang}`, async ({ page }) => {
          await page.setViewportSize({ width: vp.width, height: vp.height })
          await seedLang(page, lang)
          await seedCatalogue(EMPTY_CATALOGUE)
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
          await seedCatalogue(catalogue)
          await page.goto(route.path, { waitUntil: 'load' })
          await expect(page.getByText(/Quiet Surfaces|سطح‌های آرام|Sara Emami|Morning Line/).first()).toBeVisible({
            timeout: 10_000,
          })
          await shot(page, route.name, vp, lang)
        })
      }
    }
  }
})
