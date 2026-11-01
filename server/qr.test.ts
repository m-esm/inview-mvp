import test from 'node:test'
import assert from 'node:assert/strict'
import { qrMatrix, qrSvg, qrUrl } from './qr'

test('QR links use the visitor scan parameter and SVG has a quiet zone without embedded text', () => {
  const address = qrUrl('https://inview.test', 'staff-a', 'entrance-1')
  assert.equal(address, 'https://inview.test/g/staff-a?q=entrance-1')
  const svg = qrSvg(address)
  assert.match(svg, /viewBox="0 0 49 49"/)
  assert.match(svg, /fill="white"/)
  assert.doesNotMatch(qrSvg('<script>alert(1)</script>'), /<script|alert/)
  assert.equal(qrMatrix('x'.repeat(134)).length, 41)
  assert.throws(() => qrMatrix('x'.repeat(135)), /too long/)
})
