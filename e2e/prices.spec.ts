import AxeBuilder from '@axe-core/playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { seedCatalogue, type SeedRecord } from './seed-catalogue'

const catalogue = (
  JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/o-gallery-catalogue.json'), 'utf8')) as { record: SeedRecord }
).record

test.beforeAll(async () => {
  await seedCatalogue({
    ...catalogue,
    works: catalogue.works?.map((work, index) => index === 2 ? { ...work, price: null } : work),
  })
})

for (const width of [390, 1440]) {
  test.describe(`prices at ${width}px`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' })

    for (const slug of ['sample', 'o-gallery']) {
      for (const lang of ['fa', 'en'] as const) {
        test(`${slug} ${lang}`, async ({ page, baseURL }) => {
          await page.context().addCookies([{ name: 'inview-lang', value: lang, url: baseURL || 'http://127.0.0.1:3000' }])
          await page.goto(`/g/${slug}/prices`)
          await page.evaluate(() => document.fonts.ready)
          await expect(page.locator('html')).toHaveAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr')
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(lang === 'fa' ? 'فهرست قیمت' : 'Price list')
          await expect(page.getByText(lang === 'fa' ? 'همه قیمت‌ها به تومان' : 'All prices in Toman', { exact: true })).toBeVisible()
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

          const rows = page.locator('.price-list li > a')
          expect(await rows.count()).toBeGreaterThan(0)
          for (const row of await rows.all()) {
            await row.scrollIntoViewIfNeeded()
            const title = row.locator('.pl-text strong')
            const amount = row.locator('.pl-amount')
            const image = row.locator('img')
            await expect(row.locator(':scope > *')).toHaveCount(3)
            expect(await row.evaluate((element) => Array.from(element.children, (child) => getComputedStyle(child).gridArea))).toEqual(['image', 'text', 'price'])
            if (await row.locator(':scope > picture').count()) {
              await expect(row.locator(':scope > picture')).toHaveCSS('display', 'block')
            }
            await expect(amount).toHaveCSS('letter-spacing', /^(normal|0px)$/)
            await expect(amount).toHaveCSS('word-spacing', /^(normal|0px)$/)
            await expect(amount).toHaveCSS('font-variant-numeric', 'proportional-nums')
            if (lang === 'fa') await expect(amount).toHaveCSS('font-family', /Estedad/)
            await expect(image).toBeVisible()
            await expect(image).toHaveAttribute('alt', (await title.textContent()) || '')
            await expect.poll(() => image.evaluate((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true)
            await expect(row).toHaveAttribute('href', new RegExp(`^/g/${slug}/works/`))
            await expect(row.locator('.pl-meta bdi[dir="ltr"]')).toContainText('×')
            await expect(row.locator('.pl-meta bdi').last()).toHaveText(/[0-9۰-۹]{4}/)
            await expect(row.locator('.pl-meta')).toContainText(' · ')
            expect(await row.locator('.pl-meta').evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true)

            const bounds = await row.boundingBox()
            const priceBounds = await amount.boundingBox()
            const titleBounds = await title.boundingBox()
            const imageBounds = (await image.boundingBox())!
            const textBounds = (await row.locator('.pl-text').boundingBox())!
            const priceColumnBounds = (await row.locator('.pl-price').boundingBox())!
            expect(bounds).not.toBeNull()
            expect(priceBounds).not.toBeNull()
            expect(titleBounds).not.toBeNull()
            expect(Math.abs(imageBounds.y - textBounds.y)).toBeLessThanOrEqual(1)
            if (lang === 'fa') {
              expect(textBounds.x + textBounds.width).toBeLessThanOrEqual(imageBounds.x - 1)
            } else {
              expect(imageBounds.x + imageBounds.width).toBeLessThanOrEqual(textBounds.x - 1)
            }
            expect(priceBounds!.x).toBeGreaterThanOrEqual(bounds!.x - 1)
            expect(priceBounds!.x + priceBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1)
            expect(await amount.evaluate((element) => {
              const range = document.createRange()
              range.selectNodeContents(element)
              const tops = Array.from(range.getClientRects(), (rect) => Math.round(rect.top))
              return new Set(tops).size
            })).toBe(1)
            expect(priceBounds!.height).toBeLessThanOrEqual(await amount.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight) + 1))
            if (width === 1440) {
              expect(imageBounds.width).toBe(64)
              expect(Math.abs(priceColumnBounds.y - textBounds.y)).toBeLessThanOrEqual(1)
              if (lang === 'fa') {
                expect(priceColumnBounds.x + priceColumnBounds.width).toBeLessThanOrEqual(textBounds.x - 1)
              } else {
                expect(textBounds.x + textBounds.width).toBeLessThanOrEqual(priceColumnBounds.x - 1)
              }
              expect(priceBounds!.y).toBeLessThan(titleBounds!.y + titleBounds!.height)
              expect(priceBounds!.y + priceBounds!.height).toBeGreaterThan(titleBounds!.y)
            } else {
              expect(priceColumnBounds.y).toBeGreaterThanOrEqual(textBounds.y + textBounds.height)
              expect(Math.abs(priceColumnBounds.x - textBounds.x)).toBeLessThanOrEqual(1)
              expect(Math.abs(priceColumnBounds.width - textBounds.width)).toBeLessThanOrEqual(1)
              const statusBounds = await row.locator('.status').boundingBox()
              expect(statusBounds!.y).toBeLessThan(priceBounds!.y + priceBounds!.height)
              expect(statusBounds!.y + statusBounds!.height).toBeGreaterThan(priceBounds!.y)
              expect(imageBounds.width).toBeGreaterThanOrEqual(72)
              expect(imageBounds.width).toBeLessThanOrEqual(88)
            }
            const text = await amount.innerText()
            if (lang === 'fa' && /[۰-۹]/.test(text)) {
              expect(text).toContain('٬')
              expect(text).not.toContain(',')
            }
          }

          await expect(page.locator('.pl-amount', { hasText: lang === 'fa' ? 'قیمت با تماس' : 'Price on request' }).first()).toBeVisible()
          const bottomNav = page.locator('.v-tabs')
          await expect(bottomNav.locator('a')).toHaveCount(5)
          await expect(bottomNav.locator('[aria-current="page"]')).toHaveCount(1)
          await expect(bottomNav.locator('[aria-current="page"]')).toHaveAttribute('href', `/g/${slug}/prices`)
          expect(await bottomNav.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href')))).toEqual(
            await page.locator('.v-desktop-nav a').evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
          )
          if (width === 390) {
            await expect(bottomNav).toBeVisible()
            for (const link of await bottomNav.locator('a').all()) {
              const bounds = await link.boundingBox()
              expect(bounds!.height).toBeGreaterThanOrEqual(48)
              expect(bounds!.width).toBeGreaterThanOrEqual(48)
            }
          }
          await expect(page.locator('.demo-badge')).toHaveCount(0)
          await expect(page.locator('.prices .demo-banner')).toHaveCount(1)
          await expect(page.locator('.price-list .sample-note, .pl-num')).toHaveCount(0)
          if (slug === 'sample') {
            await expect(page.locator('.pdf-action svg')).toHaveCount(1)
            expect((await page.locator('.pdf-action').boundingBox())!.width).toBeLessThan((await page.locator('.prices').boundingBox())!.width)
          }
          await page.evaluate(() => scrollTo(0, 0))
          if (slug === 'sample' && process.env.PRICES_REVIEW_DIR) {
            mkdirSync(process.env.PRICES_REVIEW_DIR, { recursive: true })
            for (const strip of [1, 2]) {
              await page.evaluate((index) => scrollTo(0, (index - 1) * innerHeight), strip)
              await page.screenshot({ path: join(process.env.PRICES_REVIEW_DIR, `prices-${lang}-${width}-${strip}.png`), fullPage: false, animations: 'disabled' })
            }
            await page.evaluate(() => scrollTo(0, 0))
          }
          const results = await new AxeBuilder({ page }).analyze()
          expect(results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')).toEqual([])
        })
      }
    }
  })
}
