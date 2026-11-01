import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
delete process.env.O_GALLERY_ACCESS_CODE

import { eq } from 'drizzle-orm'
import request from 'supertest'
import { CONSENT_TEXT_VERSION } from '../app/lib/consent.ts'
import { galleries, media, works } from '../database/schema.ts'
import { createApiApp } from './api-app.ts'
import { createTestDb } from './test-db.ts'

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const VISITOR = 'browser-a1'

function sampleWork(patch: Record<string, unknown> = {}) {
  return {
    id: 'samplework1',
    title: 'Sample work',
    artist: '',
    sample: true,
    price: 125000,
    status: 'available',
    medium: '',
    size: '',
    year: '',
    image: '',
    ...patch,
  }
}

async function withApp(client: string, fn: (args: { app: ReturnType<typeof createApiApp>; db: Awaited<ReturnType<typeof createTestDb>>['db'] }) => Promise<void>) {
  const testDb = await createTestDb()
  const app = createApiApp(testDb.db, testDb.storage)
  try {
    await fn({ app, db: testDb.db })
  } finally {
    await testDb.close()
  }
  void client
}

function http(app: ReturnType<typeof createApiApp>, client: string) {
  return {
    get(path: string) {
      return request(app).get(path).set('x-test-client', client)
    },
    post(path: string) {
      return request(app).post(path).set('x-test-client', client)
    },
    put(path: string) {
      return request(app).put(path).set('x-test-client', client)
    },
    patch(path: string) {
      return request(app).patch(path).set('x-test-client', client)
    },
  }
}

test('health, unknown API and method errors', async () => {
  await withApp('health', async ({ app }) => {
    const api = http(app, 'health')
    const health = await api.get('/api/v1/health')
    assert.equal(health.status, 200)
    assert.equal(health.body.ok, true)
    assert.equal(health.body.service, 'inview-mvp')
    assert.match(String(health.headers['cache-control']), /no-store/)

    const missing = await api.get('/api/v1/does-not-exist')
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error, 'Not found.')

    const method = await api.patch('/api/v1/pilot').send({})
    assert.equal(method.status, 405)
  })
})

test('HAD-24 public reads and visitor posts hide phone numbers', async () => {
  await withApp('privacy', async ({ app }) => {
    const api = http(app, 'privacy')
    const first = await api.get('/api/v1/pilot')
    assert.equal(first.status, 200)
    assert.equal(first.body.record.slug, 'o-gallery')
    assert.equal('leads' in first.body, false)
    assert.equal('visits' in first.body, false)

    const alias = await api.get('/api/pilot')
    assert.equal(alias.status, 200)
    assert.equal('leads' in alias.body, false)

    const published = await api.put('/api/v1/pilot').send({
      accessCode: 'inview',
      record: { ...first.body.record, works: [sampleWork()] },
    })
    assert.equal(published.status, 200)
    assert.equal(published.body.record.works[0].title, 'Sample work')
    // Chosen rule: a successful PUT returns { ok: true, record } only.
    // Lead phone numbers and visit counts stay on GET /api/pilot/staff
    // with the X-Access-Code header. PR 14 made staff a GET.
    assert.equal('leads' in published.body, false)
    assert.equal('visits' in published.body, false)

    const denied = await api.put('/api/pilot').send({
      accessCode: 'nope',
      record: first.body.record,
    })
    assert.equal(denied.status, 401)

    const scan1 = await api.post('/api/v1/pilot').send({ op: 'visit', kind: 'scan', visitorId: VISITOR })
    const scan2 = await api.post('/api/pilot').send({ op: 'visit', kind: 'scan', visitorId: VISITOR })
    assert.equal(scan1.body.counted, true)
    assert.equal(scan2.body.duplicate, true)
    assert.equal(JSON.stringify(scan1.body).includes('leads'), false)

    const view = await api.post('/api/v1/pilot').send({
      op: 'visit',
      kind: 'view',
      visitorId: VISITOR,
      workId: 'samplework1',
    })
    assert.equal(view.status, 200)
    assert.equal(view.body.ok, true)

    const badPhone = await api.post('/api/v1/pilot').send({
      op: 'lead',
      kind: 'save',
      visitorId: VISITOR,
      phone: '123',
    })
    assert.equal(badPhone.status, 400)

    const lead = await api.post('/api/pilot').send({
      op: 'lead',
      kind: 'save',
      visitorId: VISITOR,
      phone: '09120000000',
      workId: 'samplework1',
      consent: true,
      consentTextVersion: CONSENT_TEXT_VERSION,
    })
    assert.equal(lead.status, 200)
    assert.equal(lead.body.ok, true)
    assert.equal(JSON.stringify(lead.body).includes('09120000000'), false)

    const ask = await api.post('/api/pilot').send({
      op: 'lead',
      kind: 'ask',
      visitorId: VISITOR,
      phone: '09121111111',
      workId: 'samplework1',
      consent: true,
      consentTextVersion: CONSENT_TEXT_VERSION,
    })
    assert.equal(ask.status, 200)
    assert.equal(ask.body.ok, true)
    assert.equal(JSON.stringify(ask.body).includes('09121111111'), false)

    const publicAfter = await api.get('/api/v1/pilot')
    assert.equal(JSON.stringify(publicAfter.body).includes('09120000000'), false)
    assert.equal(JSON.stringify(publicAfter.body).includes('09121111111'), false)
    assert.equal('leads' in publicAfter.body, false)

    const publishedAfterLead = await api.put('/api/pilot').send({
      accessCode: 'inview',
      record: { ...first.body.record, works: [sampleWork()] },
    })
    assert.equal(publishedAfterLead.status, 200)
    assert.equal('leads' in publishedAfterLead.body, false)
    assert.equal('visits' in publishedAfterLead.body, false)
    assert.equal(JSON.stringify(publishedAfterLead.body).includes('09120000000'), false)
    assert.equal(JSON.stringify(publishedAfterLead.body).includes('09121111111'), false)

    const staffDenied = await api.get('/api/v1/pilot/staff').set('x-access-code', 'nope')
    assert.equal(staffDenied.status, 401)

    const staff = await api.get('/api/pilot/staff').set('x-access-code', 'inview')
    assert.equal(staff.status, 200)
    assert.equal(staff.body.visits.scans, 1)
    assert.equal(staff.body.visits.views, 1)
    const phones = staff.body.leads.map((item: { phone: string; kind: string }) => `${item.kind}:${item.phone}`)
    assert.equal(phones.includes('save:09120000000'), true)
    assert.equal(phones.includes('ask:09121111111'), true)
  })
})

test('HAD-25 a wrong access code is rejected and the configured code publishes', async () => {
  await withApp('access', async ({ app }) => {
    const api = http(app, 'access')
    const first = await api.get('/api/v1/pilot')
    const denied = await api.put('/api/v1/pilot').send({
      password: 'wrong-code',
      record: { ...first.body.record, works: [sampleWork()] },
    })
    assert.equal(denied.status, 401)
    const published = await api.put('/api/v1/pilot').send({
      accessCode: 'inview',
      record: { ...first.body.record, works: [sampleWork({ price: '1,000,000' })] },
    })
    assert.equal(published.status, 200)
    assert.equal(published.body.record.works[0].price, 1000000)
  })
})

test('HAD-31 publish keeps a logo, rejects a foreign work, and keeps the show on a bad image', async () => {
  await withApp('publish', async ({ app, db }) => {
    const api = http(app, 'publish')
    const first = await api.get('/api/v1/pilot')
    const [gallery] = await db.select().from(galleries).where(eq(galleries.slug, 'o-gallery')).limit(1)
    const [logo] = await db
      .insert(media)
      .values({
        galleryId: gallery.id,
        s3Key: 'galleries/o-gallery/logo/original.jpg',
        width: 8,
        height: 8,
        variants: { 'w640.webp': '/media/galleries/o-gallery/logo/w640.webp' },
      })
      .returning()
    await db.update(galleries).set({ logoMediaId: logo.id }).where(eq(galleries.id, gallery.id))

    const logoUrl = '/media/galleries/o-gallery/logo/w640.webp'
    const saved = await api.put('/api/v1/pilot').send({
      accessCode: 'inview',
      record: { ...first.body.record, logo: logoUrl, works: [sampleWork()] },
    })
    assert.equal(saved.status, 200)
    assert.equal(saved.body.record.logo, logoUrl)

    const omitted = { ...saved.body.record }
    delete omitted.logo
    const kept = await api.put('/api/v1/pilot').send({
      accessCode: 'inview',
      record: { ...omitted, works: [sampleWork({ price: '۱٬۰۰۰٬۰۰۰' })] },
    })
    assert.equal(kept.status, 200)
    assert.equal(kept.body.record.logo, logoUrl)
    assert.equal(kept.body.record.works[0].price, 1000000)

    const [other] = await db
      .insert(galleries)
      .values({
        slug: 'other-gallery',
        nameEn: 'Other',
        nameFa: 'دیگر',
        subdomain: 'other',
      })
      .returning()
    await db.insert(works).values({
      id: 'otherwork1',
      galleryId: other.id,
      title: 'Other title',
      artist: 'Other artist',
    })
    const stolen = await api.put('/api/v1/pilot').send({
      accessCode: 'inview',
      record: {
        ...kept.body.record,
        works: [sampleWork(), sampleWork({ id: 'otherwork1', title: 'Stolen', sample: false })],
      },
    })
    assert.equal(stolen.status, 400)
    const [otherWork] = await db.select().from(works).where(eq(works.id, 'otherwork1')).limit(1)
    assert.equal(otherWork.title, 'Other title')
    assert.equal(otherWork.galleryId, other.id)
    const still = await api.get('/api/v1/pilot')
    assert.equal(still.body.record.works.length, 1)
    assert.equal(still.body.record.works[0].id, 'samplework1')
    assert.equal(still.body.record.logo, logoUrl)

    const hotlink = await api.put('/api/v1/pilot').send({
      accessCode: 'inview',
      record: {
        ...still.body.record,
        works: [sampleWork({ image: 'https://example.com/hot.jpg' })],
      },
    })
    assert.equal(hotlink.status, 400)
    const afterHotlink = await api.get('/api/v1/pilot')
    assert.equal(afterHotlink.body.record.works[0].image, '')

    const broken = await api.put('/api/v1/pilot').send({
      accessCode: 'inview',
      record: {
        ...afterHotlink.body.record,
        works: [sampleWork({ image: 'data:image/png;base64,aaaa' })],
      },
    })
    assert.equal(broken.status, 400)
    const afterBroken = await api.get('/api/v1/pilot')
    assert.equal(afterBroken.body.record.works[0].title, 'Sample work')
    assert.equal(afterBroken.body.record.logo, logoUrl)
  })
})

test('uploads require the access code and store a PNG', async () => {
  await withApp('upload', async ({ app }) => {
    const api = http(app, 'upload')
    const unknown = await api.post('/api/v1/uploads').send({ gallery: 'nope', accessCode: 'inview' })
    assert.equal(unknown.status, 400)

    const denied = await api.post('/api/v1/uploads').send({
      gallery: 'o-gallery',
      accessCode: 'nope',
      contentType: 'image/png',
      dataBase64: PNG,
    })
    assert.equal(denied.status, 401)

    const missing = await api.post('/api/v1/uploads').send({ gallery: 'o-gallery', accessCode: 'inview' })
    assert.equal(missing.status, 400)

    const saved = await api.post('/api/v1/uploads').send({
      gallery: 'o-gallery',
      accessCode: 'inview',
      contentType: 'image/png',
      dataBase64: PNG,
    })
    assert.equal(saved.status, 201)
    assert.equal(typeof saved.body.id, 'string')
    assert.match(saved.body.url, /^\/media\/u\/galleries\/o-gallery\//)

    const first = await api.get('/api/v1/pilot')
    const published = await api.put('/api/v1/pilot').send({
      accessCode: 'inview',
      record: {
        ...first.body.record,
        works: [sampleWork({ title: 'Uploaded work', sample: false, image: saved.body.url })],
      },
    })
    assert.equal(published.status, 200)
    assert.equal(published.body.record.works[0].image, saved.body.url)

    const foreign = await api.put('/api/v1/pilot').send({
      accessCode: 'inview',
      record: {
        ...published.body.record,
        works: [sampleWork({ title: 'Foreign file', sample: false, image: '/media/u/galleries/other-gallery/file/original.jpg' })],
      },
    })
    assert.equal(foreign.status, 400)
    const after = await api.get('/api/v1/pilot')
    assert.equal(after.body.record.works[0].image, saved.body.url)
  })
})

test('repeated bad access codes return 429', async () => {
  const previous = process.env.RATE_LIMIT_ACCESS_FAIL_IP_MAX
  process.env.RATE_LIMIT_ACCESS_FAIL_IP_MAX = '1'
  try {
    await withApp('limit', async ({ app }) => {
      const api = http(app, 'limit')
      const first = await api.get('/api/v1/pilot')
      const one = await api.put('/api/v1/pilot').send({ accessCode: 'nope', record: first.body.record })
      const two = await api.put('/api/v1/pilot').send({ accessCode: 'nope', record: first.body.record })
      const three = await api.post('/api/v1/uploads').send({
        gallery: 'o-gallery',
        accessCode: 'nope',
        contentType: 'image/png',
        dataBase64: PNG,
      })
      assert.equal(one.status, 401)
      assert.equal(two.status, 429)
      assert.equal(three.status, 429)
      assert.equal(three.body.error, 'Too many requests. Try again later.')
      assert.ok(Number(three.headers['retry-after']) > 0)
    })
  } finally {
    if (previous === undefined) delete process.env.RATE_LIMIT_ACCESS_FAIL_IP_MAX
    else process.env.RATE_LIMIT_ACCESS_FAIL_IP_MAX = previous
  }
})
