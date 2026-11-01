import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
delete process.env.O_GALLERY_ACCESS_CODE
import { eq } from 'drizzle-orm'
import request from 'supertest'
import * as schema from '../database/schema.ts'
import { tehranDay } from '../app/lib/tehran-day.ts'
import { createApiApp } from './api-app.ts'
import { ensureOGalleryTenant } from './gallery-bootstrap.ts'
import { recordVisit } from './gallery-record.ts'
import { createTestDb } from './test-db.ts'

test('the visit day turns over at midnight in Tehran, not at midnight UTC', () => {
  assert.equal(tehranDay(new Date('2026-11-01T20:29:00Z')), '2026-11-01')
  assert.equal(tehranDay(new Date('2026-11-01T20:30:00Z')), '2026-11-02')
  assert.equal(tehranDay(new Date('2026-11-01T16:59:00Z')), '2026-11-01')
})

test('a scan at 00:10 in Tehran (20:40 UTC) counts on the new Tehran day', async () => {
  const testDb = await createTestDb()
  await ensureOGalleryTenant(testDb.db)
  try {
    const before = new Date('2026-11-01T20:29:00Z')
    const after = new Date('2026-11-01T20:40:00Z')
    const tenant = await ensureOGalleryTenant(testDb.db)
    await recordVisit(testDb.db, tenant, 'scan', 'visitor-tehran-1', null, null, before)
    await recordVisit(testDb.db, tenant, 'scan', 'visitor-tehran-2', null, null, after)
    const rows = await testDb.db.select({ day: schema.visits.day, visitorId: schema.visits.visitorId }).from(schema.visits)
    const days = Object.fromEntries(rows.map((row: { visitorId: string; day: string }) => [row.visitorId, String(row.day)]))
    assert.equal(days['visitor-tehran-1'], '2026-11-01')
    assert.equal(days['visitor-tehran-2'], '2026-11-02')
  } finally {
    await testDb.close()
  }
})

test('a scan from a labelled QR code stores that code', async () => {
  const testDb = await createTestDb()
  await ensureOGalleryTenant(testDb.db)
  try {
    const { show } = await ensureOGalleryTenant(testDb.db)
    const [label] = await testDb.db
      .insert(schema.qrCodes)
      .values({ showId: show.id, code: 'wall-label-12', label: 'Wall label 12' })
      .returning()
    const app = createApiApp(testDb.db, testDb.storage)
    const known = await request(app)
      .post('/api/v1/pilot')
      .set('x-test-client', 'qr')
      .send({ op: 'visit', kind: 'scan', visitorId: 'visitor-qr-0001', qrCode: 'wall-label-12' })
    assert.equal(known.status, 200)
    const unknown = await request(app)
      .post('/api/v1/pilot')
      .set('x-test-client', 'qr')
      .send({ op: 'visit', kind: 'scan', visitorId: 'visitor-qr-0002', qrCode: 'not-a-code' })
    assert.equal(unknown.status, 200)
    const [first] = await testDb.db.select().from(schema.visits).where(eq(schema.visits.visitorId, 'visitor-qr-0001'))
    const [second] = await testDb.db.select().from(schema.visits).where(eq(schema.visits.visitorId, 'visitor-qr-0002'))
    assert.equal(first.qrCodeId, label.id)
    assert.equal(second.qrCodeId, null)
  } finally {
    await testDb.close()
  }
})

test('bad JSON returns a JSON 400, and the old path says it is deprecated', async () => {
  const testDb = await createTestDb()
  await ensureOGalleryTenant(testDb.db)
  try {
    const app = createApiApp(testDb.db, testDb.storage)
    const bad = await request(app)
      .post('/api/v1/pilot')
      .set('x-test-client', 'json')
      .set('Content-Type', 'application/json')
      .send('{"op":')
    assert.equal(bad.status, 400)
    assert.match(String(bad.headers['content-type']), /application\/json/)
    assert.equal(bad.body.error, 'The request body is not valid JSON.')
    const old = await request(app).get('/api/pilot').set('x-test-client', 'json')
    assert.equal(old.status, 200)
    assert.equal(old.headers.deprecation, 'true')
  } finally {
    await testDb.close()
  }
})
