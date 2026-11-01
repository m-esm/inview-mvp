import test from 'node:test'
import assert from 'node:assert/strict'

// Keep this file on the development default even when the runner sets NODE_ENV=production.
process.env.NODE_ENV = 'test'
delete process.env.O_GALLERY_ACCESS_CODE
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import * as schema from '../database/schema.ts'
import { CONSENT_TEXT_VERSION, leadBody } from '../app/lib/consent.ts'
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

    const lead = await handlePilotApi(db, storage, 'POST', leadBody({
      phone: '09120000000',
      kind: 'save',
      visitorId: browserB,
      workId: 'samplework1',
    }))
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
      leads: Array<{ phone: string; workId: string; consentTextVersion: string; verified: boolean }>
    }
    assert.equal(staffBody.visits.scans, 2)
    assert.equal(staffBody.visits.views, 1)
    assert.equal(staffBody.leads[0].phone, phone)
    assert.equal(staffBody.leads[0].workId, 'samplework1')
    assert.equal(staffBody.leads[0].consentTextVersion, CONSENT_TEXT_VERSION)
    assert.equal(staffBody.leads[0].verified, false)
  } finally {
    await client.close()
    fs.rmSync(mediaRoot, { recursive: true, force: true })
  }
})

test('the server returns 400 for a lead without consent', async () => {
  const { client, db, storage, mediaRoot } = await setup()
  try {
    const base = {
      op: 'lead',
      kind: 'save',
      visitorId: 'browser-b2',
      phone: '09120000000',
      workId: 'samplework1',
    }
    const missing = await handlePilotApi(db, storage, 'POST', base)
    const refused = await handlePilotApi(db, storage, 'POST', { ...base, consent: false, consentTextVersion: CONSENT_TEXT_VERSION })
    const textConsent = await handlePilotApi(db, storage, 'POST', { ...base, consent: 'true', consentTextVersion: CONSENT_TEXT_VERSION })
    const badVersion = await handlePilotApi(db, storage, 'POST', { ...base, consent: true, consentTextVersion: 'other' })
    const missingVersion = await handlePilotApi(db, storage, 'POST', { ...base, consent: true })
    assert.equal(missing.status, 400)
    assert.equal(refused.status, 400)
    assert.equal(textConsent.status, 400)
    assert.equal(badVersion.status, 400)
    assert.equal(missingVersion.status, 400)
    assert.equal((missing.body as { error: string }).error, 'Consent is required.')
    const rows = await db.select().from(schema.leads)
    assert.equal(rows.length, 0)
  } finally {
    await client.close()
    fs.rmSync(mediaRoot, { recursive: true, force: true })
  }
})

test('a lead from the first sign-in stores the work id', async () => {
  const { client, db, storage, mediaRoot } = await setup()
  try {
    const first = await handlePilotApi(db, storage, 'GET', null)
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
            price: null,
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

    const body = leadBody({
      phone: '09121111111',
      kind: 'save',
      visitorId: 'browser-b2',
      workId: 'samplework1',
    })
    assert.equal(body.workId, 'samplework1')
    assert.equal(body.consent, true)

    const lead = await handlePilotApi(db, storage, 'POST', body)
    assert.equal(lead.status, 200)
    const rows = await db.select().from(schema.leads).where(eq(schema.leads.phone, '09121111111'))
    assert.equal(rows.length, 1)
    assert.equal(rows[0].workId, 'samplework1')
    assert.equal(rows[0].kind, 'save')
    assert.equal(rows[0].consentTextVersion, CONSENT_TEXT_VERSION)
    assert.ok(rows[0].consentAt)

    const withoutWork = await handlePilotApi(db, storage, 'POST', { ...body, workId: null })
    assert.equal(withoutWork.status, 400)
    const after = await db.select().from(schema.leads)
    assert.equal(after.length, 1)
  } finally {
    await client.close()
    fs.rmSync(mediaRoot, { recursive: true, force: true })
  }
})
