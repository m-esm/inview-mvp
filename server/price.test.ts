import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseToman } from '../app/lib/price.ts'

test('parseToman keeps grouped digits and Persian digits', () => {
  assert.equal(parseToman('1,000,000'), 1000000)
  assert.equal(parseToman('1.000.000'), 1000000)
  assert.equal(parseToman('۱٬۰۰۰٬۰۰۰'), 1000000)
  assert.equal(parseToman('۱۲۳۴'), 1234)
  assert.equal(parseToman(''), null)
  assert.equal(parseToman('abc'), 'invalid')
  assert.equal(parseToman(-1), 'invalid')
})

test('HAD-31 the editor does not turn a grouped price into NaN', () => {
  const source = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../app/pages/gallery/GalleryEditor.tsx'),
    'utf8',
  )
  assert.equal(source.includes('Number(e.target.value)'), false)
  assert.equal(source.includes('parseToman'), true)
})
