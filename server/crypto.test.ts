import test from 'node:test'
import assert from 'node:assert/strict'
import { hashSecret, verifySecret, sixDigitCode } from './crypto.ts'

test('access code hash verifies and rejects a wrong code', () => {
  const hash = hashSecret('inview')
  assert.equal(verifySecret('inview', hash), true)
  assert.equal(verifySecret('nope', hash), false)
  assert.equal(verifySecret('inview', null), false)
})

test('OTP codes have six digits', () => {
  const code = sixDigitCode()
  assert.match(code, /^\d{6}$/)
})
