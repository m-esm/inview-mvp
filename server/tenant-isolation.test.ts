import { readFile } from 'node:fs/promises'
import test from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { CONSENT_TEXT_VERSION, leadBody } from '../app/lib/consent.ts'
import { loadGalleryPage, loadWorkPage } from '../app/routes/pilot.server.ts'
import { DatabaseContext } from '../database/context.ts'
import { galleries, leads, media, qrCodes, shows, showWorks, visits, works } from '../database/schema.ts'
import { createApiApp } from './api-app.ts'
import { hashSecret } from './crypto.ts'
import {
  isDemoGallery,
  leadsCsvForSession,
  loadPublicRecord,
  loadStaffRecord,
  publishGalleryRecordForSession,
  readStaffReportForSession,
  recordLead,
  recordVisit,
  tenantById,
  tenantBySlug,
} from './gallery-record.ts'
import { rateLimitConfig, runPilotRequest } from './rate-limit.ts'
import { signInWithAccessCode } from './staff-session.ts'
import { createTestDb } from './test-db.ts'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function fixture() {
  const testDb = await createTestDb()
  const { db, storage } = testDb
  const tenants = []
  for (const [index, slug] of ['tenant-a', 'tenant-b'].entries()) {
    const code = `code-${slug}`
    const [gallery] = await db.insert(galleries).values({ slug, nameEn: slug, nameFa: slug, accessCodeHash: hashSecret(code) }).returning()
    const [show] = await db.insert(shows).values({ galleryId: gallery.id, titleEn: `${slug}-show` }).returning()
    const workId = `${slug}-work`
    await db.insert(works).values({ id: workId, galleryId: gallery.id, title: `${slug}-title`, priceToman: 1000 })
    await db.insert(showWorks).values({ showId: show.id, workId })
    const [qr] = await db.insert(qrCodes).values({ showId: show.id, code: `${slug}-qr` }).returning()
    const tenant = (await tenantById(db, gallery.id))!
    const visitorId = `${slug}-visitor`
    const phone = `0912000000${index}`
    assert.equal((await recordVisit(db, tenant, 'scan', visitorId, null, qr.code)).status, 200)
    assert.equal((await recordVisit(db, tenant, 'view', visitorId, workId)).status, 200)
    assert.equal((await recordLead(db, tenant, phone, 'ask', visitorId, workId, true, CONSENT_TEXT_VERSION)).status, 200)
    const session = await signInWithAccessCode(db, code, slug)
    assert.ok(session)
    tenants.push({ tenant, workId, qr, visitorId, phone, code, cookie: `inview_staff=${session.token}` })
  }
  return { ...testDb, tenants, app: createApiApp(db, storage) }
}

for (const index of [0, 1]) {
  test(`tenant ${index} public reads, staff reports and CSV contain only its own rows`, async () => {
    const f = await fixture()
    try {
      const own = f.tenants[index]
      const other = f.tenants[1 - index]
      const id = own.tenant.gallery.id
      assert.equal((await tenantBySlug(f.db, own.tenant.gallery.slug))?.gallery.id, id)
      const record = await loadPublicRecord(f.db, own.tenant)
      assert.deepEqual(record.record.works.map((work) => work.id), [own.workId])
      assert.equal(JSON.stringify(record).includes(other.tenant.gallery.slug), false)
      assert.equal(JSON.stringify(record).includes(own.phone), false)
      const page = await DatabaseContext.run(f.db, () => loadGalleryPage(new Request(`http://inview.test/g/${own.tenant.gallery.slug}`), own.tenant.gallery.slug))
      assert.deepEqual(page.pilot?.works.map((work) => work.id), [own.workId])
      const report = await readStaffReportForSession(f.db, id)
      assert.equal(report.status, 200)
      if (report.status !== 200) throw new Error('Missing report')
      assert.deepEqual(report.body.visits, { scans: 1, views: 1 })
      assert.deepEqual(report.body.works.map((work) => work.workId), [own.workId])
      assert.deepEqual(report.body.leads.map((lead) => lead.phone), [own.phone])
      assert.equal(JSON.stringify(report).includes(other.workId), false)
      const csv = await leadsCsvForSession(f.db, id)
      assert.equal(csv.status, 200)
      assert.ok(String(csv.body).includes(own.phone))
      assert.ok(String(csv.body).includes(own.workId))
      assert.equal(String(csv.body).includes(other.phone), false)
      assert.equal(String(csv.body).includes(other.workId), false)
      const httpReport = await request(f.app).get('/api/v1/pilot/staff').set('Cookie', own.cookie)
      assert.equal(httpReport.status, 200)
      assert.deepEqual(httpReport.body, report.body)
      const httpCsv = await request(f.app).get('/api/v1/pilot/staff/leads.csv').set('Cookie', own.cookie)
      assert.equal(httpCsv.status, 200)
      assert.equal(httpCsv.text, csv.body)
      assert.ok(httpCsv.headers['content-disposition'].includes(`${own.tenant.gallery.slug}-leads-`))
      const publicApi = await request(f.app).get(`/api/v1/pilot?gallery=${own.tenant.gallery.slug}`)
      assert.equal(publicApi.status, 200)
      assert.deepEqual(publicApi.body, record)
    } finally {
      await f.close()
    }
  })

  test(`tenant ${index} cannot attach foreign works, QR codes, records or media`, async () => {
    const f = await fixture()
    try {
      const own = f.tenants[index]
      const other = f.tenants[1 - index]
      const otherBefore = await loadPublicRecord(f.db, other.tenant)
      assert.equal((await recordVisit(f.db, own.tenant, 'scan', `${own.visitorId}-cross`, null, other.qr.code)).status, 200)
      assert.equal((await recordVisit(f.db, own.tenant, 'view', own.visitorId, other.workId)).status, 200)
      const visitRows = await f.db.select().from(visits).where(eq(visits.showId, own.tenant.show.id))
      assert.equal(visitRows.length, 4)
      assert.ok(visitRows.every((row) => row.qrCodeId !== other.qr.id && row.workId !== other.workId))
      assert.equal((await recordLead(f.db, own.tenant, own.phone, 'save', own.visitorId, other.workId, true, CONSENT_TEXT_VERSION)).status, 400)
      assert.equal((await f.db.select().from(leads)).length, 2)
      const ownRecord = (await loadPublicRecord(f.db, own.tenant)).record
      const crossed = await publishGalleryRecordForSession(f.db, f.storage, own.tenant.gallery.id, { ...ownRecord, works: otherBefore.record.works })
      assert.equal(crossed.status, 400)
      assert.equal((await publishGalleryRecordForSession(f.db, f.storage, own.tenant.gallery.id, otherBefore.record)).status, 400)
      const crossApi = await request(f.app).put('/api/v1/pilot').set('Cookie', own.cookie).send({ gallery: other.tenant.gallery.slug, record: otherBefore.record })
      assert.equal(crossApi.status, 401)
      const wrongCode = await request(f.app).put('/api/v1/pilot').send({ gallery: other.tenant.gallery.slug, accessCode: own.code, record: otherBefore.record })
      assert.equal(wrongCode.status, 401)
      const foreignUpload = await request(f.app).post('/api/v1/uploads').set('Cookie', own.cookie).send({ gallery: other.tenant.gallery.slug, dataBase64: PNG })
      assert.equal(foreignUpload.status, 401)
      assert.equal((await f.db.select().from(media)).length, 0)
      const ownUpload = await request(f.app).post('/api/v1/uploads').set('Cookie', own.cookie).send({ dataBase64: PNG })
      assert.equal(ownUpload.status, 201)
      const [uploaded] = await f.db.select().from(media)
      assert.equal(uploaded.galleryId, own.tenant.gallery.id)
      assert.ok(uploaded.s3Key.includes(`/galleries/${own.tenant.gallery.slug}/`))
      const stolen = await publishGalleryRecordForSession(f.db, f.storage, other.tenant.gallery.id, {
        ...otherBefore.record, works: [{ ...otherBefore.record.works[0], image: ownUpload.body.url }],
      })
      assert.equal(stolen.status, 400)
      const published = await publishGalleryRecordForSession(f.db, f.storage, own.tenant.gallery.id, {
        ...ownRecord, name: `${own.tenant.gallery.slug}-changed`, works: [{ ...ownRecord.works[0], image: ownUpload.body.url }],
      })
      assert.equal(published.status, 200)
      assert.deepEqual(await loadPublicRecord(f.db, other.tenant), otherBefore)
      const [ownWork] = await f.db.select().from(works).where(eq(works.id, own.workId))
      assert.equal(ownWork.mediaId, uploaded.id)
      await assert.rejects(
        DatabaseContext.run(f.db, () => loadWorkPage(new Request('http://inview.test/g/'), own.tenant.gallery.slug, other.workId)),
        (error: unknown) => error instanceof Response && error.status === 404,
      )
    } finally {
      await f.close()
    }
  })
}

for (const status of ['draft', 'paused'] as const) {
  test(`${status} galleries return localized 404s on visitor paths, including warmed caches`, async () => {
    const f = await fixture()
    try {
      for (const own of f.tenants) {
        await loadPublicRecord(f.db, own.tenant)
        await f.db.update(galleries).set({ status }).where(eq(galleries.id, own.tenant.gallery.id))
        await assert.rejects(loadPublicRecord(f.db, own.tenant), (error: unknown) => error instanceof Response && error.status === 404)
        for (const suffix of ['', '/works', '/prices', '/about']) {
          await assert.rejects(
            DatabaseContext.run(f.db, () => loadGalleryPage(new Request(`http://inview.test/g/${own.tenant.gallery.slug}${suffix}`), own.tenant.gallery.slug)),
            (error: unknown) => error instanceof Response && error.status === 404,
          )
        }
        const read = await request(f.app).get(`/api/v1/pilot?gallery=${own.tenant.gallery.slug}`)
        assert.equal(read.status, 404)
        assert.equal(typeof read.body.errorFa, 'string')
        for (const body of [
          { op: 'visit', kind: 'scan', visitorId: own.visitorId },
          leadBody({ phone: own.phone, kind: 'ask', visitorId: own.visitorId, workId: own.workId }),
        ]) {
          const response = await request(f.app).post('/api/v1/pilot').send({ ...body, gallery: own.tenant.gallery.slug })
          assert.equal(response.status, 404)
          assert.equal(typeof response.body.errorFa, 'string')
        }
        const limits = rateLimitConfig({ NODE_ENV: 'test', RATE_LIMIT_VISIT_VISITOR_MAX: '1' })
        for (let attempt = 0; attempt < 2; attempt += 1) {
          assert.equal((await runPilotRequest(f.db, f.storage, 'POST', { op: 'visit', kind: 'scan', visitorId: own.visitorId, gallery: own.tenant.gallery.slug }, '127.0.0.1', new Date(), limits)).status, 404)
        }
        assert.equal((await recordVisit(f.db, own.tenant, 'view', own.visitorId, own.workId)).status, 404)
        assert.equal((await recordLead(f.db, own.tenant, own.phone, 'ask', own.visitorId, own.workId, true, CONSENT_TEXT_VERSION)).status, 404)
        const staff = await loadStaffRecord(f.db, (await tenantById(f.db, own.tenant.gallery.id))!)
        assert.equal(staff.record.slug, own.tenant.gallery.slug)
        assert.equal((await publishGalleryRecordForSession(f.db, f.storage, own.tenant.gallery.id, staff.record)).status, 200)
      }
      assert.equal((await f.db.select().from(visits)).length, 4)
      assert.equal((await f.db.select().from(leads)).length, 2)
    } finally {
      await f.close()
    }
  })
}

test('demo status comes from the row and tenant resolution does not bootstrap a missing gallery', async () => {
  const f = await fixture()
  try {
    assert.equal(await tenantBySlug(f.db, 'o-gallery'), null)
    assert.equal((await request(f.app).get('/api/v1/pilot')).status, 404)
    assert.equal((await request(f.app).put('/api/v1/pilot').send({ gallery: 'x'.repeat(300), accessCode: 'wrong' })).status, 404)
    assert.equal((await f.db.select().from(galleries)).length, 2)
    const own = f.tenants[0]
    assert.equal(isDemoGallery(own.tenant.gallery), false)
    await f.db.update(galleries).set({ isDemo: true, updatedAt: new Date(Date.now() + 1000) }).where(eq(galleries.id, own.tenant.gallery.id))
    assert.equal((await loadPublicRecord(f.db, own.tenant)).record.demo, true)
  } finally {
    await f.close()
  }
})

test('the demo migration backfills existing sample rows and defaults other galleries to false', async () => {
  const f = await createTestDb()
  try {
    await f.client.exec("ALTER TABLE galleries DROP COLUMN is_demo; INSERT INTO galleries (slug, name_en, name_fa) VALUES ('sample', 'Sample', 'Sample'), ('real-gallery', 'Real', 'Real')")
    await f.client.exec(await readFile(new URL('../drizzle/0007_gallery_demo.sql', import.meta.url), 'utf8'))
    const rows = await f.db.select({ slug: galleries.slug, demo: galleries.isDemo }).from(galleries)
    assert.deepEqual(Object.fromEntries(rows.map((row) => [row.slug, row.demo])), { sample: true, 'real-gallery': false })
    await f.db.insert(galleries).values({ slug: 'new-gallery', nameEn: 'New', nameFa: 'New' })
    const [created] = await f.db.select().from(galleries).where(eq(galleries.slug, 'new-gallery'))
    assert.equal(created.isDemo, false)
  } finally {
    await f.close()
  }
})
