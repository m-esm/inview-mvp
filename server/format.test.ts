import assert from 'node:assert/strict'
import test from 'node:test'
import {
  asciiDigits,
  dayToParts,
  formatDate,
  formatDateRange,
  formatNumber,
  formatSize,
  formatToman,
  localDigits,
  monthLength,
  monthNames,
  partsToDay,
} from '../app/lib/format.ts'

test('numbers group with the locale separator', () => {
  assert.equal(formatNumber('en', 1250000), '1,250,000')
  assert.equal(formatNumber('fa', 1250000), '۱٬۲۵۰٬۰۰۰')
})

test('toman prices carry the unit in both languages', () => {
  assert.equal(formatToman('en', 48000000, 'Toman'), '48,000,000 Toman')
  assert.equal(formatToman('fa', 48000000, 'تومان'), '۴۸٬۰۰۰٬۰۰۰ تومان')
})

test('Persian dates use the Jalali calendar', () => {
  assert.equal(formatDate('fa', '2026-11-01'), '۱۰ آبان ۱۴۰۵')
  assert.equal(formatDate('en', '2026-11-01'), 'November 1, 2026')
  assert.equal(formatDate('en', 'not a date'), '')
  assert.equal(formatDate('fa', null), '')
})

test('a date range shows both ends', () => {
  // Exact match: the browser renders the same plain spaces, or hydration fails.
  assert.equal(formatDateRange('en', '2026-11-01', '2026-11-20'), 'November 1 \u2013 20, 2026')
  assert.equal(formatDateRange('fa', '2026-11-01', '2026-11-20'), '۱۰ تا ۲۹ آبان ۱۴۰۵')
  assert.equal(formatDateRange('en', '2026-11-01', null), 'November 1, 2026')
  assert.equal(formatDateRange('en', null, null), '')
})

test('sizes and years show Persian digits in Persian only', () => {
  assert.equal(localDigits('fa', '40 x 50 cm, 2024'), '۴۰ x ۵۰ cm, ۲۰۲۴')
  assert.equal(localDigits('en', '40 x 50'), '40 x 50')
})

test('size separators use multiplication signs in both languages', () => {
  assert.equal(formatSize('fa', '100 x 140 cm'), '۱۰۰ × ۱۴۰ cm')
  assert.equal(formatSize('en', '21 X 29.7 cm'), '21 × 29.7 cm')
  assert.equal(formatSize('fa', '64 × 28 × 47 cm'), '۶۴ × ۲۸ × ۴۷ cm')
  assert.equal(formatSize('en', 'Mixed dimensions'), 'Mixed dimensions')
})

test('Persian and Arabic digits read as ASCII', () => {
  assert.equal(asciiDigits('۱۴۰۵/۰۸/۱۰'), '1405/08/10')
  assert.equal(asciiDigits('٢٠٢٦'), '2026')
  assert.equal(asciiDigits('1405'), '1405')
})

test('an ISO day splits into the calendar the language reads', () => {
  assert.deepEqual(dayToParts('fa', '2026-11-01'), { year: 1405, month: 8, day: 10 })
  assert.deepEqual(dayToParts('en', '2026-11-01'), { year: 2026, month: 11, day: 1 })
  assert.equal(dayToParts('fa', '2026-13-01'), null)
  assert.equal(dayToParts('en', null), null)
})

test('calendar parts build the ISO day back', () => {
  assert.equal(partsToDay('fa', { year: 1405, month: 8, day: 10 }), '2026-11-01')
  assert.equal(partsToDay('en', { year: 2026, month: 11, day: 1 }), '2026-11-01')
  assert.equal(partsToDay('fa', { year: 1404, month: 1, day: 1 }), '2025-03-21')
  assert.equal(partsToDay('fa', { year: 1403, month: 1, day: 1 }), '2024-03-20')
})

test('every day of 21 Jalali years survives the round trip', () => {
  let days = 0
  for (let year = 1395; year <= 1415; year++) {
    for (let month = 1; month <= 12; month++) {
      for (let day = 1; day <= monthLength('fa', year, month); day++) {
        const iso = partsToDay('fa', { year, month, day })
        assert.ok(iso, `${year}-${month}-${day} has no ISO day`)
        assert.deepEqual(dayToParts('fa', iso), { year, month, day })
        days++
      }
    }
  }
  assert.equal(days, 7670)
})

test('a day outside the month is rejected', () => {
  assert.equal(partsToDay('fa', { year: 1404, month: 7, day: 31 }), null)
  assert.equal(partsToDay('fa', { year: 1404, month: 12, day: 30 }), null)
  assert.equal(partsToDay('fa', { year: 1403, month: 12, day: 30 }), '2025-03-20')
  assert.equal(partsToDay('en', { year: 2026, month: 2, day: 30 }), null)
  assert.equal(partsToDay('fa', { year: 1405, month: 13, day: 1 }), null)
  assert.equal(partsToDay('en', { year: 2026, month: 11, day: 0 }), null)
})

test('month lengths follow the calendar', () => {
  assert.equal(monthLength('fa', 1405, 1), 31)
  assert.equal(monthLength('fa', 1405, 7), 30)
  assert.equal(monthLength('fa', 1404, 12), 29)
  assert.equal(monthLength('fa', 1403, 12), 30)
  assert.equal(monthLength('en', 2026, 2), 28)
  assert.equal(monthLength('en', 2024, 2), 29)
})

test('month names come from the calendar of each language', () => {
  assert.equal(monthNames('fa')[0], 'فروردین')
  assert.equal(monthNames('fa')[7], 'آبان')
  assert.equal(monthNames('fa').length, 12)
  assert.equal(monthNames('en')[0], 'January')
  assert.equal(monthNames('en')[11], 'December')
})
