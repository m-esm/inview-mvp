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
import { handlePilotApi, handleStaffApi } from './pilot-api.ts'
import { LocalObjectStorage } from './storage.ts'
import os from 'node:os'
import fs from 'node:fs'

function assertNoVisitorData(body: unknown, phone: string) {
  const text = JSON.stringify(body)
  assert.equal(text.includes(phone), false)
  assert.equal(text.includes('"leads"'), false)
  assert.equal(text.includes('"phone"'), false)
  assert.equal(text.includes('"visits"'), false)
}

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
    const phone = '09120000000'
    const first = await handlePilotApi(db, storage, 'GET', null)
    assert.equal(first.status, 200)
    assert.equal((first.body as { record: { slug: string } }).record.slug, 'o-gallery')
    assert.equal((first.body as { record: { works: unknown[] } }).record.works.length, 0)
    assertNoVisitorData(first.body, phone)

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
    assertNoVisitorData(published.body, phone)

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
    assert.equal((scan1.body as { ok: boolean; counted: boolean }).ok, true)
    assert.equal((scan1.body as { counted: boolean }).counted, true)
    assert.equal((scan2.body as { duplicate: boolean }).duplicate, true)
    assertNoVisitorData(scan1.body, phone)
    assertNoVisitorData(scan2.body, phone)

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
    assert.equal((viewB.body as { ok: boolean }).ok, true)
    assertNoVisitorData(scanB.body, phone)
    assertNoVisitorData(viewB.body, phone)

    const lead = await handlePilotApi(db, storage, 'POST', {
      op: 'lead',
      kind: 'save',
      visitorId: browserB,
      phone,
      workId: 'samplework1',
    })
    assert.equal(lead.status, 200)
    assert.equal((lead.body as { ok: boolean }).ok, true)
    assertNoVisitorData(lead.body, phone)

    const publicAfterLead = await handlePilotApi(db, storage, 'GET', null)
    assert.equal(publicAfterLead.status, 200)
    assert.equal('leads' in (publicAfterLead.body as object), false)
    assertNoVisitorData(publicAfterLead.body, phone)

    const missingCode = await handleStaffApi(db, '')
    assert.equal(missingCode.status, 401)
    assert.equal(JSON.stringify(missingCode.body).includes(phone), false)
    const wrongCode = await handleStaffApi(db, 'not-the-code')
    assert.equal(wrongCode.status, 401)
    assert.equal(JSON.stringify(wrongCode.body).includes(phone), false)

    const staff = await handleStaffApi(db, 'inview')
    assert.equal(staff.status, 200)
    const staffBody = staff.body as {
      visits: { scans: number; views: number }
      leads: Array<{ phone: string; verified: boolean }>
    }
    assert.equal(staffBody.visits.scans, 2)
    assert.equal(staffBody.visits.views, 1)
    assert.equal(staffBody.leads[0].phone, phone)
    assert.equal(staffBody.leads[0].verified, false)
  } finally {
    await client.close()
    fs.rmSync(mediaRoot, { recursive: true, force: true })
  }
})
