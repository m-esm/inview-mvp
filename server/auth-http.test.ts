import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../database/context'
import { invitations, users } from '../database/schema'
import { createUser } from './accounts'
import { createApiApp } from './api-app'
import { createInvite } from './invitations'
import { originCheck } from './origin-check'
import { requestPath } from './redact.js'
import { createTestDb } from './test-db'

test('Origin check enforces configured and fallback origins, protects actions, and narrowly permits legacy clients', async () => {
  const previous = process.env.PUBLIC_APP_URL
  const app = express()
  app.use(originCheck)
  app.use((_req, res) => res.json({ ok: true }))
  try {
    process.env.PUBLIC_APP_URL = 'https://app.example.com/path'
    assert.equal((await request(app).post('/api/v1/auth/sign-in').set('Origin', 'https://foreign.example.com')).status, 403)
    assert.equal((await request(app).post('/api/v1/auth/sign-in').set('Origin', 'https://app.example.com')).status, 200)
    assert.equal((await request(app).post('/api/v1/auth/sign-in')).status, 403)
    assert.equal((await request(app).post('/api/v1/auth/sign-in').set('Sec-Fetch-Site', 'same-origin')).status, 403)
    assert.equal((await request(app).post('/staff/action').set('Origin', 'https://foreign.example.com')).status, 403)
    assert.equal((await request(app).post('/staff/action')).status, 403)
    assert.equal((await request(app).post('/staff/action').set('Origin', 'https://app.example.com')).status, 200)
    for (const path of ['/api/pilot', '/api/v1/pilot', '/api/v1/uploads', '/dashboard/sign-in']) {
      assert.equal((await request(app).post(path)).status, 200, path)
      assert.equal((await request(app).post(path).set('Sec-Fetch-Site', 'same-origin')).status, 200, path)
      assert.equal((await request(app).post(path).set('Sec-Fetch-Site', 'cross-site')).status, 403, path)
      assert.equal((await request(app).post(path).set('Origin', 'https://foreign.example.com')).status, 403, path)
    }
    assert.equal((await request(app).get('/api/v1/auth/me').set('Origin', 'https://foreign.example.com')).status, 200)
    assert.equal((await request(app).head('/staff/action')).status, 200)
    assert.equal((await request(app).options('/api/v1/auth/sign-in')).status, 200)
    delete process.env.PUBLIC_APP_URL
    assert.equal((await request(app).post('/staff/action').set('Host', 'local.example').set('Origin', 'http://local.example')).status, 200)
    assert.equal((await request(app).post('/staff/action').set('Host', 'local.example').set('X-Forwarded-Proto', 'https').set('Origin', 'https://local.example')).status, 200)
    assert.equal((await request(app).post('/staff/action').set('Host', 'local.example').set('Origin', 'null')).status, 403)
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_APP_URL
    else process.env.PUBLIC_APP_URL = previous
  }
})

test('auth HTTP surface signs in and out, returns safe summaries and reports rate limits', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  const previous = { url: process.env.PUBLIC_APP_URL, limit: process.env.RATE_LIMIT_ACCESS_FAIL_IP_MAX }
  process.env.PUBLIC_APP_URL = 'https://app.example.com'
  process.env.RATE_LIMIT_ACCESS_FAIL_IP_MAX = '2'
  try {
    const app = createApiApp(db, fixture.storage)
    await createUser(db, { email: 'admin@example.com', phone: '09120000000', name: 'Admin', password: 'long-password', platformRole: 'admin' })
    assert.equal((await request(app).get('/api/v1/auth/me')).status, 401)
    const post = (path: string) => request(app).post(path).set('Origin', 'https://app.example.com').set('X-Forwarded-Proto', 'https')
    assert.equal((await post('/api/v1/auth/sign-in').send({ identifier: 12, password: null })).status, 400)
    const wrong = await post('/api/v1/auth/sign-in').send({ identifier: 'admin@example.com', password: 'wrong' })
    assert.equal(wrong.status, 401)
    const signed = await post('/api/v1/auth/sign-in').send({ identifier: 'ADMIN@example.com', password: 'long-password' })
    assert.equal(signed.status, 200)
    assert.deepEqual(Object.keys(signed.body.user).sort(), ['id', 'name', 'platformRole'])
    assert.equal(JSON.stringify(signed.body).includes('09120000000'), false)
    assert.match(signed.headers['set-cookie'][0], /Secure/)
    const cookie = signed.headers['set-cookie'][0].split(';')[0]
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie)
    assert.equal(me.status, 200)
    assert.equal(me.body.principal.kind, 'operator')
    assert.equal(me.body.principal.platformRole, 'admin')
    assert.equal(me.headers['cache-control'], 'no-store')
    const limited = await post('/api/v1/auth/sign-in').send({ identifier: 'admin@example.com', password: 'long-password' })
    assert.equal(limited.status, 429)
    assert.ok(Number(limited.headers['retry-after']) > 0)
    assert.equal((await post('/api/v1/auth/sign-out').set('Cookie', cookie)).status, 200)
    assert.equal((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status, 401)
  } finally {
    if (previous.url === undefined) delete process.env.PUBLIC_APP_URL
    else process.env.PUBLIC_APP_URL = previous.url
    if (previous.limit === undefined) delete process.env.RATE_LIMIT_ACCESS_FAIL_IP_MAX
    else process.env.RATE_LIMIT_ACCESS_FAIL_IP_MAX = previous.limit
    await fixture.close()
  }
})

test('invite HTTP metadata and acceptance reveal no secrets and set a session cookie', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  const previous = process.env.PUBLIC_APP_URL
  process.env.PUBLIC_APP_URL = 'https://app.example.com'
  try {
    const app = createApiApp(db, fixture.storage)
    const user = await createUser(db, { email: 'invite@example.com', status: 'invited' })
    const invite = await createInvite(db, { kind: 'operator', userId: user.id, platformRole: 'admin' })
    const path = `/api/v1/invites/${invite.token}`
    const metadata = await request(app).get(path)
    assert.equal(metadata.status, 200)
    assert.deepEqual(metadata.body, { kind: 'operator', galleryName: null, galleryNameFa: null, gallerySlug: null, role: 'admin' })
    const accepted = await request(app).post(`${path}/accept`).set('Origin', 'https://app.example.com')
      .send({ name: 'New Admin', password: 'new-password' })
    assert.equal(accepted.status, 200)
    assert.equal(accepted.body.user.name, 'New Admin')
    assert.equal(JSON.stringify(accepted.body).includes(invite.token), false)
    assert.equal(JSON.stringify(accepted.body).includes('new-password'), false)
    const cookie = accepted.headers['set-cookie'][0].split(';')[0]
    assert.equal((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status, 200)
    assert.equal((await request(app).get(path)).status, 404)
    assert.equal((await request(app).post(`${path}/accept`).set('Origin', 'https://app.example.com')
      .send({ name: 'New Admin', password: 'new-password' })).status, 404)
    assert.equal((await request(app).get('/api/v1/invites/unknown')).status, 404)
    const reset = await createInvite(db, { kind: 'reset', userId: user.id })
    await db.update(invitations).set({ expiresAt: new Date(0) }).where(eq(invitations.id, reset.id))
    assert.equal((await request(app).get(`/api/v1/invites/${reset.token}`)).status, 404)
    await db.update(users).set({ status: 'disabled' }).where(eq(users.id, user.id))
    assert.equal((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status, 401)
    assert.equal(requestPath(`${path}/accept?anything=hidden`), '/api/v1/invites/[redacted]/accept')
    assert.equal(requestPath(`/staff/invite/${invite.token}`), '/staff/invite/[redacted]')
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_APP_URL
    else process.env.PUBLIC_APP_URL = previous
    await fixture.close()
  }
})
