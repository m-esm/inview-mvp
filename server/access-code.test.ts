import test from 'node:test'
import assert from 'node:assert/strict'

// Publish checks in this file use the development default. Production cases pass an env object.
process.env.NODE_ENV = 'test'
delete process.env.O_GALLERY_ACCESS_CODE
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import fs from 'node:fs'
import * as schema from '../database/schema.ts'
import { galleries } from '../database/schema.ts'
import { hashSecret, verifySecret } from './crypto.ts'
import {
  ensureOGalleryTenant,
  resolveOGalleryAccessCode,
  syncOGalleryAccessCode,
} from './gallery-record.ts'
import { handlePilotApi } from './pilot-api.ts'
import { LocalObjectStorage } from './storage.ts'

const ALPHA = 'alpha-code'
const BETA = 'beta-code'

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

async function insertGallery(db: Awaited<ReturnType<typeof setup>>['db'], accessCodeHash: string | null) {
  await db.insert(galleries).values({
    slug: 'o-gallery',
    nameEn: 'O Gallery',
    nameFa: 'گالری اُ',
    subdomain: 'ogallery',
    accessCodeHash,
  })
}

async function readHash(db: Awaited<ReturnType<typeof setup>>['db']) {
  const [row] = await db.select().from(galleries).where(eq(galleries.slug, 'o-gallery')).limit(1)
  return row?.accessCodeHash ?? null
}

async function withSilentConsole<T>(fn: () => Promise<T>) {
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const
  const original = Object.fromEntries(methods.map((method) => [method, console[method]])) as Record<
    (typeof methods)[number],
    (...args: unknown[]) => void
  >
  const lines: string[] = []
  for (const method of methods) {
    console[method] = (...args: unknown[]) => {
      lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '))
    }
  }
  try {
    const result = await fn()
    return { result, lines }
  } finally {
    for (const method of methods) console[method] = original[method]
  }
}

function assertNoSecret(lines: string[], secrets: string[]) {
  const blob = lines.join('\n')
  for (const secret of secrets) {
    if (!secret) continue
    assert.equal(blob.includes(secret), false)
  }
}

async function publish(db: Awaited<ReturnType<typeof setup>>['db'], storage: LocalObjectStorage, accessCode: string) {
  const first = await handlePilotApi(db, storage, 'GET', null)
  return handlePilotApi(db, storage, 'PUT', {
    accessCode,
    record: {
      ...(first.body as { record: object }).record,
      works: [
        {
          id: 'samplework1',
          title: 'Sample work',
          artist: '',
          sample: true,
          price: 1000,
          status: 'available',
          medium: '',
          size: '',
          year: '',
          image: '',
        },
      ],
    },
  })
}

test('null access-code hash is replaced and publish accepts the configured code', async () => {
  const { client, db, storage, mediaRoot } = await setup()
  try {
    await insertGallery(db, null)
    const { lines } = await withSilentConsole(() =>
      syncOGalleryAccessCode(db, { NODE_ENV: 'production', O_GALLERY_ACCESS_CODE: ALPHA }),
    )
    const hash = await readHash(db)
    assertNoSecret(lines, [ALPHA, hash || ''])
    assert.equal(verifySecret(ALPHA, hash), true)
    assert.equal(verifySecret('inview', hash), false)
    const published = await publish(db, storage, ALPHA)
    assert.equal(published.status, 200)
    const denied = await publish(db, storage, BETA)
    assert.equal(denied.status, 401)
    const before = await readHash(db)
    await syncOGalleryAccessCode(db, { NODE_ENV: 'production', O_GALLERY_ACCESS_CODE: ALPHA })
    assert.equal((await readHash(db)) === before, true)
  } finally {
    await client.close()
    fs.rmSync(mediaRoot, { recursive: true, force: true })
  }
})

test('a changed access code replaces the stored hash', async () => {
  const { client, db, storage, mediaRoot } = await setup()
  try {
    await insertGallery(db, hashSecret(ALPHA))
    const oldHash = await readHash(db)
    const { lines } = await withSilentConsole(() =>
      syncOGalleryAccessCode(db, { NODE_ENV: 'production', O_GALLERY_ACCESS_CODE: BETA }),
    )
    const hash = await readHash(db)
    assertNoSecret(lines, [ALPHA, BETA, oldHash || '', hash || ''])
    assert.equal(hash === oldHash, false)
    assert.equal(verifySecret(BETA, hash), true)
    assert.equal(verifySecret(ALPHA, hash), false)
    assert.equal(verifySecret('inview', hash), false)
    const published = await publish(db, storage, BETA)
    assert.equal(published.status, 200)
    const denied = await publish(db, storage, ALPHA)
    assert.equal(denied.status, 401)
  } finally {
    await client.close()
    fs.rmSync(mediaRoot, { recursive: true, force: true })
  }
})

test('production does not start or use the development code when the env var is missing', async () => {
  assert.throws(
    () => resolveOGalleryAccessCode({ NODE_ENV: 'production' }),
    /O_GALLERY_ACCESS_CODE is required in production\./,
  )
  assert.throws(
    () => resolveOGalleryAccessCode({ NODE_ENV: 'production', O_GALLERY_ACCESS_CODE: '   ' }),
    /O_GALLERY_ACCESS_CODE is required in production\./,
  )
  assert.equal(resolveOGalleryAccessCode({ NODE_ENV: 'development' }), 'inview')
  assert.equal(resolveOGalleryAccessCode({}), 'inview')

  const { client, db, mediaRoot } = await setup()
  try {
    await insertGallery(db, null)
    await assert.rejects(
      () => syncOGalleryAccessCode(db, { NODE_ENV: 'production' }),
      /O_GALLERY_ACCESS_CODE is required in production\./,
    )
    const hash = await readHash(db)
    assert.equal(hash == null, true)
    assert.equal(verifySecret('inview', hash), false)

    const empty = await setup()
    try {
      await assert.rejects(
        () => ensureOGalleryTenant(empty.db, undefined, { NODE_ENV: 'production' }),
        /O_GALLERY_ACCESS_CODE is required in production\./,
      )
      const [row] = await empty.db.select().from(galleries)
      assert.equal(row, undefined)
    } finally {
      await empty.client.close()
      fs.rmSync(empty.mediaRoot, { recursive: true, force: true })
    }
  } finally {
    await client.close()
    fs.rmSync(mediaRoot, { recursive: true, force: true })
  }
})
