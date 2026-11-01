import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
delete process.env.O_GALLERY_ACCESS_CODE

import fs from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import request from 'supertest'
import { CONSENT_TEXT_VERSION } from '../app/lib/consent.ts'
import { leads, memberships, visits, works } from '../database/schema.ts'
import { createApiApp } from './api-app.ts'
import { ensureOGalleryTenant } from './gallery-bootstrap.ts'
import { tehranDate } from './gallery-record.ts'
import { STAFF_COOKIE } from './staff-session.ts'
import { createUser, createUserSession } from './accounts.ts'
import type { AppDatabase } from '../database/context.ts'
import { createTestDb } from './test-db.ts'

process.env.PUBLIC_APP_URL = 'http://localhost'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

async function withStaff(fn: (args: { app: ReturnType<typeof createApiApp>; db: TestDb['db']; mediaRoot: string; cookie: string }) => Promise<void>) {
  const testDb = await createTestDb()
  const { gallery } = await ensureOGalleryTenant(testDb.db)
  const app = createApiApp(testDb.db, testDb.storage)
  try {
    const db = testDb.db as unknown as AppDatabase
    const user = await createUser(db, { email: 'report-owner@example.com', password: 'report-password' })
    await db.insert(memberships).values({ galleryId: gallery.id, userId: user.id, role: 'owner' })
    const session = await createUserSession(db, user.id, false)
    await fn({ app, db: testDb.db, mediaRoot: testDb.mediaRoot, cookie: session.cookie })
  } finally {
    await testDb.close()
  }
}

function work(id: string, title: string, patch: Record<string, unknown> = {}) {
  return { id, title, artist: 'N. Karimi', medium: '', size: '', year: '', price: null, status: 'available', image: '', sample: false, ...patch }
}

async function publish(app: ReturnType<typeof createApiApp>, cookie: string, list: unknown[], patch: Record<string, unknown> = {}) {
  const current = await request(app).get('/api/v1/pilot')
  return request(app)
    .put('/api/v1/pilot')
    .set('Host', 'localhost').set('Origin', 'http://localhost')
    .set('Cookie', cookie)
    .send({ gallery: 'o-gallery', record: { ...current.body.record, works: list, ...patch } })
}

function upload(app: ReturnType<typeof createApiApp>, cookie: string, file: Buffer, filename: string, contentType: string) {
  return request(app)
    .post('/api/v1/uploads')
    .set('Host', 'localhost').set('Origin', 'http://localhost')
    .set('Cookie', cookie)
    .field('gallery', 'o-gallery')
    .attach('file', file, { filename, contentType })
}

async function png(width = 40, height = 30) {
  return sharp({ create: { width, height, channels: 3, background: { r: 30, g: 60, b: 90 } } }).png().toBuffer()
}

test('HAD-35 the leads CSV needs a staff session', async () => {
  await withStaff(async ({ app }) => {
    const anonymous = await request(app).get('/api/v1/pilot/staff/leads.csv?gallery=o-gallery')
    assert.equal(anonymous.status, 401)
    assert.equal(anonymous.headers['content-type']?.includes('text/csv'), false)
    const forged = await request(app).get('/api/v1/pilot/staff/leads.csv?gallery=o-gallery').set('Cookie', `${STAFF_COOKIE}=not-a-token`)
    assert.equal(forged.status, 401)
  })
})

test('HAD-35 the CSV lists each lead with the work title and blocks spreadsheet formulas', async () => {
  await withStaff(async ({ app, db, cookie }) => {
    const saved = await publish(app, cookie, [work('csvwork01', '=HYPERLINK("x")'), work('csvwork02', 'Harbour, light')])
    assert.equal(saved.status, 200)
    const { gallery, show } = await ensureOGalleryTenant(db)
    await db.insert(leads).values([
      { galleryId: gallery.id, showId: show.id, workId: 'csvwork01', phone: '09120000001', kind: 'ask', consentAt: new Date(), consentTextVersion: CONSENT_TEXT_VERSION },
      { galleryId: gallery.id, showId: show.id, workId: 'csvwork02', phone: '09120000002', kind: 'save', consentAt: new Date(), consentTextVersion: CONSENT_TEXT_VERSION },
    ])
    const csv = await request(app).get('/api/v1/pilot/staff/leads.csv?gallery=o-gallery').set('Cookie', cookie)
    assert.equal(csv.status, 200)
    assert.match(csv.headers['content-type'], /text\/csv/)
    assert.match(csv.headers['content-disposition'], /attachment; filename="o-gallery-leads-\d{4}-\d{2}-\d{2}\.csv"/)
    const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n')
    assert.equal(lines[0], 'created_at,kind,phone,work_id,work_title,consent_text_version,verified')
    assert.equal(lines.length, 3)
    assert.ok(lines.some((line) => line.includes('09120000001') && line.includes(`"'=HYPERLINK(""x"")"`)))
    assert.ok(lines.some((line) => line.includes('09120000002') && line.includes('"Harbour, light"')))
  })
})

test('HAD-35 the staff report counts days in Tehran time, views per work and leads per work', async () => {
  await withStaff(async ({ app, db, cookie }) => {
    await publish(app, cookie, [work('reportwk01', 'Harbour light'), work('reportwk02', 'Quiet field')])
    const { gallery, show } = await ensureOGalleryTenant(db)
    const lateEvening = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    lateEvening.setUTCHours(21, 0, 0, 0)
    await db.insert(visits).values([
      { showId: show.id, visitorId: 'visitor-001', kind: 'scan', day: '2026-01-01', createdAt: lateEvening },
      { showId: show.id, visitorId: 'visitor-001', kind: 'view', day: '2026-01-01', workId: 'reportwk01', createdAt: lateEvening },
      { showId: show.id, visitorId: 'visitor-002', kind: 'view', day: '2026-01-01', workId: 'reportwk01', createdAt: lateEvening },
      { showId: show.id, visitorId: 'visitor-002', kind: 'view', day: '2026-01-01', workId: 'reportwk02', createdAt: lateEvening },
    ])
    await db.insert(leads).values([
      { galleryId: gallery.id, showId: show.id, workId: 'reportwk01', phone: '09120000003', kind: 'ask', consentAt: new Date(), consentTextVersion: CONSENT_TEXT_VERSION },
      { galleryId: gallery.id, showId: show.id, workId: 'reportwk01', phone: '09120000004', kind: 'save', consentAt: new Date(), consentTextVersion: CONSENT_TEXT_VERSION },
    ])
    const report = await request(app).get('/api/v1/pilot/staff?gallery=o-gallery').set('Cookie', cookie)
    assert.equal(report.status, 200)
    const tehran = tehranDate(lateEvening)
    assert.notEqual(tehran, lateEvening.toISOString().slice(0, 10))
    assert.deepEqual(report.body.days, [{ day: tehran, scans: 1, views: 3 }])
    assert.deepEqual(report.body.works[0], { workId: 'reportwk01', title: 'Harbour light', views: 2, saves: 1, asks: 1 })
    assert.deepEqual(report.body.works[1], { workId: 'reportwk02', title: 'Quiet field', views: 1, saves: 0, asks: 0 })
    assert.equal(report.body.leads[0].workTitle, 'Harbour light')
    assert.equal(report.body.leads[0].consentTextVersion, CONSENT_TEXT_VERSION)
  })
})

test('HAD-31 removing a work keeps its lead history', async () => {
  await withStaff(async ({ app, db, cookie }) => {
    await publish(app, cookie, [work('keepwork01', 'Kept work'), work('gonework01', 'Removed work')])
    const { gallery, show } = await ensureOGalleryTenant(db)
    await db.insert(leads).values({ galleryId: gallery.id, showId: show.id, workId: 'gonework01', phone: '09120000005', kind: 'ask', consentAt: new Date(), consentTextVersion: CONSENT_TEXT_VERSION })
    const after = await publish(app, cookie, [work('keepwork01', 'Kept work')])
    assert.equal(after.status, 200)
    assert.deepEqual(after.body.record.works.map((item: { id: string }) => item.id), ['keepwork01'])
    const [gone] = await db.select().from(works).where(eq(works.id, 'gonework01'))
    assert.ok(gone.removedAt instanceof Date)
    const [lead] = await db.select().from(leads).where(eq(leads.phone, '09120000005'))
    assert.equal(lead.workId, 'gonework01')
    const report = await request(app).get('/api/v1/pilot/staff?gallery=o-gallery').set('Cookie', cookie)
    assert.equal(report.body.leads[0].workTitle, 'Removed work')
    const newLead = await request(app).post('/api/v1/pilot').send({
      op: 'lead', kind: 'ask', phone: '09120000006', visitorId: 'visitor-003', workId: 'gonework01', consent: true, consentTextVersion: CONSENT_TEXT_VERSION,
    })
    assert.equal(newLead.status, 400)
    const back = await publish(app, cookie, [work('keepwork01', 'Kept work'), work('gonework01', 'Removed work')])
    assert.equal(back.body.record.works.length, 2)
    const [restored] = await db.select().from(works).where(eq(works.id, 'gonework01'))
    assert.equal(restored.removedAt, null)
  })
})

test('HAD-32 uploads sniff the real type and refuse text, SVG, GIF and oversized files', async () => {
  await withStaff(async ({ app, cookie }) => {
    const wrongType = await upload(app, cookie, await png(), 'photo.jpg', 'image/jpeg')
    assert.equal(wrongType.status, 201)
    assert.match(wrongType.body.url, /^\/media\/u\/galleries\/o-gallery\//)

    const text = await upload(app, cookie, Buffer.from('hello, this is not an image'), 'photo.png', 'image/png')
    assert.equal(text.status, 400)
    assert.equal(text.body.error, 'Use a PNG, JPEG, or WebP image.')
    assert.equal(text.body.errorFa, 'یک تصویر PNG، JPEG یا WebP انتخاب کنید.')

    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')
    const svgUpload = await upload(app, cookie, svg, 'logo.png', 'image/png')
    assert.equal(svgUpload.status, 400)
    assert.equal(svgUpload.body.error, 'Use a PNG, JPEG, or WebP image.')

    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } }).gif().toBuffer()
    const gifUpload = await upload(app, cookie, gif, 'anim.png', 'image/png')
    assert.equal(gifUpload.status, 400)

    const big = Buffer.concat([await png(), Buffer.alloc(8 * 1024 * 1024)])
    const tooBig = await upload(app, cookie, big, 'big.png', 'image/png')
    assert.equal(tooBig.status, 413)
    assert.equal(tooBig.body.error, 'Use an image smaller than 8 MB.')

    const anonymous = await request(app).post('/api/v1/uploads').field('gallery', 'o-gallery').attach('file', await png(), 'a.png')
    assert.equal(anonymous.status, 401)
  })
})

test('HAD-32 stored variants drop EXIF data', async () => {
  await withStaff(async ({ app, cookie, mediaRoot }) => {
    const withExif = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#a33' } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'secret-camera-owner' } } })
      .toBuffer()
    assert.ok((await sharp(withExif).metadata()).exif)
    const saved = await upload(app, cookie, withExif, 'camera.jpg', 'image/jpeg')
    assert.equal(saved.status, 201)
    for (const url of Object.values(saved.body.variants as Record<string, string>)) {
      const file = path.join(mediaRoot, url.replace(/^\/media\//, ''))
      const meta = await sharp(fs.readFileSync(file)).metadata()
      assert.equal(meta.exif, undefined, url)
    }
  })
})

test('HAD-32 a publish body with a data URL is refused and a small JSON limit applies', async () => {
  await withStaff(async ({ app, cookie }) => {
    const dataUrl = `data:image/png;base64,${(await png()).toString('base64')}`
    const inline = await publish(app, cookie, [work('inlinewk01', 'Inline', { image: dataUrl })])
    assert.equal(inline.status, 400)
    assert.equal(inline.body.error, 'Upload the image with the upload button first.')
    const logo = await publish(app, cookie, [], { logo: dataUrl })
    assert.equal(logo.status, 400)

    const saved = await upload(app, cookie, await png(), 'work.png', 'image/png')
    const linked = await publish(app, cookie, [work('linkedwk01', 'Linked', { image: saved.body.url })], { logo: saved.body.url })
    assert.equal(linked.status, 200)
    assert.equal(linked.body.record.works[0].image, saved.body.url)
    assert.equal(linked.body.record.logo, saved.body.url)
    const again = await publish(app, cookie, linked.body.record.works, { logo: linked.body.record.logo })
    assert.equal(again.body.record.logo, saved.body.url)

    const forged = await publish(app, cookie, [work('forgedwk01', 'Forged', { image: '/media/u/galleries/o-gallery/made-up/w640.webp' })])
    assert.equal(forged.status, 400)

    const huge = await request(app)
      .put('/api/v1/pilot')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ record: { name: 'x'.repeat(300 * 1024) } }))
    assert.equal(huge.status, 413)
  })
})
