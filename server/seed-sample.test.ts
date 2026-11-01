import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import postgres from 'postgres'
import { CONSENT_TEXT_VERSION } from '../app/lib/consent.ts'
import { parseToman } from '../app/lib/price.ts'
import { tehranDay as appTehranDay } from '../app/lib/tehran-day.ts'
import { verifySecret } from './crypto.ts'
import { displayVariant, processAndStoreImage, VARIANT_WIDTHS } from './images.ts'
import { createObjectStorage, LocalObjectStorage } from './storage.ts'
import * as seed from '../scripts/seed-sample.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SEED = path.join(ROOT, 'scripts/seed-sample.mjs')

test('the seed hashes an access code the way the server verifies it', () => {
  const hash = seed.hashAccessCode('demo-code-123')
  assert.ok(verifySecret('demo-code-123', hash))
  assert.equal(verifySecret('other', hash), false)
  assert.notEqual(seed.generateAccessCode(), seed.generateAccessCode())
})

test('the seed constants match the app constants', () => {
  assert.equal(seed.CONSENT_TEXT_VERSION, CONSENT_TEXT_VERSION)
  assert.deepEqual(seed.VARIANT_WIDTHS, [...VARIANT_WIDTHS])
  const at = new Date('2026-11-01T20:40:00Z')
  assert.equal(seed.tehranDay(at), appTehranDay(at))
  for (const work of [...seed.WORKS, seed.REMOVED_WORK]) {
    assert.equal(seed.tomanFromText(work.price), parseToman(work.price), work.id)
  }
})

test('the seed covers every work status, price on request, a sample and a removed work', () => {
  const statuses = new Set(seed.WORKS.map((work: { status: string }) => work.status))
  assert.deepEqual([...statuses].sort(), ['available', 'reserved', 'sold'])
  assert.ok(seed.WORKS.some((work: { price: string | null; status: string }) => work.price === null && work.status !== 'sold'))
  assert.ok(seed.WORKS.some((work: { sample?: boolean }) => work.sample))
  assert.ok(seed.LEADS.some((lead: { work: string | null }) => lead.work === seed.REMOVED_WORK.id))
  assert.ok(seed.LEADS.length >= 15)
  assert.deepEqual([...new Set(seed.LEADS.map((lead: { kind: string }) => lead.kind))].sort(), ['ask', 'save'])
  const formats = new Set([...seed.WORKS, seed.REMOVED_WORK].map((work: { image: unknown[] }) => work.image[4]))
  assert.deepEqual([...formats].sort(), ['jpeg', 'png', 'webp'])
})

test('the seed stores images with the same keys and variants as the upload API', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inview-seed-media-'))
  try {
    const input = await seed.renderArtwork(7, 900, 700, 'circles', 'png')
    const env = { MEDIA_DIR: path.join(dir, 'seed') }
    const fromSeed = await seed.storeImage(seed.storageFromEnv(env), 'sample', 'image-id', input)
    const uploaded = await processAndStoreImage(new LocalObjectStorage(path.join(dir, 'api')), 'sample', input)
    const id = uploaded.key.split('/')[3]
    const normalize = (value: string) => value.replace(id, 'image-id')
    assert.equal(fromSeed.key, normalize(uploaded.key))
    assert.deepEqual(
      Object.fromEntries(Object.entries(fromSeed.variants).map(([name, url]) => [name, url])),
      Object.fromEntries(Object.entries(uploaded.variants).map(([name, url]) => [name, normalize(url)])),
    )
    assert.equal(seed.displayVariant(fromSeed.variants), normalize(String(displayVariant(uploaded.variants))))
    const meta = await sharp(fs.readFileSync(path.join(dir, 'seed', fromSeed.key))).metadata()
    assert.equal(meta.exif, undefined)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the seed builds public media URLs the way the server does', () => {
  const env = {
    S3_BUCKET: 'inview',
    S3_ACCESS_KEY_ID: 'id',
    S3_SECRET_ACCESS_KEY: 'secret',
    S3_ENDPOINT: 'https://s3.example.test',
  }
  const saved = { ...process.env }
  try {
    Object.assign(process.env, env)
    delete process.env.S3_PUBLIC_BASE
    delete process.env.S3_PUBLIC_HOST
    const key = 'u/galleries/sample/abc/w640.webp'
    assert.equal(seed.storageFromEnv(process.env).publicUrl(key), createObjectStorage().publicUrl(key))
    process.env.S3_PUBLIC_BASE = 'https://media.example.test/inview/'
    assert.equal(seed.storageFromEnv(process.env).publicUrl(key), createObjectStorage().publicUrl(key))
  } finally {
    process.env = saved
  }
  assert.equal(seed.mediaObjectKey('sample', 'abc'), 'u/galleries/sample/abc')
})

const baseUrl = process.env.SEED_TEST_DATABASE_URL || process.env.DATABASE_URL

function databaseUrl(base: string, name: string) {
  const url = new URL(base)
  url.pathname = `/${name}`
  return url.toString()
}

function runSeed(url: string, mediaDir: string, accessCode?: string): string {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, DATABASE_URL: url, MEDIA_DIR: mediaDir, PUBLIC_APP_URL: 'https://inview.test' }
  if (accessCode) env.SAMPLE_GALLERY_ACCESS_CODE = accessCode
  return execFileSync(process.execPath, [SEED], { cwd: ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

async function snapshotOtherGalleries(sql: postgres.Sql) {
  return sql`
    SELECT g.slug, g.name_en, g.access_code_hash, g.updated_at,
      (SELECT count(*) FROM works w WHERE w.gallery_id = g.id)::int AS works,
      (SELECT count(*) FROM leads l WHERE l.gallery_id = g.id)::int AS leads,
      (SELECT count(*) FROM visits v JOIN shows s ON s.id = v.show_id WHERE s.gallery_id = g.id)::int AS visits,
      (SELECT count(*) FROM qr_codes q JOIN shows s ON s.id = q.show_id WHERE s.gallery_id = g.id)::int AS qr_codes,
      (SELECT count(*) FROM media m WHERE m.gallery_id = g.id)::int AS media
    FROM galleries g WHERE g.slug <> 'sample' ORDER BY g.slug`
}

test(
  'the seed is idempotent, keeps its access code, and leaves O Gallery untouched',
  { skip: baseUrl ? false : 'Set SEED_TEST_DATABASE_URL or DATABASE_URL to a Postgres server.' },
  async () => {
    const name = `inview_seed_test_${process.pid}`
    const admin = postgres(databaseUrl(String(baseUrl), 'postgres'), { max: 1, onnotice: () => {} })
    const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inview-seed-run-'))
    await admin.unsafe(`CREATE DATABASE ${name}`)
    const url = databaseUrl(String(baseUrl), name)
    const sql = postgres(url, { max: 1, onnotice: () => {} })
    try {
      execFileSync(process.execPath, ['scripts/migrate.mjs'], { cwd: ROOT, env: { PATH: process.env.PATH, DATABASE_URL: url }, stdio: 'ignore' })
      const [o] = await sql`
        INSERT INTO galleries (slug, name_en, name_fa, access_code_hash) VALUES ('o-gallery', 'O Gallery', 'گالری اُ', 'scrypt$aa$bb')
        RETURNING id`
      const [show] = await sql`INSERT INTO shows (gallery_id, title_en) VALUES (${o.id}, 'O show') RETURNING id`
      await sql`INSERT INTO works (id, gallery_id, title) VALUES ('o-work-0001', ${o.id}, 'O work')`
      await sql`INSERT INTO qr_codes (show_id, code) VALUES (${show.id}, 'o-gallery-main')`
      await sql`INSERT INTO visits (show_id, visitor_id, kind, day) VALUES (${show.id}, 'o-visitor-01', 'scan', '2026-11-01')`
      await sql`
        INSERT INTO leads (gallery_id, show_id, work_id, phone, kind, consent_at, consent_text_version)
        VALUES (${o.id}, ${show.id}, 'o-work-0001', '09120000001', 'save', now(), ${CONSENT_TEXT_VERSION})`
      const before = await snapshotOtherGalleries(sql)

      const first = runSeed(url, mediaDir)
      const printed = first.trim().split('\n')
      assert.equal(printed.length, 1)
      const match = /^SAMPLE_ACCESS_CODE=(\S+)$/.exec(printed[0])
      assert.ok(match, 'the first run prints the generated code once')
      const [gallery] = await sql`SELECT id, access_code_hash, is_demo FROM galleries WHERE slug = 'sample'`
      assert.ok(verifySecret(match[1], gallery.access_code_hash))
      assert.equal(gallery.is_demo, true)
      const firstCounts = await seed.countRows(sql, gallery.id)

      const second = runSeed(url, mediaDir)
      assert.equal(second.trim(), '')
      const [again] = await sql`SELECT id, access_code_hash, is_demo FROM galleries WHERE slug = 'sample'`
      assert.equal(again.id, gallery.id)
      assert.equal(again.is_demo, true)
      assert.equal(again.access_code_hash, gallery.access_code_hash)
      assert.deepEqual(await seed.countRows(sql, gallery.id), firstCounts)

      assert.equal(firstCounts.galleries, 1)
      assert.equal(firstCounts.works, 13)
      assert.equal(firstCounts.removed_works, 1)
      assert.equal(firstCounts.show_works, 12)
      assert.equal(firstCounts.qr_codes, 3)
      assert.ok(firstCounts.leads >= 15)
      assert.ok(firstCounts.scans > 0 && firstCounts.views > 0)
      const days = await sql`
        SELECT count(DISTINCT v.day)::int AS days FROM visits v JOIN shows s ON s.id = v.show_id WHERE s.gallery_id = ${gallery.id}`
      assert.ok(days[0].days >= 29)

      const third = runSeed(url, mediaDir, 'configured-sample-code')
      assert.equal(third.trim(), '')
      assert.ok(!third.includes('configured-sample-code'))
      const [configured] = await sql`SELECT access_code_hash FROM galleries WHERE slug = 'sample'`
      assert.ok(verifySecret('configured-sample-code', configured.access_code_hash))

      assert.deepEqual(await snapshotOtherGalleries(sql), before)
    } finally {
      await sql.end({ timeout: 5 })
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`)
      await admin.end({ timeout: 5 })
      fs.rmSync(mediaDir, { recursive: true, force: true })
    }
  },
)
