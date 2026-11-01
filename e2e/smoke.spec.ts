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

  test('health API', async ({ request }) => {
    const response = await request.get('/api/v1/health')
    expect(response.status()).toBe(200)
    const json = (await response.json()) as { ok?: boolean; service?: string }
    expect(json.ok).toBe(true)
    expect(json.service).toBe('inview-mvp')
  })
})
