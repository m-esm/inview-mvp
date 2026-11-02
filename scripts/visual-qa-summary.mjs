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

// Rules the design owner accepted as the paper-and-ink look. They are listed, not failed.
// Advisory findings from impeccable (straggler, unbalanced-heading) are also listed, not failed.
// Any other finding fails the verdict.
const acceptedRules = {
  'cream-palette': 'warm paper background is the brand look',
  'kicker-above-heading': 'small label above a heading is part of the gallery type system',
  'hero-eyebrow-chip': 'the "Current show" label is the gallery type system',
}

const rows = []
const notes = []
const issues = []
for (const p of pages) {
  const changed = visualFailed.has(p.id)
  const axeCount = p.axe.length
  const imp = impeccable[p.id.replace(/-(fa|en)$/, '')]
  const expectedError = p.expectedStatus >= 400
  const skipped = imp && !Array.isArray(imp) && expectedError && p.httpOk
  if (imp && !Array.isArray(imp) && !skipped) issues.push(`${p.id}: impeccable did not run (${imp.error})`)
  const failing = Array.isArray(imp)
    ? imp.filter((f) => f.antipattern === 'low-contrast' || (!f.advisory && !(f.antipattern in acceptedRules)))
    : []
  const impCount = Array.isArray(imp) ? failing.length : null
  for (const f of failing) issues.push(`${p.id}: impeccable ${f.antipattern}: ${f.snippet} (${f.selector})`)
  if (Array.isArray(imp)) {
    for (const f of imp) if (!failing.includes(f)) notes.push(`${p.id}: ${f.antipattern}`)
  }
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
    `| ${p.id} | ${p.httpStatus} | ${p.visual === 'no-baseline' ? 'no baseline' : changed ? 'changed' : 'same'} | ${axeCount} | ${skipped ? 'skipped (error page)' : impCount ?? 'n/a'} |`,
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
  notes.length ? '\n### Accepted or advisory impeccable findings (not failing)' : '',
  ...Object.entries(
    notes.reduce((acc, n) => {
      const rule = n.split(': ')[1]
      acc[rule] = (acc[rule] || 0) + 1
      return acc
    }, {}),
  ).map(([rule, n]) => `- ${rule}: ${n} pages${acceptedRules[rule] ? ` (accepted: ${acceptedRules[rule]})` : ' (advisory)'}`),
].filter((l) => l !== '')

writeFileSync(`${dir}/summary.md`, lines.join('\n') + '\n')
writeFileSync(`${dir}/verdict.txt`, verdict + '\n')
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
console.log(lines.join('\n'))
