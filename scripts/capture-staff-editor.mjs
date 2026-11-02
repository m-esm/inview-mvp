import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const base = process.env.BASE_URL || 'http://127.0.0.1:3000'
const out = process.env.OUT_DIR || 'docs/design/staff-editor'
const accessCode = process.env.O_GALLERY_ACCESS_CODE || 'inview'
const lang = process.env.STAFF_LANG === 'en' ? 'en' : 'fa'
const viewports = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
]

mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: lang === 'fa' ? 'fa-IR' : 'en-US',
  })
  await context.addCookies([{ name: 'inview-lang', value: lang, url: base }])
  const page = await context.newPage()

  await page.goto(`${base}/dashboard/sign-in`, { waitUntil: 'load', timeout: 60_000 })
  await page.locator('#access-code').fill(accessCode)
  await page.locator('form.gate-card button[type="submit"]').click()
  await page.waitForURL(/\/dashboard\/o-gallery$/, { timeout: 60_000 })
  await page.locator('.staff-totals').waitFor({ timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(800)

  const top = join(out, `staff-editor-${lang}-${vp.name}-report.png`)
  await page.screenshot({ path: top })
  console.log('wrote', top)

  await page.locator('#catalogue').evaluate((node) => node.scrollIntoView({ block: 'start' }))
  await page.waitForTimeout(400)
  const catalogue = join(out, `staff-editor-${lang}-${vp.name}-catalogue.png`)
  await page.screenshot({ path: catalogue })
  console.log('wrote', catalogue)

  await context.close()
}
await browser.close()
