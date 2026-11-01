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
      test.setTimeout(180000)
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
        for (const path of ['/ops', '/ops/galleries/new', `/ops/galleries/${slug}`, `/ops/galleries/${slug}/team`, `/ops/galleries/${slug}/qr`, `/ops/galleries/${slug}/leads`, `/ops/galleries/${slug}/leads.csv`, `/ops/galleries/${slug}/activity`, '/ops/operators', '/ops/audit', '/ops/health']) {
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
      const seed = postgres(process.env.DATABASE_URL!, { max: 1 })
      try {
        const [gallery] = await seed`select id from galleries where slug = ${slug}`
        await seed`insert into works(id, gallery_id, title, title_fa) values (${`work-${id}`}, ${gallery.id}, 'Operator work', 'اثر اپراتور')`
        await seed`insert into leads(gallery_id, work_id, phone, kind, consent_at, consent_text_version) values (${gallery.id}, ${`work-${id}`}, '09121234534', 'ask', now(), 'v1')`
        const [other] = await seed`insert into galleries(slug, name_en, name_fa) values (${`other-${id}`}, 'Other gallery', 'گالری دیگر') returning id`
        await seed`insert into leads(gallery_id, phone, kind, consent_at, consent_text_version) values (${other.id}, '09129999999', 'ask', now(), 'v1')`
      } finally { await seed.end() }
      for (const path of [`/ops/galleries/${slug}/qr`, `/ops/galleries/${slug}/leads`, `/ops/galleries/${slug}/activity`, '/ops/operators', '/ops/audit', '/ops/health']) {
        await page.goto(path)
        await accessible(page)
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
        await page.screenshot({ path: testInfo.outputPath(`${path.split('/').pop()}.png`) })
      }
      await page.goto(`/ops/galleries/${slug}/leads`)
      await expect(page.locator(`a[href="/ops/galleries/${slug}/leads.csv"]`)).toBeVisible()
      const csvResponse = await page.request.get(`/ops/galleries/${slug}/leads.csv`)
      expect(csvResponse.status()).toBe(200)
      expect(csvResponse.headers()['cache-control']).toBe('no-store')
      expect(csvResponse.headers()['content-disposition']).toContain('attachment; filename=')
      const csv = await csvResponse.text()
      expect(csv).toContain('09121234534')
      expect(csv).not.toContain('09129999999')
      await page.goto(`/ops/galleries/${slug}/qr`)
      await page.locator('[name="label"]').fill('Entrance')
      await page.locator('[name="code"]').fill(`entrance-${id}`)
      await page.locator('.ops-form button').click()
      await expect(page.getByText(`entrance-${id}`, { exact: true })).toBeVisible()
      const svg = await page.request.get(`/ops/galleries/${slug}/qr/entrance-${id}/download.svg`)
      expect(svg.status()).toBe(200)
      expect(await svg.text()).toContain('<svg')
      await page.goto('/ops/operators')
      await page.locator('[name="identifier"]').fill(`support-${id}@example.com`)
      await page.locator('.ops-form [name="role"]').selectOption('support')
      await page.locator('button[value="invite"]').click()
      await expect(page.locator('.ops-once textarea')).toBeVisible()
      const supportInvite = await page.locator('.ops-once textarea').inputValue()
      await page.reload()
      await expect(page.locator('.ops-once')).toHaveCount(0)
      const supportContext = await browser.newContext({ baseURL: origin })
      try {
        const supportPage = await supportContext.newPage()
        await supportPage.goto(supportInvite)
        await supportPage.locator('[name="name"]').fill('Support operator')
        await supportPage.locator('[name="password"]').fill('support-password')
        await supportPage.locator('form > button').click()
        await expect(supportPage).toHaveURL(/\/ops$/)
        expect((await supportPage.request.get('/ops/operators')).status()).toBe(403)
        expect((await supportPage.request.post('/ops/operators', { headers: { Origin: origin }, form: { intent: 'invite', identifier: 'blocked@example.com', role: 'admin' } })).status()).toBe(403)
        await supportPage.goto(`/ops/galleries/${slug}/leads`)
        await expect(supportPage.locator('a[download]')).toHaveCount(0)
        expect((await supportPage.request.get(`/ops/galleries/${slug}/leads.csv`)).status()).toBe(403)
        await expect(supportPage.getByText('0912•••••34', { exact: true })).toBeVisible()
        expect(await supportPage.content()).not.toContain('09121234534')
        await supportPage.locator('[name="reason"]').fill('Visitor asked for a callback')
        await supportPage.locator('.ops-form button').click()
        await expect(supportPage.locator('.ops-once textarea')).toHaveValue('09121234534')
        await supportPage.reload()
        await expect(supportPage.locator('.ops-once')).toHaveCount(0)
        const check = postgres(process.env.DATABASE_URL!, { max: 1 })
        try {
          const rows = await check`select summary from audit_logs a join galleries g on g.id = a.gallery_id where g.slug = ${slug} and a.action = 'lead-reveal'`
          expect(rows).toHaveLength(1)
          expect(rows[0].summary).toEqual({ reason: 'Visitor asked for a callback' })
          const exports = await check`select a.summary from audit_logs a join galleries g on g.id = a.gallery_id where g.slug = ${slug} and a.action = 'leads-export'`
          expect(exports).toHaveLength(1)
          expect(exports[0].summary).toEqual({ rows: 1 })
        } finally { await check.end() }
      } finally { await supportContext.close() }
    })
  }
}
