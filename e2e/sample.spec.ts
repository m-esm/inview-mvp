import { expect, test, type Page } from '@playwright/test'
import postgres from 'postgres'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000'

async function useLang(page: Page, lang: 'fa' | 'en') {
  await page.context().addCookies([{ name: 'inview-lang', value: lang, url: baseURL }])
}

async function sampleVisitCounts() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required for this test.')
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const [row] = await sql`
      SELECT
        (SELECT count(*) FROM visits v JOIN shows s ON s.id = v.show_id JOIN galleries g ON g.id = s.gallery_id
          WHERE g.slug = 'sample')::int AS sample,
        (SELECT count(*) FROM visits v JOIN shows s ON s.id = v.show_id JOIN galleries g ON g.id = s.gallery_id
          WHERE g.slug = 'o-gallery')::int AS o`
    return row as { sample: number; o: number }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

test.describe('sample gallery', () => {
  test('the landing page shows the Demo label and carries noindex', async ({ page }) => {
    await useLang(page, 'en')
    await page.goto('/g/sample')
    await expect(page.locator('.demo-badge')).toHaveText('Demo')
    await expect(page.locator('.demo-banner')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Salt and Saffron' })).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/g\/sample$/)
  })

  test('the works page lists the sample works and links inside the sample gallery', async ({ page }) => {
    await useLang(page, 'fa')
    await page.goto('/g/sample/works')
    await expect(page.locator('.demo-badge')).toHaveText('نمونه نمایشی')
    await expect(page.locator('.o-wall .card')).toHaveCount(12)
    const first = page.locator('.o-wall .card a.label').first()
    await expect(first).toHaveAttribute('href', /^\/g\/sample\/works\/sample-w\d+$/)
    await first.click()
    await expect(page).toHaveURL(/\/g\/sample\/works\/sample-w\d+$/)
    await expect(page.locator('.work-artist')).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })

  test('prices and about render the sample record', async ({ page }) => {
    await useLang(page, 'en')
    await page.goto('/g/sample/prices')
    await expect(page.locator('.price-list li')).toHaveCount(12)
    await expect(page.getByText('Price on request').first()).toBeVisible()
    await page.goto('/g/sample/about')
    await expect(page.getByRole('heading', { name: 'Nimrooz Gallery (demo)' })).toBeVisible()
    await expect(page.locator('.artist-list li')).toHaveCount(5)
  })

  test('a QR scan on the sample landing counts for the sample gallery only', async ({ page }) => {
    const before = await sampleVisitCounts()
    await page.goto('/g/sample?q=sample-window')
    await expect(page.locator('.demo-badge')).toBeVisible()
    await expect.poll(async () => (await sampleVisitCounts()).sample, { timeout: 10_000 }).toBe(before.sample + 1)
    expect((await sampleVisitCounts()).o).toBe(before.o)
  })

  test('O Gallery has no Demo label and no noindex', async ({ page }) => {
    await useLang(page, 'en')
    await page.goto('/g/o-gallery')
    await expect(page.locator('.v-top')).toBeVisible()
    await expect(page.locator('.demo-badge')).toHaveCount(0)
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
  })

  test('an unknown gallery slug answers 404', async ({ request }) => {
    const response = await request.get('/g/nope')
    expect(response.status()).toBe(404)
  })
})
