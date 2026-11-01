import test from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../database/context'
import { auditLogs, galleries, leads, qrCodes, shows, visits, works } from '../database/schema'
import { createUser } from './accounts'
import { can, type Principal } from './authz'
import { verifySecret } from './crypto'
import { createGallery, galleryProfile, listGalleries, rotateSharedCode, updateGallery } from './ops'
import { createTestDb } from './test-db'
import { opsDictionaries } from '../app/lib/i18n-ops'
import { resolveLang } from '../app/lib/lang'

test('operator dictionaries have key parity and new paths default to Persian', () => {
  assert.deepEqual(Object.keys(opsDictionaries.fa).sort(), Object.keys(opsDictionaries.en).sort())
  for (const path of ['/ops', '/ops/galleries/new', '/staff/invite/example']) {
    assert.equal(resolveLang(path, null), 'fa')
    assert.equal(resolveLang(path, 'inview-lang=en'), 'en')
  }
})

test('operators create draft galleries atomically, update, rotate hashes and audit every write', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  try {
    const user = await createUser(db, { email: 'admin@example.com', platformRole: 'admin' })
    const admin: Principal = { kind: 'operator', userId: user.id, platformRole: 'admin' }
    const support: Principal = { ...admin, platformRole: 'support' }
    const input = { slug: 'first-gallery', nameFa: 'گالری', nameEn: 'First', showTitle: 'First show', ownerIdentifier: 'owner@example.com' }
    const result = await createGallery(db, support, input)
    assert.equal(result.gallery.status, 'draft')
    assert.match(result.invitePath, /^\/staff\/invite\//)
    const [show] = await db.select().from(shows).where(eq(shows.galleryId, result.gallery.id))
    assert.equal(show.titleFa, 'First show')
    assert.equal(show.status, 'draft')
    assert.equal((await db.select().from(qrCodes).where(eq(qrCodes.showId, show.id)))[0].code, 'first-gallery-main')
    await assert.rejects(createGallery(db, admin, input), /already in use/)
    await assert.rejects(createGallery(db, admin, { ...input, slug: '../bad' }))
    await assert.rejects(createGallery(db, admin, { ...input, slug: 'rollback', ownerIdentifier: 'bad' }))
    assert.equal((await db.select().from(galleries)).length, 1)
    await updateGallery(db, support, result.gallery.id, { nameFa: 'جدید', nameEn: 'Changed', status: 'live', notes: 'Private', sharedCodeEnabled: false })
    const rotated = await rotateSharedCode(db, admin, result.gallery.id)
    const [stored] = await db.select().from(galleries).where(eq(galleries.id, result.gallery.id))
    assert.ok(verifySecret(rotated.code, stored.accessCodeHash))
    assert.equal(stored.sharedCodeEnabled, false)
    const profile = await galleryProfile(db, admin, result.gallery.slug)
    assert.equal('accessCodeHash' in profile!, false)
    const audit = await db.select().from(auditLogs)
    assert.deepEqual(audit.map((row) => row.action).sort(), ['gallery-code-rotate', 'gallery-create', 'gallery-update', 'invite-create'])
    assert.ok(audit.every((row) => row.actorUserId === user.id && row.galleryId === result.gallery.id))
    assert.ok(!JSON.stringify(audit).includes(rotated.code))
    assert.ok(!JSON.stringify(audit).includes(result.invitePath.split('/').pop()!))
    assert.equal(can(support, 'manage-operators'), false)
    assert.equal(can(admin, 'manage-operators'), true)
    for (const principal of [null, { kind: 'staff', userId: user.id, memberships: [{ galleryId: result.gallery.id, role: 'owner' }] } as Principal]) {
      await assert.rejects(listGalleries(db, principal), /Forbidden/)
      await assert.rejects(createGallery(db, principal, input), /Forbidden/)
      await assert.rejects(updateGallery(db, principal, result.gallery.id, { nameFa: 'A', nameEn: 'A', status: 'live', notes: '', sharedCodeEnabled: true }), /Forbidden/)
    }
  } finally { await fixture.close() }
})

test('two galleries keep work, view, scan and lead statistics isolated across Tehran day boundaries', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  try {
    const user = await createUser(db, { email: 'stats@example.com', platformRole: 'admin' })
    const admin: Principal = { kind: 'operator', userId: user.id, platformRole: 'admin' }
    const a = await createGallery(db, admin, { slug: 'gallery-a', nameFa: 'الف', nameEn: 'A', showTitle: 'A', ownerIdentifier: 'owner-a@example.com' })
    const b = await createGallery(db, admin, { slug: 'gallery-b', nameFa: 'ب', nameEn: 'B', showTitle: 'B', ownerIdentifier: 'owner-b@example.com' })
    for (const [index, item] of [a, b].entries()) {
      const [show] = await db.select().from(shows).where(eq(shows.galleryId, item.gallery.id))
      for (let n = 0; n <= index; n++) {
        await db.insert(works).values({ id: `${index}-${n}`, galleryId: item.gallery.id, title: 'Work' })
        await db.insert(visits).values({ showId: show.id, visitorId: `${index}-${n}`, kind: 'scan', day: '2026-11-02' })
        await db.insert(visits).values({ showId: show.id, visitorId: `${index}-${n}`, kind: 'view', day: '2026-10-27' })
        await db.insert(leads).values({ galleryId: item.gallery.id, showId: show.id, phone: '09120000000', kind: 'ask', consentAt: new Date(), consentTextVersion: 'v1', createdAt: new Date('2026-10-26T20:30:00Z') })
      }
      await db.insert(visits).values({ showId: show.id, visitorId: 'older', kind: 'view', day: '2026-10-26' })
      await db.insert(leads).values({ galleryId: item.gallery.id, phone: '09120000000', kind: 'ask', consentAt: new Date(), consentTextVersion: 'v1', createdAt: new Date('2026-10-26T20:29:59Z') })
    }
    const rows = await listGalleries(db, admin, new Date('2026-11-01T20:30:00Z'))
    for (const [index, item] of [a, b].entries()) {
      const row = rows.find((row) => row.id === item.gallery.id)!
      assert.equal(row.worksCount, index + 1)
      assert.deepEqual(row.days7, { scans: index + 1, views: index + 1, leads: index + 1 })
      assert.deepEqual(row.days30, { scans: index + 1, views: index + 2, leads: index + 2 })
      assert.equal(row.lastPublish, null)
    }
  } finally { await fixture.close() }
})
