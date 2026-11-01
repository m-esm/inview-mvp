import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
delete process.env.O_GALLERY_ACCESS_CODE

import { eq, like } from 'drizzle-orm'
import request from 'supertest'
import { leadBody } from '../app/lib/consent.ts'
import { galleryPageMeta } from '../app/lib/meta.ts'
import { loadGalleryPage, loadWorkPage } from '../app/routes/pilot.server.ts'
import { DatabaseContext } from '../database/context.ts'
import { galleries, leads, qrCodes, rateLimits, showWorks, shows, visits, works } from '../database/schema.ts'
import { createApiApp } from './api-app.ts'
import { ensureOGalleryTenant } from './gallery-bootstrap.ts'
import { loadPublicRecord, tenantBySlug } from './gallery-record.ts'
import { createTestDb } from './test-db.ts'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

const VISITOR = 'slug-visitor-1'
const SAMPLE_WORK = 'sample-test-work-1'

async function addSampleGallery(db: TestDb['db']) {
  const [gallery] = await db
    .insert(galleries)
    .values({ slug: 'sample', isDemo: true, nameEn: 'Sample Gallery', nameFa: 'گالری نمونه' })
    .returning()
  const [show] = await db
    .insert(shows)
    .values({ galleryId: gallery.id, titleEn: 'Salt and Light', titleFa: 'نمک و نور', status: 'published' })
    .returning()
  await db.insert(works).values({
    id: SAMPLE_WORK,
    galleryId: gallery.id,
    title: 'Blue Hour',
    titleFa: 'ساعت آبی',
    artist: 'Mina Rahbar',
    status: 'available',
    priceToman: 45000000,
  })
  await db.insert(showWorks).values({ showId: show.id, workId: SAMPLE_WORK, sortOrder: 0 })
  await db.insert(qrCodes).values({ showId: show.id, code: 'sample-entrance', label: 'Entrance' })
  return { gallery, show }
}

async function withGalleries(
  fn: (args: { db: TestDb['db']; app: ReturnType<typeof createApiApp>; sample: Awaited<ReturnType<typeof addSampleGallery>> }) => Promise<void>,
) {
  const testDb = await createTestDb()
  try {
    await ensureOGalleryTenant(testDb.db)
    const sample = await addSampleGallery(testDb.db)
    await fn({ db: testDb.db, app: createApiApp(testDb.db, testDb.storage), sample })
  } finally {
    await testDb.close()
  }
}

function pageRequest(path: string) {
  return new Request(`http://inview.test${path}`)
}

async function rejection(task: Promise<unknown>): Promise<Response> {
  try {
    await task
  } catch (thrown) {
    assert.ok(thrown instanceof Response)
    return thrown
  }
  throw new Error('The loader resolved instead of answering with a status.')
}

test('tenantBySlug finds a gallery row by slug and refuses unknown or malformed slugs', async () => {
  await withGalleries(async ({ db, sample }) => {
    const found = await tenantBySlug(db, 'sample')
    assert.equal(found?.gallery.id, sample.gallery.id)
    assert.equal(found?.show.id, sample.show.id)
    assert.equal(await tenantBySlug(db, 'nope'), null)
    assert.equal(await tenantBySlug(db, '../o-gallery'), null)
    assert.equal(await tenantBySlug(db, ''), null)
    assert.equal((await tenantBySlug(db, 'o-gallery'))?.gallery.slug, 'o-gallery')
  })
})

test('tenantBySlug keeps the published show when a newer draft exists', async () => {
  await withGalleries(async ({ db, sample }) => {
    await db
      .insert(shows)
      .values({ galleryId: sample.gallery.id, titleEn: 'Next season', titleFa: 'فصل بعد', status: 'draft', updatedAt: new Date(Date.now() + 60_000) })
    assert.equal((await tenantBySlug(db, 'sample'))?.show.id, sample.show.id)
  })
})

test('the /g/:slug loader serves a database gallery by slug and marks a demo', async () => {
  await withGalleries(async ({ db }) => {
    const run = <T>(task: () => Promise<T>) => DatabaseContext.run(db, task)
    const page = await run(() => loadGalleryPage(pageRequest('/g/sample'), 'sample'))
    assert.equal(page.pilot?.slug, 'sample')
    assert.equal(page.pilot?.demo, true)
    assert.equal(page.pilot?.name, 'Sample Gallery')
    assert.deepEqual(page.pilot?.works.map((work) => work.id), [SAMPLE_WORK])

    const o = await run(() => loadGalleryPage(pageRequest('/g/o-gallery'), 'o-gallery'))
    assert.equal(o.pilot?.slug, 'o-gallery')
    assert.equal(o.pilot?.demo, false)
    assert.equal(o.pilot?.works.length, 0)

    const work = await run(() => loadWorkPage(pageRequest(`/g/sample/works/${SAMPLE_WORK}`), 'sample', SAMPLE_WORK))
    assert.equal(work.work?.title, 'Blue Hour')

    const crossed = await rejection(
      run(() => loadWorkPage(pageRequest(`/g/o-gallery/works/${SAMPLE_WORK}`), 'o-gallery', SAMPLE_WORK)),
    )
    assert.equal(crossed.status, 404)
    const unknown = await rejection(run(() => loadGalleryPage(pageRequest('/g/nope'), 'nope')))
    assert.equal(unknown.status, 404)
  })
})

test('the public record cache keeps one copy for each gallery', async () => {
  await withGalleries(async ({ db, sample }) => {
    const o = await loadPublicRecord(db, (await tenantBySlug(db, 'o-gallery'))!)
    const s = await loadPublicRecord(db, sample)
    assert.equal(o.record.slug, 'o-gallery')
    assert.equal(s.record.slug, 'sample')
    assert.equal((await loadPublicRecord(db, sample)).record.slug, 'sample')
    assert.equal((await loadPublicRecord(db, (await tenantBySlug(db, 'o-gallery'))!)).record.slug, 'o-gallery')
  })
})

test('a demo gallery page carries noindex and O Gallery does not', async () => {
  await withGalleries(async ({ db, sample }) => {
    const matches = [{ id: 'root', data: { lang: 'en', origin: 'https://inview.test' } }]
    const demo = await loadPublicRecord(db, sample)
    const o = await loadPublicRecord(db, (await tenantBySlug(db, 'o-gallery'))!)
    const robots = (tags: Record<string, string>[]) => tags.find((tag) => tag.name === 'robots')?.content
    assert.equal(robots(galleryPageMeta('show', matches, '/g/sample', { pilot: demo.record })), 'noindex')
    assert.equal(robots(galleryPageMeta('works', matches, '/g/sample/works', { pilot: demo.record })), 'noindex')
    assert.equal(
      robots(galleryPageMeta('work', matches, `/g/sample/works/${SAMPLE_WORK}`, { pilot: demo.record, work: demo.record.works[0] })),
      'noindex',
    )
    assert.equal(robots(galleryPageMeta('show', matches, '/g/o-gallery', { pilot: o.record })), undefined)
  })
})

test('the public API reads a gallery by its slug and answers 404 for an unknown slug', async () => {
  await withGalleries(async ({ app }) => {
    const sample = await request(app).get('/api/v1/pilot?gallery=sample')
    assert.equal(sample.status, 200)
    assert.equal(sample.body.record.slug, 'sample')
    const fallback = await request(app).get('/api/v1/pilot')
    assert.equal(fallback.body.record.slug, 'o-gallery')
    const unknown = await request(app).get('/api/v1/pilot?gallery=nope')
    assert.equal(unknown.status, 404)
    const unknownPost = await request(app)
      .post('/api/v1/pilot')
      .send({ op: 'visit', gallery: 'nope', kind: 'scan', visitorId: VISITOR })
    assert.equal(unknownPost.status, 404)
  })
})

test('visits, QR scans, leads and rate limits from a sample page belong to the sample gallery', async () => {
  await withGalleries(async ({ db, app, sample }) => {
    const o = await ensureOGalleryTenant(db)
    const scan = await request(app)
      .post('/api/v1/pilot')
      .send({ op: 'visit', gallery: 'sample', kind: 'scan', visitorId: VISITOR, qrCode: 'sample-entrance' })
    assert.equal(scan.status, 200)
    const view = await request(app)
      .post('/api/v1/pilot')
      .send({ op: 'visit', gallery: 'sample', kind: 'view', visitorId: VISITOR, workId: SAMPLE_WORK })
    assert.equal(view.status, 200)
    const lead = await request(app)
      .post('/api/v1/pilot')
      .send({ ...leadBody({ phone: '09121234567', kind: 'ask', workId: SAMPLE_WORK, visitorId: VISITOR }), gallery: 'sample' })
    assert.equal(lead.status, 200)

    const [qr] = await db.select().from(qrCodes).where(eq(qrCodes.code, 'sample-entrance'))
    const visitRows = await db.select().from(visits)
    assert.equal(visitRows.length, 2)
    assert.ok(visitRows.every((row) => row.showId === sample.show.id))
    assert.equal(visitRows.find((row) => row.kind === 'scan')?.qrCodeId, qr.id)
    assert.equal(visitRows.find((row) => row.kind === 'view')?.workId, SAMPLE_WORK)

    const leadRows = await db.select().from(leads)
    assert.equal(leadRows.length, 1)
    assert.equal(leadRows[0].galleryId, sample.gallery.id)
    assert.equal(leadRows[0].showId, sample.show.id)
    assert.equal((await db.select().from(leads).where(eq(leads.galleryId, o.gallery.id))).length, 0)
    assert.equal((await db.select().from(visits).where(eq(visits.showId, o.show.id))).length, 0)

    const sampleBuckets = await db.select().from(rateLimits).where(like(rateLimits.bucket, '%:gallery:sample:%'))
    assert.equal(sampleBuckets.length, 4)
    assert.equal((await db.select().from(rateLimits).where(like(rateLimits.bucket, '%o-gallery%'))).length, 0)
  })
})

test('a sample work id does not count against O Gallery and an O lead cannot name it', async () => {
  await withGalleries(async ({ db, app }) => {
    const o = await ensureOGalleryTenant(db)
    const view = await request(app)
      .post('/api/v1/pilot')
      .send({ op: 'visit', kind: 'view', visitorId: VISITOR, workId: SAMPLE_WORK })
    assert.equal(view.status, 200)
    const [row] = await db.select().from(visits)
    assert.equal(row.showId, o.show.id)
    assert.equal(row.workId, null)

    const lead = await request(app)
      .post('/api/v1/pilot')
      .send(leadBody({ phone: '09121234567', kind: 'save', workId: SAMPLE_WORK, visitorId: VISITOR }))
    assert.equal(lead.status, 400)
    assert.equal((await db.select().from(leads)).length, 0)
  })
})
