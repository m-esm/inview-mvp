import test from 'node:test'
import assert from 'node:assert/strict'
import { redact, requestPath } from './redact.js'
import { installProcessLog } from './http-log.js'

test('request logs drop the query string, the phone and the access code', () => {
  assert.equal(requestPath('/api/v1/pilot?accessCode=alpha-code&phone=09120000000'), '/api/v1/pilot')
  assert.equal(
    redact('failed accessCode=alpha-code phone=09120000000'),
    'failed accessCode=[redacted] phone=[redacted]',
  )
  assert.equal(redact('call +989120000000'), 'call [redacted]')
})

test('a missing route does not log a stack', () => {
  const lines = []
  const originalWrite = process.stderr.write
  process.stderr.write = (chunk, ...rest) => {
    lines.push(String(chunk))
    void rest
    return true
  }
  const previous = console.error
  try {
    installProcessLog()
    console.error(new Error('No route matches URL "/nope"'))
    console.error(new Error('accessCode=alpha-code exploded'))
  } finally {
    console.error = previous
    process.stderr.write = originalWrite
  }
  const text = lines.join('')
  assert.equal(text.includes('No route matches URL'), false)
  assert.equal(text.includes('    at '), false)
  assert.equal(text.includes('alpha-code'), false)
  assert.match(text, /"msg":"error"/)
})
