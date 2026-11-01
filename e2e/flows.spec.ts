import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const accessCode = process.env.O_GALLERY_ACCESS_CODE || 'inview'
const workId = 'flowwork01'

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desk', width: 1440, height: 900 },
] as const

async function publishFlowWork(page: Page) {
  const current = await page.request.get('/api/pilot')
  expect(current.ok()).toBeTruthy()
  const body = (await current.json()) as { record: Record<string, unknown> }
  const published = await page.request.put('/api/pilot', {
    data: {
      accessCode,
      record: {
        ...body.record,
        showTitle: 'Flow show',
        showTitleFa: 'نمایش جریان',
        works: [
          {
            id: workId,
            title: 'Harbour light',
            artist: 'N. Karimi',
            medium: 'Oil',
            size: '40 x 50',
            year: '2024',
            price: 1000000,
            status: 'available',
            image: '',
            sample: false,
          },
        ],
      },
    },
  })
  expect(published.ok(), await published.text()).toBeTruthy()
}

async function expectAxe(page: Page, label: string) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((animation) => animation.finished))
  })
  const results = await new AxeBuilder({ page }).analyze()
  const violations = results.violations.map((item) => `${item.impact || 'unknown'}:${item.id}`)
  expect(violations, `${label} ${violations.join(', ')}`).toEqual([])
}

async function signIn(page: Page, kind: 'save' | 'ask') {
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByLabel('شماره موبایل').fill('09123334444')
  await page.getByRole('checkbox', { name: /موافقم/ }).check()
  await page.getByRole('button', { name: 'ارسال کد' }).click()
  await page.getByLabel('کد ۴ رقمی را وارد کنید').fill('1234')
  await page.getByRole('button', { name: 'تأیید' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  if (kind === 'save') await expect(page.getByRole('button', { name: 'ذخیره شد' })).toBeVisible()
}

test.describe.configure({ mode: 'serial' })

test.describe('gallery flows', () => {

for (const viewport of viewports) {
  test.describe(`gallery flows ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce',
    })

    test.beforeEach(async ({ page }) => {
      await publishFlowWork(page)
    })

    test('visitor scans, opens a work, saves and asks', async ({ page }) => {
      let scanFinished = false
      page.on('requestfinished', (request) => {
        if (request.method() === 'POST' && request.url().includes('/api/pilot')) scanFinished = true
      })
      const scan = page.waitForResponse(
        (response) => response.url().includes('/api/pilot') && response.request().method() === 'POST',
        { timeout: 8_000 },
      )
      await page.goto('/g/o-gallery')
      const scanResponse = await scan
      expect(scanResponse.status()).toBe(200)
      expect(scanResponse.request().postData() || '').toContain('"kind":"scan"')
      await expect.poll(() => scanFinished, { timeout: 8_000 }).toBe(true)
      await expectAxe(page, 'landing')

      await page.getByRole('link', { name: 'دیدن آثار' }).click()
      await expect(page).toHaveURL(/\/g\/o-gallery\/works$/)
      await expect(page.getByRole('link', { name: /Harbour light/ }).first()).toBeVisible()
      await expectAxe(page, 'works')

      await page.getByRole('link', { name: /Harbour light/ }).first().click()
      await expect(page).toHaveURL(new RegExp(`/works/${workId}$`))
      await expectAxe(page, 'work')

      await page.getByRole('button', { name: 'ذخیره', exact: true }).click()
      await signIn(page, 'save')

      const ask = page.waitForResponse(
        (response) =>
          response.url().includes('/api/pilot') &&
          response.request().method() === 'POST' &&
          (response.request().postData() || '').includes('"kind":"ask"'),
      )
      await page.getByRole('button', { name: 'درباره این اثر بپرسید' }).click()
      expect((await ask).ok()).toBeTruthy()
      await expect(page.getByRole('button', { name: 'گالری با شما تماس می‌گیرد' })).toBeVisible()
      await expectAxe(page, 'work after ask')
    })

    test('visitor switches language', async ({ page }) => {
      await page.goto('/g/o-gallery')
      await expect(page.getByRole('link', { name: 'دیدن آثار' })).toBeVisible()
      await page.getByRole('button', { name: 'EN' }).click()
      await expect(page.getByRole('link', { name: 'See the works' })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
      await expectAxe(page, 'landing english')
      await page.getByRole('button', { name: 'فا' }).click()
      await expect(page.getByRole('link', { name: 'دیدن آثار' })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'fa')
      await expectAxe(page, 'landing persian')
    })

    test('staff signs in, edits and publishes', async ({ page }) => {
      await page.goto('/dashboard')
      await expectAxe(page, 'staff sign-in')
      await page.getByLabel('Dashboard password').fill(accessCode)
      await page.getByRole('button', { name: 'Open dashboard' }).click()
      await expect(page.getByRole('link', { name: 'O Gallery' })).toBeVisible()

      await page.goto('/dashboard/o-gallery')
      const title = page.getByLabel('Show title', { exact: true })
      await expect(title).toBeVisible()
      await title.fill('Staff flow show')
      await page.getByLabel('Gallery access code').fill(accessCode)
      await page.getByRole('button', { name: 'Publish' }).click()
      await expect(page.getByRole('status')).toHaveText('Published. The QR path is still /g/o-gallery.')
      await expect(page.getByRole('heading', { name: 'Visits' })).toBeVisible()
      await expect(page.getByText(/Landing scans|There are no visits yet/)).toBeVisible()
      await expectAxe(page, 'staff editor')

      const live = await page.request.get('/api/pilot')
      const body = (await live.json()) as { record: { showTitle: string }; leads?: unknown; visits?: unknown }
      expect(body.record.showTitle).toBe('Staff flow show')
      expect(body.leads).toBeUndefined()
      expect(body.visits).toBeUndefined()
    })
  })
}
})
