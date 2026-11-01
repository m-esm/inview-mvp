import AxeBuilder from '@axe-core/playwright'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { expect, test, type Page } from '@playwright/test'
import { createOperatorInvite } from '../scripts/create-operator.mjs'

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).analyze()
  expect(result.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')
    .map((item) => ({ id: item.id, targets: item.nodes.map((node) => node.target) }))).toEqual([])
  expect(await page.locator('h1').count()).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

for (const width of [390, 1440]) {
  for (const lang of ['fa', 'en'] as const) {
    test(`operator invite, sign-in, gallery and team at ${width} in ${lang}`, async ({ page, baseURL, browser }, testInfo) => {
      test.setTimeout(90000)
      const origin = baseURL || 'http://127.0.0.1:3000'
      const id = randomUUID().slice(0, 8)
      const email = `ops-${id}@example.com`
      const slug = `ops-${id}`
      const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
      let invite: string
      try {
        invite = await createOperatorInvite(sql, { email, name: 'Test operator', role: 'admin', publicAppUrl: origin })
      } finally { await sql.end() }
      await page.setViewportSize({ width, height: 900 })
      await page.context().addCookies([{ name: 'inview-lang', value: lang, url: origin }])
      await page.goto('/ops')
      await expect(page).toHaveURL(/\/ops\/sign-in$/)
      await accessible(page)
      await page.screenshot({ path: testInfo.outputPath('sign-in.png') })
      await page.goto(invite)
      await accessible(page)
      await page.locator('input[name="name"]').fill('Test operator')
      await page.locator('input[name="password"]').fill('operator-password')
      await page.locator('form button[type="submit"], form button:not([type])').click()
      await expect(page).toHaveURL(/\/ops$/)
      await page.locator('form[action="/ops/sign-out"] button').click()
      await expect(page).toHaveURL(/\/ops\/sign-in$/)
      await page.locator('input[name="identifier"]').fill(email)
      await page.locator('input[name="password"]').fill('operator-password')
      await page.locator('form > button').click()
      await expect(page).toHaveURL(/\/ops$/)
      await accessible(page)
      await page.screenshot({ path: testInfo.outputPath('overview.png') })
      await page.goto('/ops/galleries/new')
      await accessible(page)
      await page.screenshot({ path: testInfo.outputPath('new-gallery.png') })
      await page.locator('[name="slug"]').fill(slug)
      await page.locator('[name="nameFa"]').fill('گالری آزمایشی')
      await page.locator('[name="nameEn"]').fill('Test gallery')
      await page.locator('[name="showTitle"]').fill('First show')
      await page.locator('[name="ownerIdentifier"]').fill(`owner-${id}@example.com`)
      await page.locator('.ops-form button').click()
      await expect(page.locator('.ops-once textarea')).toBeVisible()
      const ownerInvite = await page.locator('.ops-once textarea').inputValue()
      expect(new URL(ownerInvite).pathname.startsWith('/staff/invite/')).toBe(true)
      await accessible(page)
      await page.reload()
      await expect(page.locator('.ops-once')).toHaveCount(0)
      const staffContext = await browser.newContext({ baseURL: origin })
      try {
        const ownerPage = await staffContext.newPage()
        await ownerPage.goto(ownerInvite)
        await ownerPage.locator('[name="name"]').fill('Gallery owner')
        await ownerPage.locator('[name="password"]').fill('owner-password')
        await ownerPage.locator('form > button').click()
        await expect(ownerPage).toHaveURL(new RegExp(`/staff/${slug}$`))
        for (const path of ['/ops', '/ops/galleries/new', `/ops/galleries/${slug}`, `/ops/galleries/${slug}/team`]) {
          expect((await ownerPage.request.get(path)).status()).toBe(403)
        }
      } finally { await staffContext.close() }
      await page.goto(`/ops/galleries/${slug}/team`)
      await expect(page.getByRole('heading', { name: 'Gallery owner' })).toBeVisible()
      await accessible(page)
      await page.screenshot({ path: testInfo.outputPath('team.png') })
      await page.goto(`/ops/galleries/${slug}`)
      await accessible(page)
      await page.screenshot({ path: testInfo.outputPath('profile.png') })
      await page.locator('[name="notes"]').fill('Operator note')
      await page.locator('[name="status"]').selectOption('live')
      await page.locator('.ops-form button').click()
      await expect(page.getByRole('status')).toBeVisible()
      await page.reload()
      await expect(page.locator('[name="notes"]')).toHaveValue('Operator note')
      await page.locator('button[value="rotate"]').click()
      await expect(page.locator('.ops-once textarea')).toBeVisible()
      await page.reload()
      await expect(page.locator('.ops-once')).toHaveCount(0)
      const response = await page.request.post(`/ops/galleries/${slug}`, { headers: { Origin: 'https://invalid.example' }, form: { intent: 'rotate' } })
      expect(response.status()).toBe(403)
    })
  }
}
