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
    const response = await request.get('/staff/o-gallery', { maxRedirects: 0 })
    expect(response.status()).toBe(302)
    expect(response.headers().location).toBe('/staff/sign-in?next=%2Fstaff%2Fo-gallery')
  })

  for (const [legacy, destination] of [
    ['/dashboard/o-gallery', '/staff/o-gallery'],
    ['/dashboard/sign-in', '/staff/sign-in'],
  ]) {
    test(`${legacy} redirects to ${destination} and preserves the query`, async ({ request }) => {
      const query = '?next=%2Fstaff%2Fo-gallery%2Freport&lang=en'
      const response = await request.get(legacy + query, { maxRedirects: 0 })
      expect(response.status()).toBe(302)
      expect(response.headers().location).toBe(destination + query)
    })
  }

  test('dashboard routes do not log React error 418', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))
    for (const path of ['/dashboard', '/dashboard/artworks', '/dashboard/audience', '/dashboard/website', '/dashboard/plans', '/staff/o-gallery']) {
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

  test('robots.txt comes from the app and keeps the visitor routes crawlable', async ({ request }) => {
    const response = await request.get('/robots.txt')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toMatch(/text\/plain/)
    const body = await response.text()
    const directives = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => line.split(':')[0].toLowerCase())
    expect(directives.length).toBeGreaterThan(0)
    for (const directive of directives) {
      expect(['user-agent', 'allow', 'disallow', 'sitemap'], body).toContain(directive)
    }
    expect(body).toMatch(/^User-agent: \*$/m)
    expect(body).toMatch(/^Allow: \/$/m)
    for (const path of ['/me', '/dashboard', '/staff', '/ops']) {
      expect(body, path).toContain(`Disallow: ${path}`)
    }
  })

  test('health API', async ({ request }) => {
    const response = await request.get('/api/v1/health')
    expect(response.status()).toBe(200)
    const json = (await response.json()) as { ok?: boolean; service?: string }
    expect(json.ok).toBe(true)
    expect(json.service).toBe('inview-mvp')
  })
})
