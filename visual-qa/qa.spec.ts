import AxeBuilder from '@axe-core/playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { langs, routes, viewports } from './pages'

const reportDir = 'visual-qa-report'
const baseURL = process.env.QA_BASE_URL || 'https://inview.moshes.io'
const updating = process.env.QA_UPDATE === '1'

mkdirSync(`${reportDir}/pages`, { recursive: true })
mkdirSync(`${reportDir}/screenshots`, { recursive: true })

for (const vp of viewports) {
  for (const lang of langs) {
    for (const route of routes) {
      const id = `${route.name}-${vp.name}-${lang}`
      test(id, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await page.context().addCookies([{ name: 'inview-lang', value: lang, url: baseURL }])
        const errors: string[] = []
        page.on('pageerror', (err) => errors.push(err.message.slice(0, 200)))
        const response = await page.goto(route.path, { waitUntil: 'networkidle' })
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(600)

        const status = response?.status() ?? 0
        const expected = route.name === 'not-found' ? 404 : 200
        const entry: Record<string, unknown> = {
          id,
          path: route.path,
          viewport: vp.name,
          lang,
          httpStatus: status,
          expectedStatus: expected,
          httpOk: status === expected,
          pageErrors: errors,
        }

        await page.screenshot({ path: `${reportDir}/screenshots/${id}.png`, fullPage: true })

        const axe = await new AxeBuilder({ page }).analyze()
        entry.axe = axe.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length }))

        const hasBaseline = existsSync(`visual-qa/baselines/${id}.png`)
        entry.visual = hasBaseline || updating ? 'compared' : 'no-baseline'
        writeFileSync(`${reportDir}/pages/${id}.json`, JSON.stringify(entry, null, 2))

        expect.soft(status, `${route.path} status`).toBe(expected)
        if (hasBaseline || updating) {
          await expect.soft(page).toHaveScreenshot(`${id}.png`, {
            animations: 'disabled',
            fullPage: true,
            maxDiffPixelRatio: 0.02,
          })
        }
      })
    }
  }
}
