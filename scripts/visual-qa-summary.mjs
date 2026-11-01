import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'

const dir = 'visual-qa-report'
const commit = process.env.QA_COMMIT || 'unknown'
const baseUrl = process.env.QA_BASE_URL || 'https://inview.moshes.io'
const artifactsUrl = process.env.QA_RUN_URL || ''

const pages = readdirSync(`${dir}/pages`)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(`${dir}/pages/${f}`, 'utf8')))
  .sort((a, b) => a.id.localeCompare(b.id))

const impeccable = existsSync(`${dir}/impeccable.json`)
  ? JSON.parse(readFileSync(`${dir}/impeccable.json`, 'utf8'))
  : {}
const diffs = existsSync(`${dir}/diffs`)
  ? readdirSync(`${dir}/diffs`, { recursive: true }).map(String).filter((f) => f.endsWith('-diff.png'))
  : []
const visualFailed = new Set(diffs.map((f) => f.split('/').pop().replace(/-diff\.png$/, '')))

const rows = []
const issues = []
for (const p of pages) {
  const changed = visualFailed.has(p.id)
  const axeCount = p.axe.length
  const imp = impeccable[p.id.replace(/-(fa|en)$/, '')]
  const impCount = Array.isArray(imp) ? imp.length : null
  if (imp && !Array.isArray(imp)) issues.push(`${p.id}: impeccable did not run (${imp.error})`)
  if (impCount) issues.push(`${p.id}: impeccable found ${impCount} anti-patterns`)
  if (!p.httpOk) issues.push(`${p.id}: HTTP ${p.httpStatus}`)
  if (changed) issues.push(`${p.id}: screenshot differs from the approved image`)
  for (const v of p.axe) issues.push(`${p.id}: axe ${v.impact} ${v.id} (${v.nodes} nodes)`)
  const errorCounts = new Map()
  for (const e of p.pageErrors) {
    const short = e.replace(/; visit .*$/, '')
    errorCounts.set(short, (errorCounts.get(short) || 0) + 1)
  }
  for (const [e, n] of errorCounts) issues.push(`${p.id}: page error x${n}: ${e}`)
  rows.push(
    `| ${p.id} | ${p.httpStatus} | ${p.visual === 'no-baseline' ? 'no baseline' : changed ? 'changed' : 'same'} | ${axeCount} | ${impCount ?? 'n/a'} |`,
  )
}

const missing = pages.filter((p) => p.visual === 'no-baseline').length
const verdict = issues.length === 0 ? 'PASS' : 'FAIL'
const lines = [
  `## Visual QA: ${verdict}`,
  '',
  `Release commit: \`${commit}\``,
  `Site: ${baseUrl}`,
  artifactsUrl ? `Artifacts: ${artifactsUrl}` : '',
  `Pages checked: ${pages.length} (7 routes, 2 viewports, 2 languages)`,
  missing ? `Pages without an approved image: ${missing}` : '',
  '',
  '| Page | HTTP | Screenshot | axe serious/critical | impeccable |',
  '| --- | --- | --- | --- | --- |',
  ...rows,
  '',
  issues.length ? '### Issues' : '### Issues\n\nNone.',
  ...issues.map((i) => `- ${i}`),
].filter((l) => l !== '')

writeFileSync(`${dir}/summary.md`, lines.join('\n') + '\n')
writeFileSync(`${dir}/verdict.txt`, verdict + '\n')
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
console.log(lines.join('\n'))
