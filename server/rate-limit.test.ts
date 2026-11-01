import { ensureOGalleryTenant } from './gallery-bootstrap.ts'
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
delete process.env.O_GALLERY_ACCESS_CODE

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { count, eq } from 'drizzle-orm'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../database/schema.ts'
import { galleries, leads, rateLimits, visits, works } from '../database/schema.ts'
import { LocalObjectStorage } from './storage.ts'
import {
  beginUpload,
  clientIpFrom,
  hashClientAddress,
  rateLimitConfig,
  runPilotRequest,
  runStaffRequest,
  writeApiResult,
  type RateLimitConfig,
} from './rate-limit.ts'

const NOW = new Date('2026-11-01T12:00:00.000Z')
const IP = '203.0.113.10'
const VISITOR = 'visitor-1'

function config(overrides: Partial<RateLimitConfig> = {}): RateLimitConfig {
  return { ...rateLimitConfig({ NODE_ENV: 'test' }), ipSalt: 'test-salt', ...overrides }
}

async function setup() {
  const client = new PGlite()
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../drizzle')
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()
  for (const file of files) {
    const migration = fs.readFileSync(path.join(dir, file), 'utf8')
    for (const statement of migration.split('--> statement-breakpoint').map((part) => part.trim()).filter(Boolean)) {
      await client.exec(statement)
    }
  }
  const db = drizzle(client, { schema })
  await ensureOGalleryTenant(db)
  const mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'inview-rate-'))
  const storage = new LocalObjectStorage(mediaRoot)
  return { client, db, storage, mediaRoot }
}

async function withDb(fn: (ctx: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  const ctx = await setup()
  try {
    await fn(ctx)
  } finally {
    await ctx.client.close()
    fs.rmSync(ctx.mediaRoot, { recursive: true, force: true })
  }
}

async function rowsOf(db: Awaited<ReturnType<typeof setup>>['db'], table: typeof visits | typeof leads) {
  const [row] = await db.select({ n: count() }).from(table)
  return Number(row?.n ?? 0)
}

test('429 response sets Retry-After and both languages', () => {
  const headers: Record<string, string> = {}
  let status = 0
  let body: { error?: string; errorFa?: string } | undefined
  writeApiResult(
    {
      setHeader(name, value) {
        headers[name] = value
      },
      status(code) {
        status = code
        return {
          json(payload) {
            body = payload as { error?: string; errorFa?: string }
          },
        }
      },
    },
    {
      status: 429,
      retryAfterSeconds: 42,
      body: {
        error: 'Too many requests. Try again later.',
        errorFa: 'درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.',
      },
    },
  )
  assert.equal(status, 429)
  assert.equal(headers['Retry-After'], '42')
  assert.equal(body?.error, 'Too many requests. Try again later.')
  assert.equal(body?.errorFa, 'درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.')
})

test('client address comes from CF-Connecting-IP', () => {
  assert.equal(clientIpFrom('203.0.113.9', '10.0.0.8'), '203.0.113.9')
  assert.equal(clientIpFrom('2001:db8::1', '10.0.0.8'), '2001:db8::1')
  assert.equal(clientIpFrom(undefined, '10.0.0.8'), '10.0.0.8')
  assert.equal(clientIpFrom('not an ip', '10.0.0.8'), '10.0.0.8')
  assert.equal(clientIpFrom('203.0.113.9, 198.51.100.2', '10.0.0.8'), '10.0.0.8')
  assert.equal(clientIpFrom('', ''), 'unknown')
})

test('address hash changes each UTC day and invalid limits fall back', () => {
  const ip = '203.0.113.44'
  const salt = 'test-salt'
  const first = hashClientAddress(ip, new Date('2026-11-01T23:00:00.000Z'), salt)
  const nextDay = hashClientAddress(ip, new Date('2026-11-02T00:00:00.000Z'), salt)
  assert.notEqual(first, nextDay)
  assert.equal(first.includes(ip), false)
  const parsed = rateLimitConfig({ NODE_ENV: 'test', RATE_LIMIT_ACCESS_FAIL_IP_MAX: '3', RATE_LIMIT_VISIT_IP_MAX: '0' })
  assert.equal(parsed.accessFailIpMax, 3)
  assert.equal(parsed.visitIpMax, 600)
  assert.equal(parsed.accessFailIpWindowSec, 900)
})

test('failed access codes return 429 and the window opens again', async () => {
  await withDb(async ({ db }) => {
    const limits = config({ accessFailIpMax: 2, accessFailIpWindowSec: 60, accessFailGalleryMax: 100 })
    const first = await runStaffRequest(db, 'wrong-code', IP, NOW, limits)
    const second = await runStaffRequest(db, 'wrong-code', IP, NOW, limits)
    const third = await runStaffRequest(db, 'wrong-code', IP, NOW, limits)
    assert.equal(first.status, 401)
    assert.equal(second.status, 401)
    assert.equal(third.status, 429)
    assert.equal(third.retryAfterSeconds, 60)
    const body = third.body as { error: string; errorFa: string }
    assert.equal(body.error, 'Too many requests. Try again later.')
    assert.equal(body.errorFa, 'درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.')
    const otherIp = await runStaffRequest(db, 'wrong-code', '203.0.113.11', NOW, limits)
    assert.equal(otherIp.status, 401)
    const later = await runStaffRequest(db, 'wrong-code', IP, new Date(NOW.getTime() + 60_000), limits)
    assert.equal(later.status, 401)
    const stored = JSON.stringify(await db.select().from(rateLimits))
    assert.equal(stored.includes(IP), false)
    assert.equal(stored.includes(hashClientAddress(IP, NOW, limits.ipSalt)), true)
  })
})

test('a gallery-wide failure limit blocks a new address', async () => {
  await withDb(async ({ db, storage }) => {
    const limits = config({ accessFailIpMax: 100, accessFailGalleryMax: 2, accessFailGalleryWindowSec: 60 })
    assert.equal((await runPilotRequest(db, storage, 'PUT', { accessCode: 'wrong' }, '198.51.100.1', NOW, limits)).status, 401)
    assert.equal((await runPilotRequest(db, storage, 'PUT', { accessCode: 'wrong' }, '198.51.100.2', NOW, limits)).status, 401)
    const blocked = await runPilotRequest(db, storage, 'PUT', { accessCode: 'wrong' }, '198.51.100.3', NOW, limits)
    assert.equal(blocked.status, 429)
  })
})

test('an accepted access code does not use the failure budget', async () => {
  await withDb(async ({ db }) => {
    const limits = config({ accessFailIpMax: 1, accessAcceptIpMax: 10 })
    assert.equal((await runStaffRequest(db, 'inview', IP, NOW, limits)).status, 200)
    assert.equal((await runStaffRequest(db, 'inview', IP, NOW, limits)).status, 200)
    assert.equal((await runStaffRequest(db, 'inview', IP, NOW, limits)).status, 200)
  })
})

test('accepted access codes stop at their own limit', async () => {
  await withDb(async ({ db }) => {
    const limits = config({ accessFailIpMax: 100, accessAcceptIpMax: 2, accessAcceptIpWindowSec: 60 })
    assert.equal((await runStaffRequest(db, 'inview', IP, NOW, limits)).status, 200)
    assert.equal((await runStaffRequest(db, 'inview', IP, NOW, limits)).status, 200)
    const blocked = await runStaffRequest(db, 'inview', IP, NOW, limits)
    assert.equal(blocked.status, 429)
    assert.equal(blocked.retryAfterSeconds, 60)
    const later = await runStaffRequest(db, 'inview', IP, new Date(NOW.getTime() + 60_000), limits)
    assert.equal(later.status, 200)
  })
})

test('visits stop at the limit and the window opens again', async () => {
  await withDb(async ({ db, storage }) => {
    const limits = config({ visitVisitorMax: 2, visitVisitorWindowSec: 60, visitIpMax: 100 })
    const body = { op: 'visit', kind: 'view', visitorId: VISITOR }
    assert.equal((await runPilotRequest(db, storage, 'POST', body, IP, NOW, limits)).status, 200)
    assert.equal((await runPilotRequest(db, storage, 'POST', body, IP, NOW, limits)).status, 200)
    const blocked = await runPilotRequest(db, storage, 'POST', body, IP, NOW, limits)
    assert.equal(blocked.status, 429)
    assert.equal(blocked.retryAfterSeconds, 60)
    assert.equal(await rowsOf(db, visits), 2)
    const later = await runPilotRequest(db, storage, 'POST', body, IP, new Date(NOW.getTime() + 60_000), limits)
    assert.equal(later.status, 200)
    assert.equal(await rowsOf(db, visits), 3)
  })
})

test('one shared address limits visits from many visitor ids', async () => {
  await withDb(async ({ db, storage }) => {
    const limits = config({ visitVisitorMax: 100, visitIpMax: 2, visitIpWindowSec: 60 })
    const send = (visitorId: string) =>
      runPilotRequest(db, storage, 'POST', { op: 'visit', kind: 'view', visitorId }, IP, NOW, limits)
    assert.equal((await send('visitor-1')).status, 200)
    assert.equal((await send('visitor-2')).status, 200)
    assert.equal((await send('visitor-3')).status, 429)
    assert.equal(await rowsOf(db, visits), 2)
  })
})

test('public reads do not use the visit limit', async () => {
  await withDb(async ({ db, storage }) => {
    const limits = config({ visitVisitorMax: 1, visitIpMax: 1 })
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await runPilotRequest(db, storage, 'GET', null, IP, NOW, limits)).status, 200)
    }
    const unknown = await runPilotRequest(db, storage, 'POST', { op: 'other' }, IP, NOW, limits)
    assert.equal(unknown.status, 400)
    assert.equal((await runPilotRequest(db, storage, 'POST', { op: 'visit', kind: 'view', visitorId: VISITOR }, IP, NOW, limits)).status, 200)
  })
})

test('leads stop at the limit and do not store the extra row', async () => {
  await withDb(async ({ db, storage }) => {
    const limits = config({ leadVisitorMax: 2, leadVisitorWindowSec: 60, leadIpMax: 100 })
    await runPilotRequest(db, storage, 'GET', null, IP, NOW, limits)
    const [gallery] = await db.select().from(galleries).where(eq(galleries.slug, 'o-gallery')).limit(1)
    await db.insert(works).values({ id: 'work0001', galleryId: gallery.id, title: 'Sample work' })
    const body = {
      op: 'lead',
      kind: 'save',
      phone: '09120000000',
      visitorId: VISITOR,
      workId: 'work0001',
      consent: true,
      consentTextVersion: '2026-11-01',
    }
    assert.equal((await runPilotRequest(db, storage, 'POST', body, IP, NOW, limits)).status, 200)
    assert.equal((await runPilotRequest(db, storage, 'POST', body, IP, NOW, limits)).status, 200)
    const blocked = await runPilotRequest(db, storage, 'POST', body, IP, NOW, limits)
    assert.equal(blocked.status, 429)
    assert.equal(await rowsOf(db, leads), 2)
    const stored = JSON.stringify(await db.select().from(rateLimits))
    assert.equal(stored.includes('09120000000'), false)
    assert.equal(stored.includes(IP), false)
    const later = await runPilotRequest(db, storage, 'POST', body, IP, new Date(NOW.getTime() + 60_000), limits)
    assert.equal(later.status, 200)
    assert.equal(await rowsOf(db, leads), 3)
  })
})

test('uploads are limited per gallery and a wrong code does not take an upload slot', async () => {
  await withDb(async ({ db }) => {
    const limits = config({
      accessFailIpMax: 10,
      accessAcceptIpMax: 10,
      uploadGalleryMax: 1,
      uploadGalleryWindowSec: 60,
    })
    const wrong = await beginUpload(db, { gallery: 'o-gallery', accessCode: 'wrong-code', ip: IP, now: NOW, config: limits })
    assert.equal(wrong.ok, false)
    if (!wrong.ok) assert.equal(wrong.result.status, 401)
    const first = await beginUpload(db, { gallery: 'o-gallery', accessCode: 'inview', ip: IP, now: NOW, config: limits })
    assert.equal(first.ok, true)
    const second = await beginUpload(db, { gallery: 'o-gallery', accessCode: 'inview', ip: '203.0.113.20', now: NOW, config: limits })
    assert.equal(second.ok, false)
    if (!second.ok) {
      assert.equal(second.result.status, 429)
      assert.equal(second.result.retryAfterSeconds, 60)
    }
    const later = await beginUpload(db, {
      gallery: 'o-gallery',
      accessCode: 'inview',
      ip: '203.0.113.20',
      now: new Date(NOW.getTime() + 60_000),
      config: limits,
    })
    assert.equal(later.ok, true)
  })
})
