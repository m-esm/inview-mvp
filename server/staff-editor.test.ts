import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import type { PilotRecord } from '../app/lib/pilot.ts'
import { renderStaff } from './test-render.ts'

const record: PilotRecord = {
  slug: 'o-gallery',
  name: 'O Gallery',
  nameFa: 'گالری اُ',
  logo: null,
  showTitle: 'Quiet Surfaces',
  showTitleFa: 'سطح‌های آرام',
  dates: '',
  datesFa: '',
  hours: '',
  hoursFa: '',
  address: '',
  addressFa: '',
  text: '',
  textFa: '',
  pdfUrl: null,
  works: [
    { id: 'editorwk01', artist: 'N. Karimi', title: 'Harbour light', medium: 'Oil', size: '40 x 50', year: '2024', price: 1000000, status: 'available', image: '', sample: false },
  ],
}

async function render(lang: 'en' | 'fa') {
  const OGalleryEditor = (await import('../app/pages/gallery/OGalleryEditor.tsx')).default
  const { OGalleryStaffLayout } = await import('../app/pages/gallery/OGalleryStaffLayout.tsx')
  return renderStaff(
    createElement(OGalleryStaffLayout, null, createElement(OGalleryEditor, { initialRecord: record })),
    lang,
    '/dashboard/o-gallery',
  )
}

test('HAD-37 the O Gallery editor renders fully in Persian with dir rtl', async () => {
  const html = await render('fa')
  assert.match(html, /class="staff staff-fa" dir="rtl"/)
  for (const label of ['فهرست آثار گالری اُ', 'بازدیدها و شماره‌ها', 'عنوان فارسی نمایشگاه', 'قیمت به تومان', 'انتشار', 'دریافت CSV', 'انتخاب تصویر', 'خروج']) {
    assert.ok(html.includes(label), label)
  }
  const englishLabels = ['Show title', 'Publish', 'Sign out', 'Download CSV', 'Choose an image', 'Visits and leads']
  for (const label of englishLabels) assert.equal(html.includes(`>${label}<`), false, label)
  assert.doesNotMatch(html, /Rooz/)
})

test('HAD-37 the O Gallery editor renders in English with dir ltr', async () => {
  const html = await render('en')
  assert.match(html, /class="staff staff-en" dir="ltr"/)
  assert.match(html, /O Gallery catalogue/)
  assert.match(html, /Download CSV/)
  assert.match(html, /href="\/api\/v1\/pilot\/staff\/leads.csv"/)
  assert.match(html, /value="1,000,000"/)
})

test('HAD-37 the staff dictionaries have the same keys', async () => {
  const { staffDictionaries } = await import('../app/lib/i18n-staff.ts')
  assert.deepEqual(Object.keys(staffDictionaries.fa).sort(), Object.keys(staffDictionaries.en).sort())
  for (const [key, value] of Object.entries(staffDictionaries.fa)) assert.ok(String(value).trim(), key)
})
