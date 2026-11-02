import AxeBuilder from '@axe-core/playwright'
import { randomUUID } from 'node:crypto'
import { inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { expect, test as base, type BrowserContext, type Page } from '@playwright/test'
import * as schema from '../database/schema'
import { hashSecret } from '../server/crypto'

type StaffOwner = { slug: string; email: string; password: string; galleryName: string }

const test = base.extend<{ owner: StaffOwner }>({
  owner: async ({}, use) => {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is required for staff e2e tests.')
    const sql = postgres(url, { max: 1 })
    const db = drizzle(sql, { schema })
    const slug = `staff-${randomUUID().slice(0, 8)}`
    const slugs = [slug, `${slug}-second`]
    const email = `owner-${slug}@example.com`
    const emails = [email, `editor-${slug}@example.com`, `viewer-${slug}@example.com`]
    const password = randomUUID()
    const galleryName = `Staff gallery ${slug}`
    let galleryIds: string[] = []
    try {
      galleryIds = await db.transaction(async (tx) => {
        const galleries = await tx.insert(schema.galleries).values(slugs.map((item, index) => ({
          slug: item,
          nameEn: index === 0 ? galleryName : 'Second staff gallery',
          nameFa: index === 0 ? 'گالری کارکنان' : 'گالری دوم کارکنان',
          status: 'live' as const,
          sharedCodeEnabled: false,
        }))).returning()
        await tx.insert(schema.shows).values(galleries.map((gallery) => ({
          galleryId: gallery.id, titleEn: 'Before publishing', titleFa: 'پیش از انتشار', status: 'published' as const,
        })))
        const [owner] = await tx.insert(schema.users).values({
          email, name: 'Staff owner', passwordHash: hashSecret(password),
        }).returning()
        await tx.insert(schema.memberships).values(galleries.map((gallery) => ({
          galleryId: gallery.id, userId: owner.id, role: 'owner' as const,
        })))
        return galleries.map((gallery) => gallery.id)
      })
      await use({ slug, email, password, galleryName })
    } finally {
      try {
        await db.transaction(async (tx) => {
          if (galleryIds.length) {
            await tx.delete(schema.auditLogs).where(inArray(schema.auditLogs.galleryId, galleryIds))
            await tx.delete(schema.galleries).where(inArray(schema.galleries.id, galleryIds))
          }
          await tx.delete(schema.users).where(inArray(schema.users.email, emails))
        })
      } finally {
        await sql.end({ timeout: 5 })
      }
    }
  },
})

test.use({ reducedMotion: 'reduce' })

async function signIn(page: Page, owner: StaffOwner) {
  await page.goto('/staff/sign-in')
  const identifier = /^(Email or phone|ایمیل یا شماره تلفن)$/
  const form = page.locator('form').filter({ has: page.getByLabel(identifier) })
  await form.getByLabel(identifier).fill(owner.email)
  await form.getByLabel(/^(Password|رمز عبور)$/).fill(owner.password)
  await form.getByRole('button', { name: /^(Open the editor|باز کردن ویرایشگر)$/ }).click()
  await expect(page).toHaveURL(/\/staff$/)
}

async function invite(page: Page, slug: string, role: 'editor' | 'viewer') {
  await page.goto(`/staff/${slug}/team`)
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Invite staff', exact: true }) })
  await form.getByLabel('Email or phone', { exact: true }).fill(`${role}-${slug}@example.com`)
  await form.getByRole('combobox', { name: 'Role', exact: true }).selectOption(role)
  await form.getByRole('button', { name: 'Invite staff', exact: true }).click()
  const link = page.getByLabel('Copy this one-time invite link', { exact: true })
  await expect(link).toBeVisible()
  const path = await link.inputValue()
  expect(path).toMatch(/^\/staff\/invite\/[^/]+$/)
  await page.reload()
  await expect(link).toHaveCount(0)
  return path
}

async function accept(page: Page, path: string, name: string, slug: string) {
  await page.goto(path)
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.getByLabel('Password', { exact: true }).fill(randomUUID())
  await page.getByRole('button', { name: 'Accept invite', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/staff/${slug}$`))
}

async function accessible(page: Page, path: string) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)))
  })
  const result = await new AxeBuilder({ page }).analyze()
  const violations = result.violations
    .filter((item) => item.impact === 'serious' || item.impact === 'critical')
    .map((item) => ({ id: item.id, targets: item.nodes.map((node) => node.target) }))
  expect(violations, path).toEqual([])
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true)
}

for (const width of [390, 1440]) {
  test(`owner invites staff; the editor publishes and the viewer cannot at ${width}`, async ({ page, browser, baseURL, owner }) => {
    test.setTimeout(90_000)
    const origin = new URL(baseURL || 'http://127.0.0.1:3000').origin
    const viewport = { width, height: 900 }
    await page.setViewportSize(viewport)
    await page.context().addCookies([{ name: 'inview-lang', value: 'en', url: origin }])
    await signIn(page, owner)
    await page.getByRole('link', { name: owner.galleryName, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/staff/${owner.slug}$`))
    await page.getByRole('link', { name: 'Staff team', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/staff/${owner.slug}/team$`))
    const editorInvite = await invite(page, owner.slug, 'editor')
    const viewerInvite = await invite(page, owner.slug, 'viewer')
    const contexts: BrowserContext[] = []
    try {
      const pages: Page[] = []
      for (let index = 0; index < 3; index++) {
        const context = await browser.newContext({ baseURL: origin, viewport, reducedMotion: 'reduce' })
        contexts.push(context)
        await context.addCookies([{ name: 'inview-lang', value: 'en', url: origin }])
        pages.push(await context.newPage())
      }
      const [editor, viewer, visitor] = pages
      await visitor.goto(`/g/${owner.slug}`)
      await expect(visitor.getByRole('heading', { name: 'Before publishing', exact: true })).toBeVisible()
      await accept(editor, editorInvite, 'Invited editor', owner.slug)
      await expect(editor.getByRole('link', { name: 'Staff team', exact: true })).toHaveCount(0)
      const title = `Published by editor ${width}`
      await editor.getByLabel('Show title', { exact: true }).fill(title)
      const published = editor.waitForResponse((response) =>
        response.url().includes('/api/v1/pilot') && response.request().method() === 'PUT')
      await editor.getByRole('button', { name: 'Publish', exact: true }).click()
      expect((await published).status()).toBe(200)
      await expect(editor.getByRole('status')).toHaveText('Saved. The QR address stays the same.')
      await visitor.reload()
      await expect(visitor.getByRole('heading', { name: title, exact: true })).toBeVisible()

      await accept(viewer, viewerInvite, 'Invited viewer', owner.slug)
      await expect(viewer.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(viewer.getByRole('heading', { name: 'Visits and leads', level: 1, exact: true })).toBeVisible()
      await expect(viewer.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0)
      await expect(viewer.getByLabel('Show title', { exact: true })).toHaveCount(0)
      await expect(viewer.getByRole('link', { name: 'Download CSV', exact: true })).toHaveCount(0)
      const current = await visitor.request.get(`/api/v1/pilot?gallery=${owner.slug}`)
      expect(current.status()).toBe(200)
      const { record } = await current.json()
      const denied = await viewer.request.put('/api/v1/pilot', {
        headers: { Origin: origin },
        data: { gallery: owner.slug, record: { ...record, showTitle: 'Viewer must not publish' } },
      })
      expect(denied.status()).toBe(403)
      await visitor.reload()
      await expect(visitor.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await expect(visitor.getByText('Viewer must not publish', { exact: true })).toHaveCount(0)

      await page.reload()
      await expect(page.getByRole('heading', { name: 'Invited editor', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Invited viewer', exact: true })).toBeVisible()
      const csv = await page.request.get(`/api/v1/pilot/staff/leads.csv?gallery=${owner.slug}`)
      expect(csv.status()).toBe(200)
      expect(csv.headers()['content-type']).toContain('text/csv')
      expect(await csv.text()).toContain('created_at_utc_iso,created_at_tehran_gregorian,created_at_tehran_jalali,kind,phone,work_id,work_title')
    } finally {
      await Promise.all(contexts.map((context) => context.close()))
    }
  })

  for (const lang of ['fa', 'en'] as const) {
    test(`staff pages have no serious or critical axe violations at ${width} in ${lang}`, async ({ page, baseURL, owner }, testInfo) => {
      test.setTimeout(90_000)
      const origin = baseURL || 'http://127.0.0.1:3000'
      await page.setViewportSize({ width, height: 900 })
      await page.context().addCookies([{ name: 'inview-lang', value: lang, url: origin }])
      await page.goto('/staff/sign-in')
      await expect(page.getByRole('heading', { name: lang === 'fa' ? 'ورود کارکنان' : 'Staff sign-in', exact: true })).toBeVisible()
      await accessible(page, '/staff/sign-in')
      await page.screenshot({ path: testInfo.outputPath('sign-in.png') })
      await signIn(page, owner)
      for (const [name, path, titleEn, titleFa] of [
        ['index', '/staff', 'Your galleries', 'گالری‌های شما'],
        ['gallery', `/staff/${owner.slug}`, 'Gallery catalogue', 'فهرست آثار گالری'],
        ['report', `/staff/${owner.slug}/report`, 'Visits and leads', 'بازدیدها و شماره‌ها'],
        ['team', `/staff/${owner.slug}/team`, 'Staff team', 'کارکنان'],
        ['qr', `/staff/${owner.slug}/qr`, 'Create QR code', 'ساخت کد QR'],
        ['preview', `/staff/${owner.slug}/preview`, 'Preview', 'پیش‌نمایش'],
      ]) {
        const response = await page.goto(path)
        expect(response?.status(), path).toBe(200)
        expect(new URL(page.url()).pathname).toBe(path)
        await expect(page.locator('html')).toHaveAttribute('lang', lang)
        await accessible(page, path)
        await expect(page.getByRole('heading', { level: 1, name: lang === 'fa' ? titleFa : titleEn, exact: true })).toBeVisible()
        await page.screenshot({ path: testInfo.outputPath(`${name}.png`) })
      }
    })
  }
}

test('the editor takes the show days in the Jalali calendar', async ({ page, baseURL, owner }) => {
  test.setTimeout(90_000)
  const origin = new URL(baseURL || 'http://127.0.0.1:3000').origin
  await page.setViewportSize({ width: 390, height: 900 })
  await page.context().addCookies([{ name: 'inview-lang', value: 'fa', url: origin }])
  await signIn(page, owner)
  await page.goto(`/staff/${owner.slug}`)

  async function setDay(legend: string, year: string, month: string, day: string) {
    const group = page.getByRole('group', { name: legend, exact: true })
    await group.getByLabel('سال', { exact: true }).fill(year)
    await group.getByLabel('ماه', { exact: true }).selectOption({ label: month })
    await group.getByLabel('روز', { exact: true }).selectOption(day)
    return group
  }

  const first = await setDay('روز آغاز', '1405', 'آبان', '10')
  await expect(first.getByLabel('سال', { exact: true })).toHaveValue('۱۴۰۵')
  await expect(first.getByText('1 November 2026', { exact: true })).toBeVisible()
  await setDay('روز پایان', '1405', 'آبان', '29')
  await accessible(page, `/staff/${owner.slug}`)

  const published = page.waitForResponse((response) =>
    response.url().includes('/api/v1/pilot') && response.request().method() === 'PUT')
  await page.getByRole('button', { name: 'انتشار', exact: true }).click()
  expect((await published).status()).toBe(200)

  await page.goto(`/g/${owner.slug}`)
  await expect(page.getByText('۱۰ تا ۲۹ آبان ۱۴۰۵', { exact: true })).toBeVisible()
  await page.context().addCookies([{ name: 'inview-lang', value: 'en', url: origin }])
  await page.goto(`/g/${owner.slug}`)
  await expect(page.getByText('November 1 – 20, 2026', { exact: true })).toBeVisible()
})

test('the editor refuses a last day that comes before the first day', async ({ page, baseURL, owner }) => {
  test.setTimeout(90_000)
  const origin = new URL(baseURL || 'http://127.0.0.1:3000').origin
  await page.context().addCookies([{ name: 'inview-lang', value: 'en', url: origin }])
  await signIn(page, owner)
  await page.goto(`/staff/${owner.slug}`)
  for (const [legend, day] of [['First day', '20'], ['Last day', '1']] as const) {
    const group = page.getByRole('group', { name: legend, exact: true })
    await group.getByLabel('Year', { exact: true }).fill('2026')
    await group.getByLabel('Month', { exact: true }).selectOption({ label: 'November' })
    await group.getByLabel('Day', { exact: true }).selectOption(day)
  }
  await expect(page.getByRole('alert')).toHaveText('The last day is before the first day.')
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByRole('alert').last()).toHaveText('The last day is before the first day.')
  const current = await page.request.get(`/api/v1/pilot?gallery=${owner.slug}`)
  expect((await current.json()).record.startsOn).toBe(null)
})
