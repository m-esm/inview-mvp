import test from 'node:test'
import assert from 'node:assert/strict'
import { CONSENT_TEXT_VERSION, consentText } from '../app/lib/consent.ts'

test('consent and privacy text exists in English and Persian', () => {
  assert.equal(CONSENT_TEXT_VERSION, '2026-11-01')
  for (const lang of ['en', 'fa'] as const) {
    assert.ok(consentText[lang].privacy.length > 0)
    assert.ok(consentText[lang].consent.length > 0)
    assert.ok(consentText[lang].needConsent.length > 0)
  }
  assert.notEqual(consentText.en.privacy, consentText.fa.privacy)
  assert.notEqual(consentText.en.consent, consentText.fa.consent)
  assert.match(consentText.en.privacy, /Save/)
  assert.match(consentText.en.privacy, /Ask/)
  assert.match(consentText.fa.privacy, /ذخیره/)
  assert.match(consentText.fa.privacy, /بپرسید/)
})
