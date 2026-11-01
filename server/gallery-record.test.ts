import test from 'node:test'
import assert from 'node:assert/strict'

// Keep this file on the development default even when the runner sets NODE_ENV=production.
process.env.NODE_ENV = 'test'
delete process.env.O_GALLERY_ACCESS_CODE
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../database/schema.ts'
import { handlePilotApi } from './pilot-api.ts'
import { LocalObjectStorage } from './storage.ts'
import os from 'node:os'
import fs from 'node:fs'

async function setup() {
  const client = new PGlite()
  const migration = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../drizzle/0000_adr0001_init.sql'),
    'utf8',
  )
  // pgcrypto / gen_random_uuid: PGlite supports gen_random_uuid in recent builds.
  for (const statement of migration.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) {
    await client.exec(statement)
  }
  const db = drizzle(client, { schema })
  const mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'inview-media-'))
  const storage = new LocalObjectStorage(mediaRoot)
  return { client, db, storage, mediaRoot }
}

test('O Gallery publish, scan dedupe, view and lead use the multi-tenant tables', async () => {
  const { client, db, storage, mediaRoot } = await setup()
  try {
    const first = await handlePilotApi(db, storage, 'GET', null)
    assert.equal(first.status, 200)
    assert.equal((first.body as { record: { slug: string } }).record.slug, 'o-gallery')
    assert.equal((first.body as { record: { works: unknown[] } }).record.works.length, 0)

    const denied = await handlePilotApi(db, storage, 'PUT', {
      password: 'nope',
      record: (first.body as { record: unknown }).record,
    })
    assert.equal(denied.status, 401)

    const badSample = await handlePilotApi(db, storage, 'PUT', {
      accessCode: 'inview',
      record: {
        ...(first.body as { record: object }).record,
        works: [
          {
            id: 'samplework1',
            title: 'Untitled',
            sample: true,
            price: 1000,
            status: 'available',
            artist: '',
            medium: '',
            size: '',
            year: '',
            image: '',
          },
        ],
      },
    })
    assert.equal(badSample.status, 400)

    const published = await handlePilotApi(db, storage, 'PUT', {
      accessCode: 'inview',
      record: {
        ...(first.body as { record: object }).record,
        works: [
          {
            id: 'samplework1',
            title: 'Sample work',
            artist: '',
            sample: true,
            price: 125000,
            status: 'available',
            medium: '',
            size: '',
            year: '',
            image: '',
          },
        ],
      },
    })
    assert.equal(published.status, 200)
    const publishedBody = published.body as {
      record: { works: Array<{ price: number; sample: boolean; title: string }> }
    }
    assert.equal(publishedBody.record.works[0].price, 125000)
    assert.equal(publishedBody.record.works[0].sample, true)
    assert.equal(publishedBody.record.works[0].title, 'Sample work')

    const browserA = 'browser-a1'
    const scan1 = await handlePilotApi(db, storage, 'POST', {
      op: 'visit',
      kind: 'scan',
      visitorId: browserA,
    })
    const scan2 = await handlePilotApi(db, storage, 'POST', {
      op: 'visit',
      kind: 'scan',
      visitorId: browserA,
    })
    assert.equal((scan1.body as { counted: boolean }).counted, true)
    assert.equal((scan2.body as { duplicate: boolean }).duplicate, true)
    assert.equal((scan2.body as { visits: { scans: number } }).visits.scans, 1)

    const browserB = 'browser-b2'
    const scanB = await handlePilotApi(db, storage, 'POST', {
      op: 'visit',
      kind: 'scan',
      visitorId: browserB,
    })
    const viewB = await handlePilotApi(db, storage, 'POST', {
      op: 'visit',
      kind: 'view',
      visitorId: browserB,
      workId: 'samplework1',
    })
    assert.equal((scanB.body as { visits: { scans: number } }).visits.scans, 2)
    assert.equal((viewB.body as { visits: { views: number } }).visits.views, 1)

    const lead = await handlePilotApi(db, storage, 'POST', {
      op: 'lead',
      kind: 'save',
      visitorId: browserB,
      phone: '09120000000',
      workId: 'samplework1',
    })
    assert.equal(lead.status, 200)
    const leads = (lead.body as { leads: Array<{ phone: string; verified: boolean }> }).leads
    assert.equal(leads[0].phone, '09120000000')
    assert.equal(leads[0].verified, false)
  } finally {
    await client.close()
    fs.rmSync(mediaRoot, { recursive: true, force: true })
  }
})
