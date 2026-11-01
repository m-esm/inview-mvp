import { ensureOGalleryTenant } from './gallery-bootstrap.ts'
import { tenantBySlug } from './gallery-record.ts'
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
delete process.env.O_GALLERY_ACCESS_CODE
import { eq } from 'drizzle-orm'
import * as schema from '../database/schema.ts'
import { imageSetFor, loadPublicRecord } from './gallery-record.ts'
import { handlePilotApi } from './pilot-api.ts'
import { createTestDb } from './test-db.ts'

const work = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: 'Harbour light',
  artist: 'N. Karimi',
  medium: 'Oil',
  size: '40 x 50',
  year: '2024',
  price: 1000000,
  status: 'available',
  image: '',
  sample: false,
  ...extra,
})

test('an uploaded variant URL yields webp and jpeg srcsets', () => {
  const set = imageSetFor('/media/galleries/o-gallery/abc/w640.webp', null)
  assert.deepEqual(set, {
    webp: '/media/galleries/o-gallery/abc/w320.webp 320w, /media/galleries/o-gallery/abc/w640.webp 640w',
    jpeg: '/media/galleries/o-gallery/abc/w320.jpeg 320w, /media/galleries/o-gallery/abc/w640.jpeg 640w',
  })
  assert.equal(imageSetFor('/m/x/w500.webp', null)?.webp, '/m/x/w320.webp 320w, /m/x/w500.webp 500w')
})

test('stored media variants decide the srcset widths', () => {
  const set = imageSetFor('/m/w500.webp', { 'w320.webp': '/m/w320.webp', 'w500.webp': '/m/w500.webp', 'w320.jpeg': '/m/w320.jpeg', 'w500.jpeg': '/m/w500.jpeg' })
  assert.equal(set?.webp, '/m/w320.webp 320w, /m/w500.webp 500w')
  assert.equal(set?.jpeg, '/m/w320.jpeg 320w, /m/w500.jpeg 500w')
})

test('a plain image path has no srcset', () => {
  assert.equal(imageSetFor('/artworks/emami.jpg', null), null)
  assert.equal(imageSetFor('', null), null)
})

test('Persian work fields and show dates round-trip through publish', async () => {
  const testDb = await createTestDb()
  await ensureOGalleryTenant(testDb.db)
  try {
    const { db, storage } = testDb
    const first = (await loadPublicRecord(db, (await tenantBySlug(db, 'o-gallery'))!)).record
    const published = await handlePilotApi(db, storage, 'PUT', {
      accessCode: 'inview',
      record: {
        ...first,
        startsOn: '2026-11-01',
        endsOn: 'not a date',
        works: [work('fafields01', { titleFa: 'نور بندر', artistFa: 'ن. کریمی', mediumFa: 'رنگ روغن' })],
      },
    })
    assert.equal(published.status, 200)
    const record = (await loadPublicRecord(db, (await tenantBySlug(db, 'o-gallery'))!)).record
    assert.equal(record.startsOn, '2026-11-01')
    assert.equal(record.endsOn, null)
    assert.equal(record.works[0].titleFa, 'نور بندر')
    assert.equal(record.works[0].artistFa, 'ن. کریمی')
    assert.equal(record.works[0].mediumFa, 'رنگ روغن')
  } finally {
    await testDb.close()
  }
})

test('the public record cache serves repeats and drops a stale copy after a direct write', async () => {
  const testDb = await createTestDb()
  await ensureOGalleryTenant(testDb.db)
  try {
    const { db, storage } = testDb
    const first = (await loadPublicRecord(db, (await tenantBySlug(db, 'o-gallery'))!)).record
    await handlePilotApi(db, storage, 'PUT', { accessCode: 'inview', record: { ...first, showTitle: 'One', works: [work('cachework1')] } })
    const a = await loadPublicRecord(db, (await tenantBySlug(db, 'o-gallery'))!)
    const b = await loadPublicRecord(db, (await tenantBySlug(db, 'o-gallery'))!)
    assert.equal(a, b)
    assert.equal(b.record.showTitle, 'One')

    const [show] = await db.select().from(schema.shows).limit(1)
    await db.update(schema.shows).set({ titleEn: 'Two', updatedAt: new Date(show.updatedAt.getTime() + 1000) }).where(eq(schema.shows.id, show.id))
    const c = await loadPublicRecord(db, (await tenantBySlug(db, 'o-gallery'))!)
    assert.notEqual(c, b)
    assert.equal(c.record.showTitle, 'Two')

    await handlePilotApi(db, storage, 'PUT', { accessCode: 'inview', record: { ...c.record, showTitle: 'Three' } })
    assert.equal((await loadPublicRecord(db, (await tenantBySlug(db, 'o-gallery'))!)).record.showTitle, 'Three')
  } finally {
    await testDb.close()
  }
})
