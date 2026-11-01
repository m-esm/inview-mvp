import test from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../database/context'
import { auditLogs, sessions, users } from '../database/schema'
import { createUser, signIn, signOut, signOutAll } from './accounts'
import { sha256 } from './crypto'
import { rateLimitConfig } from './rate-limit'
import { createTestDb } from './test-db'

test('accounts sign in by normalized email or phone, store hashes, set TTLs and revoke sessions', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  try {
    const operator = await createUser(db, { email: ' ADMIN@Example.com ', name: 'Admin', password: 'long-password', platformRole: 'admin' })
    assert.equal(operator.email, 'admin@example.com')
    assert.notEqual(operator.passwordHash, 'long-password')
    const first = await signIn(db, { identifier: 'ADMIN@example.com', password: 'long-password', ip: 'one', secure: true })
    assert.ok(first.ok)
    assert.deepEqual(first.user, { id: operator.id, name: 'Admin', platformRole: 'admin' })
    assert.match(first.cookie, /HttpOnly; SameSite=Lax; Path=\/; Max-Age=28800; Secure$/)
    const token = first.cookie.split(';')[0].split('=')[1]
    const [stored] = await db.select().from(sessions).where(eq(sessions.userId, operator.id))
    assert.equal(stored.tokenHash, sha256(token))
    assert.ok(Math.abs(stored.expiresAt.getTime() - Date.now() - 8 * 3600000) < 10000)
    const [updated] = await db.select().from(users).where(eq(users.id, operator.id))
    assert.ok(updated.lastSignedInAt)
    const staff = await createUser(db, { phone: '09120000000', password: 'staff-password' })
    const phone = await signIn(db, { identifier: '09120000000', password: 'staff-password', ip: 'two', secure: false })
    assert.ok(phone.ok)
    assert.match(phone.cookie, /Max-Age=43200$/)
    assert.doesNotMatch(phone.cookie, /Secure/)
    assert.equal((await db.select().from(auditLogs)).length, 0)
    const second = await signIn(db, { identifier: 'admin@example.com', password: 'long-password', ip: 'one', secure: false })
    assert.ok(second.ok)
    assert.match(await signOut(db, first.cookie, true), /Max-Age=0; Secure$/)
    assert.equal((await db.select().from(sessions).where(eq(sessions.userId, operator.id))).length, 1)
    await signOutAll(db, operator.id)
    assert.equal((await db.select().from(sessions).where(eq(sessions.userId, operator.id))).length, 0)
    assert.equal((await db.select().from(sessions).where(eq(sessions.userId, staff.id))).length, 1)
    const [audit] = await db.select().from(auditLogs)
    assert.equal(audit.action, 'sign-out-all')
    assert.equal(audit.actorUserId, operator.id)
  } finally {
    await fixture.close()
  }
})

test('wrong, missing, disabled and invited accounts return the same failure without sessions', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  try {
    await createUser(db, { email: 'active@example.com', password: 'long-password' })
    await createUser(db, { email: 'disabled@example.com', password: 'long-password', status: 'disabled' })
    await createUser(db, { email: 'invited@example.com', password: 'long-password', status: 'invited' })
    const results = []
    for (const identifier of ['active@example.com', 'missing@example.com', 'disabled@example.com', 'invited@example.com']) {
      results.push(await signIn(db, { identifier, password: identifier.startsWith('active') ? 'incorrect' : 'long-password', ip: identifier, secure: false }))
    }
    for (const result of results) {
      assert.deepEqual(result, { ok: false, result: { status: 401, body: { error: 'The sign-in details do not match.' } } })
    }
    assert.equal((await db.select().from(sessions)).length, 0)
    await assert.rejects(createUser(db, { email: 'short@example.com', password: 'short' }), /10 to 1024/)
  } finally {
    await fixture.close()
  }
})

test('sign-in limits both client and account independently, with retry delay and window recovery', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  try {
    const config = { ...rateLimitConfig({ NODE_ENV: 'test' }), accessFailIpMax: 1, accessFailGalleryMax: 1 }
    const now = new Date()
    const attempt = (identifier: string, ip: string, date = now) => signIn(db, { identifier, password: 'incorrect', ip, secure: false }, date, config)
    const first = await attempt('one@example.com', 'one')
    assert.ok(!first.ok && first.result.status === 401)
    const account = await attempt('ONE@example.com', 'two')
    assert.ok(!account.ok && account.result.status === 429)
    assert.equal(account.result.retryAfterSeconds, 900)
    const client = await attempt('two@example.com', 'one')
    assert.ok(!client.ok && client.result.status === 429)
    const later = await attempt('one@example.com', 'one', new Date(now.getTime() + 901000))
    assert.ok(!later.ok && later.result.status === 401)
    await createUser(db, { email: 'both@example.com', phone: '09121111111', password: 'long-password' })
    const email = await attempt('both@example.com', 'email-client')
    assert.ok(!email.ok && email.result.status === 401)
    const phone = await attempt('09121111111', 'phone-client')
    assert.ok(!phone.ok && phone.result.status === 429)
  } finally {
    await fixture.close()
  }
})
