import { expect, test } from '@playwright/test'
import { seedCatalogue, type SeedRecord } from './seed-catalogue'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000'

const catalogue: SeedRecord = {
  showTitle: 'Quiet Rooms',
  showTitleFa: 'اتاق‌های آرام',
  startsOn: '2026-11-01',
  endsOn: '2026-11-20',
  works: [
    { id: 'filter-work-01', title: 'Harbour light', titleFa: 'نور بندر', artist: 'Sara Emami', artistFa: 'سارا امامی', status: 'available', price: 1250000 },
    { id: 'filter-work-02', title: 'Salt road', artist: 'Sara Emami', artistFa: 'سارا امامی', status: 'available', price: 900000 },
    { id: 'filter-work-03', title: 'Night field', artist: 'Nima Bakhtiari', status: 'reserved', price: 2000000 },
    { id: 'filter-work-04', title: 'Blue door', artist: 'Leila Fateh', status: 'sold', price: 3000000 },
  ],
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async () => {
  await seedCatalogue(catalogue)
})

async function useLang(page: import('@playwright/test').Page, lang: 'en' | 'fa') {
  await page.context().addCookies([{ name: 'inview-lang', value: lang, url: baseURL }])
}

test('each status filter shows only its works, with counts', async ({ page }) => {
  await useLang(page, 'en')
  await page.goto('/g/o-gallery/works')
  const filters = page.getByRole('group', { name: 'Work status' })
  const cards = page.locator('.o-wall .card')
  await expect(filters.getByRole('button', { name: /All\s*4/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(cards).toHaveCount(4)
  const expected = [
    { name: 'Available', count: 2 },
    { name: 'Reserved', count: 1 },
    { name: 'Sold', count: 1 },
    { name: 'All', count: 4 },
  ]
  for (const item of expected) {
    const button = filters.getByRole('button', { name: new RegExp(`^${item.name}\\s*${item.count}$`) })
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(cards).toHaveCount(item.count)
  }
  await filters.getByRole('button', { name: /^Sold/ }).click()
  await expect(cards.first()).toContainText('Leila Fateh')
  await expect(cards.first().locator('.status')).toHaveText('Sold')
})

test('Persian filters, prices and dates use Persian digits', async ({ page }) => {
  await useLang(page, 'fa')
  await page.goto('/g/o-gallery/works')
  const filters = page.getByRole('group', { name: 'وضعیت آثار' })
  await expect(filters.getByRole('button', { name: /موجود\s*۲/ })).toBeVisible()
  await expect(page.locator('.o-wall .card').first()).toContainText('۱٬۲۵۰٬۰۰۰ تومان')
  await expect(page.locator('.o-wall .card').first()).toContainText('نور بندر')
  await page.goto('/g/o-gallery')
  await expect(page.getByText(/آبان ۱۴۰۵/)).toBeVisible()
})

test('the work page and the price list show the status label', async ({ page }) => {
  await useLang(page, 'en')
  await page.goto('/g/o-gallery/works/filter-work-03')
  await expect(page.locator('.price-row .status')).toHaveText('Reserved')
  await expect(page).toHaveTitle('Night field, Nima Bakhtiari · O Gallery')
  await page.goto('/g/o-gallery/prices')
  const rows = page.locator('.price-list li')
  await expect(rows).toHaveCount(4)
  await expect(rows.nth(3).locator('.status')).toHaveText('Sold')
  await expect(rows.nth(0).locator('.status')).toHaveText('Available')
})

test('the about page lists artists with their work counts', async ({ page }) => {
  await useLang(page, 'en')
  await page.goto('/g/o-gallery/about')
  const list = page.locator('.artist-list li')
  await expect(list).toHaveCount(3)
  await expect(list.nth(0)).toContainText('Sara Emami')
  await expect(list.nth(0)).toContainText('2 works')
  await expect(list.nth(1)).toContainText('1 work')
})

test('public pages carry social tags and a canonical link', async ({ page }) => {
  await useLang(page, 'fa')
  await page.goto('/g/o-gallery')
  await expect(page).toHaveTitle('اتاق‌های آرام · گالری اُ')
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'fa_IR')
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'اتاق‌های آرام · گالری اُ')
  await expect(page.locator('meta[name="twitter:card"]')).toHaveCount(1)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/g\/o-gallery$/)
  await expect(page.locator('title')).toHaveCount(1)
})
