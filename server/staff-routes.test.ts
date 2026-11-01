import test from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { DatabaseContext, type AppDatabase } from '../database/context'
import { auditLogs, galleries, leads, memberships, qrCodes, sessions, shows } from '../database/schema'
import { createUser, createUserSession } from './accounts'
import { hashSecret } from './crypto'
import { createTestDb } from './test-db'
import { signInWithAccessCode } from './staff-session'
import { principalFor } from './authz'
import { staffNext } from './staff'
import { loader as index } from '../app/routes/staff._index'
import { loader as editor } from '../app/routes/staff.gallery'
import { loader as report } from '../app/routes/staff.report'
import { loader as preview } from '../app/routes/staff.preview'
import { loader as team, action as teamAction } from '../app/routes/staff.team'
import { loader as qr, action as qrAction } from '../app/routes/staff.qr'
import { loader as qrSvg } from '../app/routes/staff.qr-svg'
import { action as signIn, loader as signInLoader } from '../app/routes/staff.sign-in'
import { action as signOut } from '../app/routes/staff.sign-out'
import { loader as legacyGallery } from '../app/routes/dashboard.legacy'
import { loader as legacySignIn } from '../app/routes/dashboard.sign-in'

async function fixture() {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  const tenants = []
  for (const slug of ['staff-a', 'staff-b']) {
    const [gallery] = await db.insert(galleries).values({ slug, nameEn: slug, nameFa: slug, status: 'draft', sharedCodeEnabled: true, accessCodeHash: hashSecret('gallery-password') }).returning()
    const [show] = await db.insert(shows).values({ galleryId: gallery.id, titleEn: `${slug} show` }).returning()
    tenants.push({ gallery, show })
  }
  const actors: Record<string, { cookie: string; userId?: string }> = { anonymous: { cookie: '' } }
  for (const role of ['owner', 'editor', 'viewer', 'other', 'admin', 'support'] as const) {
    const user = await createUser(db, { email: `${role}@example.com`, password: 'account-password', platformRole: role === 'admin' || role === 'support' ? role : null })
    if (role !== 'admin' && role !== 'support') await db.insert(memberships).values({ userId: user.id, galleryId: tenants[role === 'other' ? 1 : 0].gallery.id, role: role === 'other' ? 'owner' : role })
    actors[role] = { userId: user.id, cookie: (await createUserSession(db, user.id, false)).cookie }
  }
  const shared = await signInWithAccessCode(db, 'gallery-password', 'staff-a')
  actors.shared = { cookie: `inview_staff=${shared!.token}` }
  const invoke = <T>(handler: (args: { request: Request; params: { slug: string }; context: object }) => Promise<T>, role: string, slug = 'staff-a', fields?: Record<string, string>, search = '') => {
    const request = new Request(`http://localhost/staff/${slug}${search}`, { method: fields ? 'POST' : 'GET', headers: { cookie: actors[role].cookie, origin: 'http://localhost' }, ...(fields ? { body: new URLSearchParams(fields) } : {}) })
    return DatabaseContext.run(db, () => handler({ request, params: { slug }, context: {} }))
  }
  return { ...fixture, db, tenants, actors, invoke }
}

test('every staff loader and write route enforces gallery permissions for every principal', async () => {
  const f = await fixture()
  try {
    await f.db.insert(qrCodes).values({ showId: f.tenants[0].show.id, code: 'staff-a-entry', label: 'Entry' })
    const routes = [
      { handler: editor, allowed: ['owner', 'editor', 'viewer', 'admin', 'support', 'shared'] },
      { handler: report, allowed: ['owner', 'editor', 'viewer', 'admin', 'support', 'shared'] },
      { handler: preview, allowed: ['owner', 'editor', 'viewer', 'admin', 'support', 'shared'] },
      { handler: team, allowed: ['owner', 'admin', 'support'] },
      { handler: qr, allowed: ['owner', 'editor', 'admin', 'support', 'shared'] },
      { handler: (args: Parameters<typeof qrSvg>[0]) => qrSvg({ ...args, params: { ...args.params, code: 'staff-a-entry' } }), allowed: ['owner', 'editor', 'admin', 'support', 'shared'], response: true },
      { handler: qrAction, allowed: ['owner', 'editor', 'admin', 'support', 'shared'], fields: { label: 'Entrance' } },
      { handler: teamAction, allowed: ['owner', 'admin', 'support'], fields: { intent: 'invite', role: 'viewer', identifier: '' } },
    ]
    for (const [routeIndex, route] of routes.entries()) {
      for (const role of Object.keys(f.actors)) {
        const fields = route.fields ? { ...route.fields, ...(route.fields.intent ? { identifier: `${role}-${routeIndex}@invite.test` } : {}) } : undefined
        const promise = f.invoke(route.handler, role, 'staff-a', fields)
        if (route.allowed.includes(role)) {
          const value = await promise
          assert.ok(value, `${routeIndex} ${role}`)
          assert.equal(value instanceof Response, !!route.response)
        } else {
          await assert.rejects(promise, (error: unknown) => {
            assert.ok(error instanceof Response)
            assert.equal(error.status, role === 'anonymous' ? 302 : 403, `${routeIndex} ${role}`)
            if (role === 'anonymous') assert.equal(error.headers.get('location'), '/staff/sign-in?next=%2Fstaff%2Fstaff-a')
            return true
          })
        }
      }
      await assert.rejects(f.invoke(route.handler, 'owner', 'missing', route.fields), (error: unknown) => error instanceof Response && error.status === 404)
    }
    for (const route of routes) {
      await f.db.update(galleries).set({ sharedCodeEnabled: false }).where(eq(galleries.id, f.tenants[0].gallery.id))
      await assert.rejects(f.invoke(route.handler, 'shared', 'staff-a', route.fields), (error: unknown) => error instanceof Response && error.status === 302)
    }
    assert.equal(await principalFor(f.db, f.actors.shared.cookie), null)
  } finally { await f.close() }
})

test('draft preview, report phone privacy, QR scope and audits use the current tenant', async () => {
  const f = await fixture()
  try {
    const { gallery, show } = f.tenants[0]
    await f.db.insert(leads).values({ galleryId: gallery.id, showId: show.id, phone: '09123456789', kind: 'ask', consentAt: new Date(), consentTextVersion: 'v1' })
    for (const [role, phone] of Object.entries({ owner: '09123456789', editor: '09123456789', admin: '09123456789', support: '0912•••••89', viewer: '', shared: '' })) {
      const value = await f.invoke(report, role)
      assert.equal(value.report.leads[0].phone, phone)
      assert.equal(JSON.stringify(value).includes('accessCodeHash'), false)
    }
    assert.equal((await f.invoke(preview, 'owner')).record.slug, gallery.slug)
    await f.invoke(qrAction, 'owner', gallery.slug, { label: 'Entry' })
    const [created] = await f.db.select().from(qrCodes)
    assert.equal(created.showId, show.id)
    const svg = await f.invoke((args) => qrSvg({ ...args, params: { ...args.params, code: created.code } }), 'owner', gallery.slug)
    assert.ok(svg instanceof Response)
    assert.equal(svg.headers.get('Content-Type'), 'image/svg+xml')
    assert.match(await svg.text(), /^<svg/)
    await assert.rejects(f.invoke((args) => qrSvg({ ...args, params: { ...args.params, code: created.code } }), 'other', 'staff-b'), (error: unknown) => error instanceof Response && error.status === 404)
    const [audit] = await f.db.select().from(auditLogs)
    assert.equal(audit.actorUserId, f.actors.owner.userId)
    assert.equal(audit.galleryId, gallery.id)
    assert.equal(audit.action, 'create-qr')
    await f.invoke(qrAction, 'shared', gallery.slug, { label: 'Shared' })
    const logs = await f.db.select().from(auditLogs)
    assert.ok(logs.some((row) => row.actorUserId === null && row.summary.kind === 'shared-code'))
  } finally { await f.close() }
})

test('staff index lists memberships, operators see all, and single galleries redirect', async () => {
  const f = await fixture()
  try {
    for (const role of ['owner', 'editor', 'viewer', 'shared']) {
      await assert.rejects(f.invoke(index, role), (error: unknown) => error instanceof Response && error.status === 302 && error.headers.get('location') === '/staff/staff-a')
    }
    for (const role of ['admin', 'support']) assert.equal((await f.invoke(index, role)).galleries.length, 2)
    await f.db.insert(memberships).values({ galleryId: f.tenants[1].gallery.id, userId: f.actors.owner.userId!, role: 'editor' })
    assert.equal((await f.invoke(index, 'owner')).galleries.length, 2)
    await assert.rejects(f.invoke(index, 'anonymous'), (error: unknown) => error instanceof Response && error.status === 302)
  } finally { await f.close() }
})

test('staff sign-in handles email, phone and enabled gallery code, validates next, and signs out both cookies', async () => {
  const f = await fixture()
  try {
    const call = (fields: Record<string, string>, next = '') => DatabaseContext.run(f.db, () => signIn({ request: new Request(`http://localhost/staff/sign-in${next}`, { method: 'POST', headers: { origin: 'http://localhost' }, body: new URLSearchParams(fields) }), context: {} }))
    const signed = await call({ identifier: 'owner@example.com', password: 'account-password' }, '?next=%2Fstaff%2Fstaff-a%2Freport')
    assert.ok(signed instanceof Response)
    assert.equal(signed.headers.get('location'), '/staff/staff-a/report')
    assert.match(signed.headers.get('set-cookie')!, /inview_session=/)
    const phone = await createUser(f.db, { phone: '09121112233', password: 'phone-password' })
    const byPhone = await call({ identifier: '+989121112233', password: 'phone-password' }, '?next=https://evil.test')
    assert.ok(byPhone instanceof Response)
    assert.equal(byPhone.headers.get('location'), '/staff')
    assert.equal((await principalFor(f.db, byPhone.headers.get('set-cookie')))?.kind, 'staff')
    assert.ok(phone.id)
    const shared = await call({ intent: 'shared-code', gallery: 'staff-a', accessCode: 'gallery-password' })
    assert.ok(shared instanceof Response)
    assert.equal(shared.headers.get('location'), '/staff/staff-a')
    const existing = await DatabaseContext.run(f.db, () => signInLoader({ request: new Request('http://localhost/staff/sign-in?next=//evil.test', { headers: { cookie: f.actors.owner.cookie } }) }))
    assert.equal(existing?.headers.get('location'), '/staff')
    const request = new Request('http://localhost/staff/sign-out', { method: 'POST', headers: { origin: 'http://localhost', cookie: `${f.actors.owner.cookie.split(';')[0]}; ${f.actors.shared.cookie}` } })
    const ended = await DatabaseContext.run(f.db, () => signOut({ request }))
    assert.equal(ended.headers.getSetCookie().length, 2)
    assert.equal(await principalFor(f.db, request), null)
    await f.db.update(galleries).set({ sharedCodeEnabled: false }).where(eq(galleries.id, f.tenants[0].gallery.id))
    const denied = await call({ intent: 'shared-code', gallery: 'staff-a', accessCode: 'gallery-password' })
    assert.equal('init' in denied && denied.init?.status, 401)
    assert.equal((await f.db.select().from(sessions).where(eq(sessions.userId, f.actors.owner.userId!))).length, 1)
    await assert.rejects(DatabaseContext.run(f.db, () => signIn({ request: new Request('http://localhost/staff/sign-in', { method: 'POST', body: new URLSearchParams({ identifier: 'owner@example.com', password: 'account-password' }) }), context: {} })), (error: unknown) => error instanceof Response && error.status === 403)
  } finally { await f.close() }
})

test('staff next paths are same-site and legacy redirects preserve queries', () => {
  for (const value of ['https://evil.test', '//evil.test', '/staffish', '/staff/../ops', '/staff/%2e%2e/ops', '/staff\\evil', '/staff/sign-in', '/staff/sign-out']) assert.equal(staffNext(value), '/staff')
  assert.equal(staffNext('/staff/a/report?view=week'), '/staff/a/report?view=week')
  const first = legacyGallery({ request: new Request('http://localhost/dashboard/o-gallery?lang=en'), params: { slug: 'o-gallery' } })
  assert.equal(first.status, 302)
  assert.equal(first.headers.get('location'), '/staff/o-gallery?lang=en')
  const second = legacySignIn({ request: new Request('http://localhost/dashboard/sign-in?next=%2Fstaff') })
  assert.equal(second.status, 302)
  assert.equal(second.headers.get('location'), '/staff/sign-in?next=%2Fstaff')
})

test('staff team actions use scoped management helpers and reject cross-origin writes', async () => {
  const f = await fixture()
  try {
    const target = f.actors.editor.userId!
    for (const fields of [
      { intent: 'role', role: 'viewer', userId: target },
      { intent: 'disable', userId: target },
      { intent: 'enable', userId: target },
      { intent: 'reset', userId: target },
      { intent: 'sign-out', userId: target },
      { intent: 'remove', userId: target },
    ]) {
      const value = await f.invoke(teamAction, 'owner', 'staff-a', fields)
      assert.equal('error' in value && value.error, false)
    }
    for (const intent of ['role', 'disable', 'enable', 'reset', 'sign-out', 'remove']) {
      await assert.rejects(f.invoke(teamAction, 'owner', 'staff-a', { intent, role: 'viewer', userId: f.actors.other.userId! }), (error: unknown) => error instanceof Response && error.status === 403)
    }
    for (const handler of [teamAction, qrAction]) {
      const request = new Request('http://localhost/staff/staff-a/team', { method: 'POST', headers: { cookie: f.actors.owner.cookie, origin: 'https://foreign.test' }, body: new URLSearchParams({ intent: 'invite', identifier: 'new@example.com', role: 'editor', label: 'Entry' }) })
      await assert.rejects(DatabaseContext.run(f.db, () => handler({ request, params: { slug: 'staff-a' } })), (error: unknown) => error instanceof Response && error.status === 403)
    }
    const logs = await f.db.select().from(auditLogs)
    assert.ok(['team-role', 'team-disable', 'team-enable', 'team-reset', 'team-sign-out', 'team-remove'].every((action) => logs.some((row) => row.action === action && row.actorUserId === f.actors.owner.userId)))
  } finally { await f.close() }
})
