import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('published sample price is shared, and one browser counts one scan per day', async () => {
  process.env.PILOT_DATA_FILE = path.join(os.tmpdir(), `o-gallery-${process.pid}-${Date.now()}.json`)
  const { handlePilot } = await import('./pilot-store.mjs')
  try {
    const first = await handlePilot('GET', null)
    assert.equal(first.status, 200)
    assert.equal(first.body.record.slug, 'o-gallery')
    assert.equal(first.body.record.works.length, 0)
    assert.equal(first.body.visits.scans, 0)
    assert.equal(first.body.visits.views, 0)
    assert.equal(first.body.qr, 'https://inview-mvp.vercel.app/g/o-gallery')

    const denied = await handlePilot('PUT', { password: 'nope', record: first.body.record })
    assert.equal(denied.status, 401)

    const badSample = await handlePilot('PUT', {
      password: 'inview',
      record: { ...first.body.record, works: [{ id: 'samplework1', title: 'Untitled', sample: true, price: 1000, status: 'available' }] },
    })
    assert.equal(badSample.status, 400)

    const published = await handlePilot('PUT', {
      password: 'inview',
      record: {
        ...first.body.record,
        works: [{ id: 'samplework1', title: 'Sample work', artist: '', sample: true, price: 125000, status: 'available', medium: '', size: '', year: '', image: '' }],
      },
    })
    assert.equal(published.status, 200)
    assert.equal(published.body.record.works[0].price, 125000)
    assert.equal(published.body.record.works[0].sample, true)
    assert.equal(published.body.record.slug, 'o-gallery')

    const again = await handlePilot('GET', null)
    assert.equal(again.body.record.works[0].title, 'Sample work')

    const browserA = 'browser-a1'
    const scan1 = await handlePilot('POST', { op: 'visit', kind: 'scan', visitorId: browserA })
    const scan2 = await handlePilot('POST', { op: 'visit', kind: 'scan', visitorId: browserA })
    assert.equal(scan1.body.counted, true)
    assert.equal(scan2.body.duplicate, true)
    assert.equal(scan2.body.visits.scans, 1)

    const browserB = 'browser-b2'
    const scanB = await handlePilot('POST', { op: 'visit', kind: 'scan', visitorId: browserB })
    const viewB = await handlePilot('POST', { op: 'visit', kind: 'view', visitorId: browserB, workId: 'samplework1' })
    assert.equal(scanB.body.visits.scans, 2)
    assert.equal(viewB.body.visits.views, 1)

    const lead = await handlePilot('POST', { op: 'lead', kind: 'save', visitorId: browserB, phone: '09120000000', verified: true })
    assert.equal(lead.status, 200)
    assert.equal(lead.body.leads[0].phone, '09120000000')
    assert.equal(lead.body.leads[0].verified, false)
  } finally {
    fs.rmSync(process.env.PILOT_DATA_FILE, { force: true })
  }
})
