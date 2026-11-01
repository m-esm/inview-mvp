import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const baseUrl = process.env.QA_BASE_URL || 'https://inview.moshes.io'
const routes = JSON.parse(process.env.QA_ROUTES)
const viewports = { mobile: '390x844', desktop: '1440x900' }
const results = {}

mkdirSync('visual-qa-report', { recursive: true })
for (const route of routes) {
  for (const [vpName, size] of Object.entries(viewports)) {
    const url = new URL(route.path, baseUrl).href
    const run = spawnSync(
      'npx',
      ['--yes', 'impeccable@4.8.0', 'detect', url, '--viewport', size, '--json', '--no-config'],
      { encoding: 'utf8' },
    )
    const key = `${route.name}-${vpName}`
    const browserFailed = /Error:/.test(run.stderr || '')
    try {
      const findings = JSON.parse(run.stdout)
      results[key] = browserFailed ? { error: run.stderr.trim().split('\n')[0] } : findings
    } catch {
      results[key] = { error: (run.stderr || 'no output').trim().split('\n')[0] }
    }
  }
}
writeFileSync('visual-qa-report/impeccable.json', JSON.stringify(results, null, 2))
