import test from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { DatabaseContext, type AppDatabase } from '../database/context'
import { auditLogs, galleries, leads, qrCodes, shows, visits, works } from '../database/schema'
import { createUser, createUserSession } from './accounts'
import type { Principal } from './authz'
import { createTestDb } from './test-db'
import { createGalleryQr, exportGalleryLeads, galleryActivity, galleryLeads, galleryQrCodes, galleryQrSvg, maskPhone, requireLeadExport, revealLeadPhone } from './ops-data'
import { ensureOGalleryTenant } from './gallery-bootstrap'
import { leadsCsvForSession } from './gallery-record'
import { loader as csvLoader } from '../app/routes/ops.galleries.leads-csv'
import { loader as operatorsLoader } from '../app/routes/ops.operators'

test('lead downloads require admin, isolate galleries, match the staff CSV and write an audit row', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  try {
    const user = await createUser(db, { email: 'export-admin@example.com', platformRole: 'admin' })
    const support = await createUser(db, { email: 'export-support@example.com', platformRole: 'support' })
    const adminSession = await createUserSession(db, user.id, false)
    const supportSession = await createUserSession(db, support.id, false)
    const { gallery } = await ensureOGalleryTenant(db)
    const [other] = await db.insert(galleries).values({ slug: 'other-export', nameEn: 'Other', nameFa: 'دیگر' }).returning()
    const titles = ['=HYPERLINK("x")', 'Harbour, light', '+SUM(A1)', '-1+2', '@SUM(A1)', '\tformula', '\rformula', 'Line one\n"line two"']
    const consentAt = new Date('2026-10-30T10:00:00Z')
    for (const [index, title] of titles.entries()) {
      const workId = `csvwork0${index}`
      await db.insert(works).values({ id: workId, galleryId: gallery.id, title })
      await db.insert(leads).values({ galleryId: gallery.id, workId, phone: `0912000000${index}`, kind: index === 1 ? 'save' : 'ask',
        consentAt, consentTextVersion: 'v1', createdAt: new Date(consentAt.getTime() + index * 1000) })
    }
    await db.insert(leads).values({ galleryId: gallery.id, phone: '09120000009', kind: 'ask', consentAt, consentTextVersion: 'v1', createdAt: new Date('2026-10-31T00:00:00Z') })
    await db.insert(works).values({ id: 'other-work', galleryId: other.id, title: 'Other gallery private title' })
    await db.insert(leads).values({ galleryId: other.id, workId: 'other-work', phone: '09129999999', kind: 'ask', consentAt, consentTextVersion: 'v1' })
    const args = (cookie: string, slug = gallery.slug) => ({ request: new Request(`https://example.com/ops/galleries/${slug}/leads.csv`, { headers: { cookie } }), params: { slug } })
    await DatabaseContext.run(db, async () => {
      await assert.rejects(csvLoader(args(supportSession.cookie)), (error: unknown) => error instanceof Response && error.status === 403)
      assert.equal((await db.select().from(auditLogs).where(eq(auditLogs.action, 'leads-export'))).length, 0)
      const result = await csvLoader(args(adminSession.cookie))
      assert.ok(result instanceof Response)
      assert.equal(result.status, 200)
      assert.equal(result.headers.get('content-type'), 'text/csv; charset=utf-8')
      assert.equal(result.headers.get('cache-control'), 'no-store')
      assert.match(result.headers.get('content-disposition')!, /attachment; filename="o-gallery-leads-\d{4}-\d{2}-\d{2}\.csv"/)
      const bytes = Buffer.from(await result.arrayBuffer())
      assert.deepEqual([...bytes.subarray(0, 3)], [239, 187, 191])
      const csv = bytes.toString('utf8')
      const staff = await leadsCsvForSession(db, gallery.id)
      assert.equal(staff.status, 200)
      assert.equal(csv, staff.body)
      assert.ok(csv.startsWith('\uFEFFcreated_at,kind,phone,work_id,work_title,consent_text_version,verified\r\n'))
      assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'))
      assert.ok(csv.includes('"Harbour, light"'))
      assert.ok(csv.includes('2026-10-30T10:00:00.000Z,ask,09120000009,,,v1,no\r\n'))
      assert.ok(!csv.includes('09129999999'))
      assert.ok(!csv.includes('Other gallery private title'))
      const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'leads-export'))
      assert.equal(audit.actorUserId, user.id)
      assert.equal(audit.galleryId, gallery.id)
      assert.equal(audit.targetId, gallery.id)
      assert.deepEqual(audit.summary, { rows: 9 })
      const otherResult = await csvLoader(args(adminSession.cookie, other.slug))
      assert.ok(otherResult instanceof Response)
      const otherCsv = await otherResult.text()
      assert.ok(otherCsv.includes('09129999999'))
      assert.ok(!otherCsv.includes('09120000000'))
    })
  } finally { await fixture.close() }
})

test('lead exports cap the latest gallery rows at 10000 and do not join another gallery work title', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  try {
    const user = await createUser(db, { email: 'export-limit@example.com', platformRole: 'admin' })
    const admin: Principal = { kind: 'operator', userId: user.id, platformRole: 'admin' }
    const [gallery, other] = await db.insert(galleries).values([
      { slug: 'export-limit', nameEn: 'Limit', nameFa: 'حد' },
      { slug: 'export-other', nameEn: 'Other', nameFa: 'دیگر' },
    ]).returning()
    await db.insert(works).values({ id: 'foreign-work', galleryId: other.id, title: 'Foreign private title' })
    await fixture.client.query(`insert into leads(gallery_id, work_id, phone, kind, consent_at, consent_text_version, created_at)
      select $1::uuid, 'foreign-work', '09120000000', 'ask', '2026-10-30'::timestamptz, 'v1', '2026-10-30'::timestamptz + n * interval '1 second'
      from generate_series(1, 10001) n`, [gallery.id])
    await db.insert(leads).values({ galleryId: gallery.id, phone: 'oldest-excluded', kind: 'ask', consentAt: new Date('2026-01-01'), consentTextVersion: 'v1', createdAt: new Date('2026-01-01') })
    const csv = await exportGalleryLeads(db, admin, gallery.id)
    assert.equal(csv.split('\r\n').length, 10002)
    assert.ok(!csv.includes('oldest-excluded'))
    assert.ok(!csv.includes('Foreign private title'))
    assert.deepEqual((await db.select().from(auditLogs).where(eq(auditLogs.action, 'leads-export')))[0].summary, { rows: 10000 })
  } finally { await fixture.close() }
})

test('phone masking keeps only the prefix and last two digits', () => {
  assert.equal(maskPhone('09121234534'), '0912•••••34')
  assert.equal(maskPhone('123'), '•••')
  assert.equal(maskPhone(''), '')
})

test('gallery data is isolated, phone reveal is audited and operator administration forbids support', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  try {
    const user = await createUser(db, { email: 'support@example.com', platformRole: 'support' })
    const support: Principal = { kind: 'operator', userId: user.id, platformRole: 'support' }
    const admin: Principal = { ...support, platformRole: 'admin' }
    const tenants = []
    for (const slug of ['alpha', 'beta']) {
      const [gallery] = await db.insert(galleries).values({ slug, nameEn: slug, nameFa: slug }).returning()
      const [show] = await db.insert(shows).values({ galleryId: gallery.id }).returning()
      await db.insert(works).values({ id: slug, galleryId: gallery.id, title: slug })
      const [lead] = await db.insert(leads).values({ galleryId: gallery.id, showId: show.id, workId: slug, phone: slug === 'alpha' ? '09121234534' : '09129999999', kind: 'ask', consentAt: new Date(), consentTextVersion: 'v1' }).returning()
      const qr = await createGalleryQr(db, support, gallery.id, slug, `${slug}-qr`)
      await db.insert(visits).values([
        { showId: show.id, qrCodeId: qr.id, kind: 'scan', visitorId: slug, day: '2026-10-01', createdAt: new Date('2026-11-01T20:30:00Z') },
        { showId: show.id, kind: 'view', workId: slug, visitorId: slug, day: '2026-10-01', createdAt: new Date('2026-11-01T20:30:00Z') },
      ])
      tenants.push({ gallery, show, lead, qr })
    }
    const [a, b] = tenants
    for (const own of tenants) {
      const other = own === a ? b : a
      const rows = await galleryLeads(db, support, own.gallery.id)
      assert.equal(rows.length, 1)
      assert.equal(rows[0].workTitle, own.gallery.slug)
      assert.ok(!JSON.stringify(rows).includes(own.lead.phone))
      assert.ok(!JSON.stringify(rows).includes(other.lead.phone))
      const activity = await galleryActivity(db, support, own.gallery.id, new Date('2026-11-02T10:00:00Z'))
      assert.equal(activity.days.length, 30)
      assert.deepEqual(activity.days[0], { day: '2026-11-02', scans: 1, views: 1 })
      assert.deepEqual(activity.works.map((work) => work.id), [own.gallery.slug])
      assert.equal(activity.audit.length, 1)
      const codes = await galleryQrCodes(db, support, own.gallery.id)
      assert.deepEqual(codes.map((code) => [code.code, code.scans]), [[`${own.gallery.slug}-qr`, 1]])
      await assert.rejects(galleryQrSvg(db, support, own.gallery.id, own.gallery.slug, `${other.gallery.slug}-qr`, 'https://example.com'))
      await assert.rejects(revealLeadPhone(db, support, own.gallery.id, other.lead.id, 'Resolve a visitor request'))
    }
    const before = (await db.select().from(auditLogs)).length
    await assert.rejects(revealLeadPhone(db, support, a.gallery.id, a.lead.id, '  '))
    await assert.rejects(revealLeadPhone(db, support, a.gallery.id, a.lead.id, a.lead.phone))
    assert.equal((await db.select().from(auditLogs)).length, before)
    const revealed = await revealLeadPhone(db, support, a.gallery.id, a.lead.id, 'Resolve a visitor request')
    assert.equal(revealed.phone, a.lead.phone)
    const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'lead-reveal'))
    assert.equal(audit.actorUserId, user.id)
    assert.equal(audit.galleryId, a.gallery.id)
    assert.equal(audit.targetId, a.lead.id)
    assert.deepEqual(audit.summary, { reason: 'Resolve a visitor request' })
    assert.ok(!JSON.stringify(audit).includes(a.lead.phone))
    assert.throws(() => requireLeadExport(support, a.gallery.id), /Forbidden/)
    assert.equal(requireLeadExport(admin, a.gallery.id), admin)
    const session = await createUserSession(db, user.id, false)
    await DatabaseContext.run(db, async () => {
      await assert.rejects(operatorsLoader({ request: new Request('https://example.com/ops/operators', { headers: { Cookie: session.cookie } }) }), (error: unknown) => error instanceof Response && error.status === 403)
    })
    const svg = await galleryQrSvg(db, support, a.gallery.id, a.gallery.slug, 'alpha-qr', 'https://example.com')
    assert.match(svg, /^<svg/)
    await assert.rejects(createGalleryQr(db, support, a.gallery.id, 'Bad', '../bad'))
    await assert.rejects(createGalleryQr(db, support, a.gallery.id, 'Duplicate', 'alpha-qr'))
    assert.equal((await db.select().from(qrCodes)).length, 2)
    await assert.rejects(galleryLeads(db, null, a.gallery.id), /Forbidden/)
    await assert.rejects(galleryActivity(db, null, a.gallery.id), /Forbidden/)
  } finally { await fixture.close() }
})
