import test from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../database/context'
import { auditLogs, galleries, invitations, media, rateLimits, sessions, users } from '../database/schema'
import { createUser, createUserSession } from './accounts'
import type { Principal } from './authz'
import { auditChoices, auditPage, inviteOperator, listOperators, operatorHealth, updateOperator } from './ops-admin'
import { rateLimitConfig } from './rate-limit'
import { createTestDb } from './test-db'

test('operator invites, role changes and disabling are audited and remove sessions', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  try {
    const user = await createUser(db, { email: 'admin@example.com', platformRole: 'admin' })
    const admin: Principal = { kind: 'operator', userId: user.id, platformRole: 'admin' }
    const support: Principal = { ...admin, platformRole: 'support' }
    await assert.rejects(listOperators(db, support), /Forbidden/)
    await assert.rejects(inviteOperator(db, support, 'new@example.com', 'admin'), /Forbidden/)
    const result = await inviteOperator(db, admin, 'new@example.com', 'support')
    assert.match(result.invitePath, /^\/staff\/invite\//)
    const [invited] = await db.select().from(users).where(eq(users.email, 'new@example.com'))
    assert.equal(invited.status, 'invited')
    await updateOperator(db, admin, invited.id, { role: 'admin' })
    assert.equal((await db.select().from(invitations))[0].platformRole, 'admin')
    await db.update(users).set({ status: 'active' }).where(eq(users.id, invited.id))
    await createUserSession(db, invited.id, false)
    await updateOperator(db, admin, invited.id, { disable: true })
    assert.equal((await db.select().from(sessions)).length, 0)
    assert.equal((await db.select().from(users).where(eq(users.id, invited.id)))[0].status, 'disabled')
    await assert.rejects(updateOperator(db, support, invited.id, { role: 'support' }), /Forbidden/)
    await assert.rejects(updateOperator(db, admin, user.id, { disable: true }))
    const audit = await db.select().from(auditLogs)
    assert.deepEqual(audit.map((row) => row.action).sort(), ['invite-create', 'operator-disable', 'operator-role'])
    assert.ok(!JSON.stringify(audit).includes(result.invitePath.split('/').pop()!))
    assert.equal((await listOperators(db, admin)).length, 2)
  } finally { await fixture.close() }
})

test('audit filters combine and paginate deterministically; health counts retained buckets at capacity on the Tehran day', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  try {
    const user = await createUser(db, { email: 'audit@example.com', platformRole: 'support' })
    const principal: Principal = { kind: 'operator', userId: user.id, platformRole: 'support' }
    const [gallery] = await db.insert(galleries).values({ slug: 'audit-gallery', nameEn: 'Audit', nameFa: 'گالری' }).returning()
    await db.insert(auditLogs).values(Array.from({ length: 55 }, (_, index) => ({ actorUserId: user.id, galleryId: gallery.id, action: 'qr-create', targetType: 'qr', targetId: String(index) })))
    await db.insert(auditLogs).values({ actorUserId: user.id, action: 'operator-role', targetType: 'user', targetId: user.id })
    const filters = { gallery: gallery.id, actor: user.id, action: 'qr-create' }
    const first = await auditPage(db, principal, filters)
    const second = await auditPage(db, principal, { ...filters, page: 2 })
    assert.equal(first.rows.length, 50)
    assert.equal(first.hasNext, true)
    assert.equal(second.rows.length, 5)
    assert.equal(second.hasNext, false)
    assert.equal(new Set([...first.rows, ...second.rows].map((row) => row.id)).size, 55)
    assert.equal((await auditPage(db, principal, { ...filters, action: 'operator-role' })).rows.length, 0)
    assert.equal((await auditPage(db, principal, { actor: 'invalid' })).rows.length, 0)
    assert.equal((await auditChoices(db, principal)).actions.length, 2)
    await assert.rejects(auditPage(db, null), /Forbidden/)
    await fixture.client.exec('CREATE TABLE inview_migrations (id text PRIMARY KEY, applied_at timestamptz DEFAULT now()); INSERT INTO inview_migrations(id) VALUES (\'test.sql\')')
    await db.insert(media).values({ galleryId: gallery.id, s3Key: 'example', width: 1, height: 1 })
    const config = rateLimitConfig()
    const today = new Date('2026-11-01T20:30:00Z')
    await db.insert(rateLimits).values([
      { bucket: 'access-fail:ip:yesterday', windowStart: new Date('2026-11-01T20:29:59Z'), hits: config.accessFailIpMax },
      { bucket: 'access-fail:ip:today', windowStart: today, hits: config.accessFailIpMax },
      { bucket: 'lead:visitor:over', windowStart: today, hits: config.leadVisitorMax + 3 },
      { bucket: 'visit:ip:below', windowStart: today, hits: config.visitIpMax - 1 },
      { bucket: 'upload:gallery:future', windowStart: new Date('2026-11-02T20:30:00Z'), hits: config.uploadGalleryMax },
      { bucket: 'upload:gallery:later-today', windowStart: new Date('2026-11-02T01:00:00Z'), hits: config.uploadGalleryMax },
      { bucket: 'unknown:ip:today', windowStart: today, hits: 10000 },
      { bucket: 'user-sign-in:ip:today', windowStart: today, hits: config.accessFailIpMax },
      { bucket: 'user-sign-in:account:today', windowStart: today, hits: config.accessFailGalleryMax },
    ])
    const health = await operatorHealth(db, principal, fixture.storage, new Date('2026-11-02T00:00:00Z'))
    assert.equal(health.readiness.body.ok, true)
    assert.equal(health.blocks, 4)
    assert.equal(health.mediaCount, 1)
    assert.equal(health.migrations[0].id, 'test.sql')
    const down = await operatorHealth(db, principal, { ...fixture.storage, publicUrl: () => '', putObject: async () => '', probe: async () => { throw new Error('down') } })
    assert.equal(down.readiness.status, 503)
  } finally { await fixture.close() }
})
