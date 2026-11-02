#!/usr/bin/env node
/**
 * Capture before/after screenshots.
 * Usage:
 *   BASE_URL=https://inview.moshes.io OUT_DIR=artifacts/before node scripts/capture-visuals.mjs
 *   BASE_URL=http://127.0.0.1:3000 OUT_DIR=artifacts/after node scripts/capture-visuals.mjs
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const base = process.env.BASE_URL || 'http://127.0.0.1:3000'
const out = process.env.OUT_DIR || 'artifacts/shots'
const pages = [
  { path: '/g/o-gallery', name: 'welcome' },
  { path: '/g/o-gallery/works', name: 'works' },
  { path: '/g/o-gallery/prices', name: 'prices' },
  { path: '/g/o-gallery/about', name: 'about' },
  { path: '/staff/o-gallery', name: 'dashboard-login' },
]

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
]

const langs = ['fa', 'en']

mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
for (const vp of viewports) {
  for (const lang of langs) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: lang === 'fa' ? 'fa-IR' : 'en-US',
    })
    const page = await context.newPage()
    await context.addCookies([{ name: 'inview-lang', value: lang, url: base }])
    await page.addInitScript((l) => {
      try {
        localStorage.setItem('inview-demo-v1', JSON.stringify({
          lang: l,
          langChosen: true,
          phone: null,
          saved: [],
          follows: [],
          stamps: [],
        }))
      } catch { /* ignore */ }
    }, lang)

    for (const route of pages) {
      const url = `${base}${route.path}`
      await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
      await page.waitForTimeout(800)
      const file = join(out, `${route.name}-${vp.name}-${lang}.png`)
      await page.screenshot({ path: file, fullPage: false })
      console.log('wrote', file)
    }
    await context.close()
  }
}
await browser.close()
