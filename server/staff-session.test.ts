import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import fs from 'node:fs'
import * as schema from '../database/schema.ts'
import { sessions } from '../database/schema.ts'
import { sha256 } from './crypto.ts'
import { resolveOGalleryAccessCode, publishGalleryRecordForSession, readStaffReportForSession } from './gallery-record.ts'
import { handlePilotApi } from './pilot-api.ts'
import { LocalObjectStorage } from './storage.ts'
import {
  STAFF_COOKIE,
  anonymousEditorGate,
  completeSignIn,
  completeSignOut,
  readStaffSession,
  signInWithAccessCode,
} from './staff-session.ts'

process.env.NODE_ENV = 'test'
delete process.env.O_GALLERY_ACCESS_CODE

async function setup() {
  const client = new PGlite()
  const drizzleDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../drizzle')
  const files = fs.readdirSync(drizzleDir).filter((name) => name.endsWith('.sql')).sort()
  for (const file of files) {
    const migration = fs.readFileSync(path.join(drizzleDir, file), 'utf8')
    for (const statement of migration.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
      await client.exec(statement)
    }
  }
  const db = drizzle(client, { schema })
  const mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'inview-media-'))
  const storage = new LocalObjectStorage(mediaRoot)
  return { client, db, storage, mediaRoot }
}

function cookieHeader(token: string) {
  return `${STAFF_COOKIE}=${encodeURIComponent(token)}`
}

test('sign-in stores only the token hash and sets an httpOnly cookie', async () => {
  const { client, db, mediaRoot } = await setup()
  try {
    const code = resolveOGalleryAccessCode({ NODE_ENV: 'test' })
    const created = await signInWithAccessCode(db, code)
    assert.ok(created)
    const [row] = await db.select().from(sessions)
    assert.equal(row.userId, null)
    assert.equal(row.galleryId, created.galleryId)
    assert.equal(row.tokenHash, sha256(created.token))
    assert.equal(row.tokenHash === created.token, false)
    assert.equal(JSON.stringify(row).includes(created.token), false)
    assert.equal(JSON.stringify(row).includes(code), false)

    const result = await completeSignIn(db, code, true)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.match(result.cookie, /HttpOnly/)
    assert.match(result.cookie, /Secure/)
    assert.match(result.cookie, /SameSite=Lax/)
    const cookieValue = decodeURIComponent(result.cookie.split(';')[0].split('=').slice(1).join('='))
    assert.equal(cookieValue === code, false)
    assert.equal(result.location, '/dashboard/o-gallery')

    const open = await completeSignIn(db, code, false)
    assert.equal(open.ok, true)
    if (!open.ok) return
    assert.match(open.cookie, /HttpOnly/)
    assert.match(open.cookie, /SameSite=Lax/)
    assert.doesNotMatch(open.cookie, /Secure/)
  } finally {
    await client.close()
    fs.rmSync(mediaRoot, { recursive: true, force: true })
  }
})

test('a wrong access code does not create a session', async () => {
  const { client, db, mediaRoot } = await setup()
  try {
    const denied = await completeSignIn(db, 'not-the-code', true)
    assert.equal(denied.ok, false)
    if (denied.ok) return
    assert.equal(denied.error, 'That access code does not match.')
    const rows = await db.select().from(sessions)
    assert.equal(rows.length, 0)
  } finally {
    await client.close()
    fs.rmSync(mediaRoot, { recursive: true, force: true })
  }
})

test('an expired session is deleted and does not open the editor', async () => {
  const { client, db, mediaRoot } = await setup()
  try {
    const code = resolveOGalleryAccessCode({ NODE_ENV: 'test' })
    const created = await signInWithAccessCode(db, code)
    assert.ok(created)
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.tokenHash, created.tokenHash))
    const session = await readStaffSession(db, cookieHeader(created.token))
    assert.equal(session, null)
    const rows = await db.select().from(sessions)
    assert.equal(rows.length, 0)
    const gate = anonymousEditorGate(null)
    assert.equal(gate?.status, 302)
    assert.equal(gate?.headers.get('location'), '/dashboard/sign-in')
    assert.equal(gate?.headers.get('cache-control'), 'no-store')
  } finally {
    await client.close()
    fs.rmSync(mediaRoot, { recursive: true, force: true })
  }
})

test('sign-out deletes the session and clears the cookie', async () => {
  const { client, db, mediaRoot } = await setup()
  try {
    const code = resolveOGalleryAccessCode({ NODE_ENV: 'test' })
    const created = await signInWithAccessCode(db, code)
    assert.ok(created)
    const ended = await completeSignOut(db, cookieHeader(created.token), true)
    assert.equal(ended.location, '/dashboard/sign-in')
    assert.match(ended.cookie, /HttpOnly/)
    assert.match(ended.cookie, /Secure/)
    assert.match(ended.cookie, /SameSite=Lax/)
    assert.match(ended.cookie, /Max-Age=0/)
    const rows = await db.select().from(sessions)
    assert.equal(rows.length, 0)
    const again = await readStaffSession(db, cookieHeader(created.token))
    assert.equal(again, null)
  } finally {
    await client.close()
    fs.rmSync(mediaRoot, { recursive: true, force: true })
  }
})

test('a staff session can publish and read the report without sending the access code', async () => {
  const { client, db, storage, mediaRoot } = await setup()
  try {
    const code = resolveOGalleryAccessCode({ NODE_ENV: 'test' })
    const created = await signInWithAccessCode(db, code)
    assert.ok(created)
    const session = await readStaffSession(db, cookieHeader(created.token))
    assert.ok(session)
    assert.equal(anonymousEditorGate(session), null)

    const first = await handlePilotApi(db, storage, 'GET', null)
    const published = await publishGalleryRecordForSession(db, storage, session.galleryId, {
      ...(first.body as { record: object }).record,
      works: [],
    })
    assert.equal(published.status, 200)
    const denied = await publishGalleryRecordForSession(
      db,
      storage,
      '00000000-0000-4000-8000-000000000099',
      (first.body as { record: unknown }).record,
    )
    assert.equal(denied.status, 401)

    const report = await readStaffReportForSession(db, session.galleryId)
    assert.equal(report.status, 200)
    const hidden = await readStaffReportForSession(db, '00000000-0000-4000-8000-000000000099')
    assert.equal(hidden.status, 401)
    assert.equal(JSON.stringify(report.body).includes(code), false)
  } finally {
    await client.close()
    fs.rmSync(mediaRoot, { recursive: true, force: true })
  }
})
