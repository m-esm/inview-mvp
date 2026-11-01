import assert from 'node:assert/strict'
import test from 'node:test'
import { formatDate, formatDateRange, formatNumber, formatToman, localDigits } from '../app/lib/format.ts'

test('numbers group with the locale separator', () => {
  assert.equal(formatNumber('en', 1250000), '1,250,000')
  assert.equal(formatNumber('fa', 1250000), '۱٬۲۵۰٬۰۰۰')
})

test('toman prices carry the unit in both languages', () => {
  assert.equal(formatToman('en', 45000000, 'Toman'), '45,000,000 Toman')
  assert.equal(formatToman('fa', 45000000, 'تومان'), '۴۵٬۰۰۰٬۰۰۰ تومان')
})

test('Persian dates use the Jalali calendar', () => {
  assert.equal(formatDate('fa', '2026-11-01'), '۱۰ آبان ۱۴۰۵')
  assert.equal(formatDate('en', '2026-11-01'), 'November 1, 2026')
  assert.equal(formatDate('en', 'not a date'), '')
  assert.equal(formatDate('fa', null), '')
})

test('a date range shows both ends', () => {
  const plain = (text: string) => text.replace(/\s+/g, ' ')
  assert.equal(plain(formatDateRange('en', '2026-11-01', '2026-11-20')), 'November 1 \u2013 20, 2026')
  assert.equal(plain(formatDateRange('fa', '2026-11-01', '2026-11-20')), '۱۰ تا ۲۹ آبان ۱۴۰۵')
  assert.equal(formatDateRange('en', '2026-11-01', null), 'November 1, 2026')
  assert.equal(formatDateRange('en', null, null), '')
})

test('sizes and years show Persian digits in Persian only', () => {
  assert.equal(localDigits('fa', '40 x 50 cm, 2024'), '۴۰ x ۵۰ cm, ۲۰۲۴')
  assert.equal(localDigits('en', '40 x 50'), '40 x 50')
})
