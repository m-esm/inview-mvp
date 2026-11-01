import test from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../database/context'
import { auditLogs, galleries, invitations, memberships, sessions, users } from '../database/schema'
import { createUser, signIn } from './accounts'
import { redactSummary, writeAudit } from './audit'
import { principalFor } from './authz'
import { sha256, verifySecret } from './crypto'
import { acceptInvite, createInvite, INVALID_INVITE, readInvite } from './invitations'
import { createTestDb } from './test-db'

test('audit summaries recursively remove secret keys without changing the source', async () => {
  const input = { Password: 'secret', before: { TOKEN: 'secret', code: 'secret', keep: true }, after: [{ PHONE: 'secret', Access_Code: 'secret', name: 'Name' }] }
  const expected = { before: { keep: true }, after: [{ name: 'Name' }] }
  assert.deepEqual(redactSummary(input), expected)
  assert.equal(input.Password, 'secret')
  const fixture = await createTestDb()
  try {
    await writeAudit(fixture.db as unknown as AppDatabase, { action: 'test', targetType: 'test', targetId: 'id', summary: input })
    assert.deepEqual((await fixture.db.select().from(auditLogs))[0].summary, expected)
  } finally {
    await fixture.close()
  }
})

test('staff invite hashes its token, accepts once, records membership attribution and audits', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  try {
    const inviter = await createUser(db, { email: 'inviter@example.com', platformRole: 'admin' })
    const user = await createUser(db, { email: 'staff@example.com', status: 'invited' })
    const [gallery] = await db.insert(galleries).values({ slug: 'invite-gallery', nameEn: 'Gallery', nameFa: 'Gallery' }).returning()
    const invite = await createInvite(db, { kind: 'staff', userId: user.id, createdBy: inviter.id, galleryId: gallery.id, role: 'owner' })
    assert.equal(Buffer.from(invite.token, 'base64url').length, 32)
    assert.ok(Math.abs(invite.expiresAt.getTime() - Date.now() - 7 * 86400000) < 10000)
    const [stored] = await db.select().from(invitations)
    assert.equal(stored.tokenHash, sha256(invite.token))
    assert.deepEqual(await readInvite(db, invite.token), { kind: 'staff', galleryName: 'Gallery', galleryNameFa: gallery.nameFa, gallerySlug: gallery.slug, role: 'owner' })
    await assert.rejects(acceptInvite(db, invite.token, 'Owner', 'short'), /10 to 1024/)
    assert.ok(await readInvite(db, invite.token))
    const results = await Promise.allSettled([
      acceptInvite(db, invite.token, 'Owner', 'owner-password', true),
      acceptInvite(db, invite.token, 'Other', 'other-password', true),
    ])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult
    assert.equal(rejected.reason.message, INVALID_INVITE)
    const accepted = results.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof acceptInvite>>>
    assert.match(accepted.value.cookie, /Secure/)
    assert.equal(await readInvite(db, invite.token), null)
    const [membership] = await db.select().from(memberships)
    assert.equal(membership.createdBy, inviter.id)
    assert.equal(membership.role, 'owner')
    const [active] = await db.select().from(users).where(eq(users.id, user.id))
    assert.equal(active.status, 'active')
    assert.ok(verifySecret('owner-password', active.passwordHash))
    const audits = await db.select().from(auditLogs).orderBy(auditLogs.createdAt)
    assert.deepEqual(audits.map((row) => row.action), ['invite-create', 'invite-accept'])
    assert.deepEqual(audits.map((row) => row.actorUserId), [inviter.id, user.id])
    assert.ok(audits.every((row) => row.galleryId === gallery.id))
    assert.equal(JSON.stringify(audits).includes(invite.token), false)
    assert.equal(JSON.stringify(audits).includes('owner-password'), false)
    const reset = await createInvite(db, { kind: 'reset', userId: user.id, createdBy: inviter.id })
    await acceptInvite(db, reset.token, 'Owner', 'reset-password')
    const resetAudits = (await db.select().from(auditLogs)).filter((row) => !audits.some((old) => old.id === row.id))
    assert.deepEqual(resetAudits.map((row) => row.action).sort(), ['invite-accept', 'invite-create', 'sign-out-all'])
    assert.ok(resetAudits.every((row) => row.galleryId === gallery.id))
    const [secondGallery] = await db.insert(galleries).values({ slug: 'second-invite-gallery', nameEn: 'Second', nameFa: 'Second' }).returning()
    const secondInvite = await createInvite(db, {
      kind: 'staff', userId: user.id, createdBy: inviter.id, galleryId: secondGallery.id, role: 'editor',
    })
    await acceptInvite(db, secondInvite.token, 'Owner', 'reset-password')
    assert.equal((await db.select().from(memberships).where(eq(memberships.userId, user.id))).length, 2)
  } finally {
    await fixture.close()
  }
})

test('unknown, expired and consumed invitations fail generically, and failed membership writes roll back consumption', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  try {
    const user = await createUser(db, { email: 'invited@example.com', status: 'invited' })
    const [gallery] = await db.insert(galleries).values({ slug: 'rollback-gallery', nameEn: 'Gallery', nameFa: 'Gallery' }).returning()
    const invite = await createInvite(db, { kind: 'staff', userId: user.id, galleryId: gallery.id, role: 'editor' })
    await db.insert(memberships).values({ userId: user.id, galleryId: gallery.id, role: 'viewer' })
    await assert.rejects(acceptInvite(db, invite.token, 'Editor', 'long-password'))
    assert.ok(await readInvite(db, invite.token))
    assert.equal((await db.select().from(users).where(eq(users.id, user.id)))[0].status, 'invited')
    assert.equal((await db.select().from(auditLogs)).length, 1)
    assert.equal((await db.select().from(sessions)).length, 0)
    await db.update(invitations).set({ expiresAt: new Date(0) }).where(eq(invitations.id, invite.id))
    assert.equal(await readInvite(db, invite.token), null)
    await assert.rejects(acceptInvite(db, invite.token, 'Editor', 'long-password'), { message: INVALID_INVITE })
    await assert.rejects(acceptInvite(db, 'unknown', 'Editor', 'long-password'), { message: INVALID_INVITE })
    await db.update(invitations).set({ expiresAt: new Date(Date.now() + 60000), consumedAt: new Date() }).where(eq(invitations.id, invite.id))
    await assert.rejects(acceptInvite(db, invite.token, 'Editor', 'long-password'), { message: INVALID_INVITE })
  } finally {
    await fixture.close()
  }
})

test('operator acceptance sets the role and reset replaces the password and revokes all prior sessions', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  try {
    const user = await createUser(db, { email: 'operator@example.com', status: 'invited' })
    const invite = await createInvite(db, { kind: 'operator', userId: user.id, platformRole: 'support' })
    const accepted = await acceptInvite(db, invite.token, 'Support', 'first-password')
    assert.equal(accepted.user.platformRole, 'support')
    assert.match(accepted.cookie, /Max-Age=28800/)
    const signed = await signIn(db, { identifier: 'operator@example.com', password: 'first-password', ip: 'operator', secure: false })
    assert.ok(signed.ok)
    const reset = await createInvite(db, { kind: 'reset', userId: user.id, createdBy: user.id })
    const changed = await acceptInvite(db, reset.token, 'Support', 'second-password')
    assert.equal(await principalFor(db, accepted.cookie), null)
    assert.equal(await principalFor(db, signed.cookie), null)
    assert.ok(await principalFor(db, changed.cookie))
    assert.equal((await db.select().from(sessions)).length, 1)
    const [updated] = await db.select().from(users).where(eq(users.id, user.id))
    assert.equal(verifySecret('first-password', updated.passwordHash), false)
    assert.equal(verifySecret('second-password', updated.passwordHash), true)
    assert.equal((await db.select().from(auditLogs)).filter((row) => row.action === 'sign-out-all').length, 1)
    const disabledReset = await createInvite(db, { kind: 'reset', userId: user.id })
    await db.update(users).set({ status: 'disabled' }).where(eq(users.id, user.id))
    await assert.rejects(acceptInvite(db, disabledReset.token, 'Support', 'third-password'), { message: INVALID_INVITE })
  } finally {
    await fixture.close()
  }
})
