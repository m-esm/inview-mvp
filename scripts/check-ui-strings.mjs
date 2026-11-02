import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const ROOTS = ['app/components', 'app/pages', 'app/routes', 'app/root.tsx']

const ENGLISH_ONLY_DEMO = [
  'app/pages/gallery/Dashboard.tsx',
  'app/pages/gallery/GalleryLayout.tsx',
  'app/pages/gallery/Import.tsx',
  'app/pages/gallery/Plans.tsx',
  'app/pages/site/Website.tsx',
]

const ALLOWED_WORDS = ['EN', 'English', 'Inview', 'https']

const LOCALIZED_ATTRIBUTES = [
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'placeholder',
  'title',
]

const allowed = new Set(ENGLISH_ONLY_DEMO)
const attributes = new Set(LOCALIZED_ATTRIBUTES)
const allowedWords = new RegExp(`\\b(?:${ALLOWED_WORDS.join('|')})\\b`, 'gi')

function hasLatinWord(value) {
  return /[A-Za-z]{2,}/.test(value.replace(allowedWords, ' '))
}

async function filesUnder(target) {
  if ((await stat(target)).isFile()) return [target]
  const found = []
  for (const entry of await readdir(target, { withFileTypes: true })) {
    const child = path.posix.join(target, entry.name)
    if (entry.isDirectory()) found.push(...(await filesUnder(child)))
    else if (entry.isFile() && child.endsWith('.tsx')) found.push(child)
  }
  return found
}

function literalText(node) {
  if (ts.isStringLiteralLike(node)) return node.text
  if (ts.isJsxExpression(node) && node.expression) return literalText(node.expression)
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(' ')
  return null
}

function scan(file, source) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const hits = []

  function report(node, kind, value) {
    if (!hasLatinWord(value)) return
    const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree))
    hits.push({ file, line: line + 1, kind, value: value.trim().replace(/\s+/g, ' ').slice(0, 80) })
  }

  function walk(node) {
    if (ts.isJsxText(node)) report(node, 'text', node.text)
    else if (ts.isJsxAttribute(node) && attributes.has(node.name.getText(tree))) {
      const value = node.initializer ? literalText(node.initializer) : null
      if (value !== null) report(node, node.name.getText(tree), value)
    } else if (ts.isJsxExpression(node) && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const value = literalText(node)
      if (value !== null) report(node, 'text', value)
    }
    ts.forEachChild(node, walk)
  }

  walk(tree)
  return hits
}

const scanned = (await Promise.all(ROOTS.map(filesUnder))).flat().sort()
const stale = ENGLISH_ONLY_DEMO.filter((file) => !scanned.includes(file))
const hits = (
  await Promise.all(
    scanned
      .filter((file) => !allowed.has(file))
      .map(async (file) => scan(file, await readFile(file, 'utf8'))),
  )
).flat()

if (stale.length) {
  console.error(`Stale allow-list entries in scripts/check-ui-strings.mjs: ${stale.join(', ')}`)
}

if (hits.length) {
  for (const hit of hits) console.error(`${hit.file}:${hit.line}: ${hit.kind}: ${JSON.stringify(hit.value)}`)
  console.error('')
  console.error(`${hits.length} hard-coded user-facing string(s).`)
  console.error('Move the text into app/lib/i18n.ts (visitor and site) or app/lib/i18n-staff.ts (staff), then read it through useT() or useStaffT().')
}

if (hits.length || stale.length) {
  process.exitCode = 1
} else {
  console.log(`UI string check passed on ${scanned.length - allowed.size} file(s).`)
  console.log(`English-only Rooz demo pages skipped: ${ENGLISH_ONLY_DEMO.join(', ')}`)
}
