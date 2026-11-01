import test from 'node:test'
import assert from 'node:assert/strict'
import { messages } from '../app/lib/i18n.ts'
import { oCopy } from '../app/lib/pilot.ts'

test('English and Persian message catalogues have the same keys', () => {
  const enKeys = Object.keys(messages.en).sort()
  const faKeys = Object.keys(messages.fa).sort()
  assert.deepEqual(enKeys, faKeys)
  assert.notEqual(messages.en.artworks, messages.fa.artworks)
  assert.equal(typeof messages.fa.artworks, 'string')
  assert.equal(messages.fa.artworks.length > 0, true)
})

test('O Gallery copy has the same keys in English and Persian', () => {
  const en = oCopy('en')
  const fa = oCopy('fa')
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fa).sort())
  assert.notEqual(en.seeWorks, fa.seeWorks)
})
