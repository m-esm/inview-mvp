import { expect, test } from '@playwright/test'

const pages = [
  '/',
  '/g/o-gallery',
  '/g/o-gallery/works',
  '/g/o-gallery/prices',
  '/g/o-gallery/about',
]

test.describe('smoke', () => {
  for (const path of pages) {
    test(`SSR page ${path}`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 5 })
      expect(response.status(), path).toBe(200)
      const body = await response.text()
      expect(body.length, path).toBeGreaterThan(0)
      expect(body, path).not.toMatch(/Unexpected Server Error|Internal Server Error/i)
    })
  }

  test('the Rooz dashboard stays public', async ({ request }) => {
    const response = await request.get('/dashboard', { maxRedirects: 0 })
    expect(response.status()).toBe(200)
    const body = await response.text()
    expect(body).not.toMatch(/Demo password/)
    expect(body).toMatch(/Quiet Rooms/)
  })

  test('the O Gallery editor redirects without a staff session', async ({ request }) => {
    const response = await request.get('/dashboard/o-gallery', { maxRedirects: 0 })
    expect(response.status()).toBe(302)
    expect(response.headers().location).toBe('/dashboard/sign-in')
  })

  test('dashboard routes do not log React error 418', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))
    for (const path of ['/dashboard', '/dashboard/artworks', '/dashboard/audience', '/dashboard/website', '/dashboard/plans', '/dashboard/o-gallery']) {
      await page.goto(path, { waitUntil: 'load' })
    }
    expect(errors.join('\n')).not.toMatch(/418|Hydration failed|did not match/)
  })

  for (const lang of ['fa', 'en'] as const) {
    test(`visitor routes log nothing in ${lang}`, async ({ page, baseURL }) => {
      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
          errors.push(msg.text().slice(0, 160))
        }
      })
      page.on('pageerror', (err) => errors.push(err.message.slice(0, 160)))
      await page.context().addCookies([
        { name: 'inview-lang', value: lang, url: baseURL as string },
      ])
      for (const path of pages) {
        await page.goto(path, { waitUntil: 'networkidle' })
      }
      expect(errors.join('\n')).toBe('')
    })
  }

  test('health API', async ({ request }) => {
    const response = await request.get('/api/v1/health')
    expect(response.status()).toBe(200)
    const json = (await response.json()) as { ok?: boolean; service?: string }
    expect(json.ok).toBe(true)
    expect(json.service).toBe('inview-mvp')
  })
})
