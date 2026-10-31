import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const seedPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/data/o-gallery-seed.json')
const PASSWORD = 'inview'
const QR = 'https://inview-mvp.vercel.app/g/o-gallery'
const SAMPLE_RE = /sample|نمونه/i

let queue = Promise.resolve()

function enqueue(fn) {
  const run = queue.then(fn, fn)
  queue = run.then(() => {}, () => {})
  return run
}

function dataFile() {
  if (process.env.PILOT_DATA_FILE) return process.env.PILOT_DATA_FILE
  if (process.env.VERCEL) return '/tmp/inview-o-gallery.json'
  return path.join(process.cwd(), '.data', 'o-gallery.json')
}

function readSeed() {
  return JSON.parse(fs.readFileSync(seedPath, 'utf8'))
}

function fresh() {
  return { record: readSeed(), scans: {}, views: 0, leads: [] }
}

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile(), 'utf8'))
    if (!parsed || typeof parsed !== 'object' || !parsed.record) return fresh()
    parsed.scans ||= {}
    parsed.views ||= 0
    parsed.leads ||= []
    return parsed
  } catch {
    return fresh()
  }
}

function save(state) {
  const file = dataFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(state))
}

function text(value, max) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function imageValue(value, label) {
  if (!value) return { value: null }
  if (typeof value !== 'string') return { error: `${label} must be an uploaded image.` }
  if (value.startsWith('/artworks/')) return { error: 'Use an image you upload. Do not use another gallery’s images.' }
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i.test(value)) {
    return { error: `${label} must be a PNG, JPEG, or WebP upload.` }
  }
  if (value.length > 500_000) return { error: 'Use an image smaller than 350 KB.' }
  return { value }
}

function sanitize(input) {
  if (!input || typeof input !== 'object') return { error: 'The record is missing.' }
  const name = text(input.name, 80)
  if (!name) return { error: 'Enter the gallery name.' }
  if (!Array.isArray(input.works)) return { error: 'Works must be a list.' }
  if (input.works.length > 40) return { error: 'You can publish up to 40 works.' }
  const works = []
  for (const work of input.works) {
    if (!work || typeof work !== 'object') return { error: 'One work is not valid.' }
    const title = text(work.title, 120)
    if (!title) return { error: 'Enter a title for each work.' }
    const sample = Boolean(work.sample)
    if (sample && !SAMPLE_RE.test(title)) {
      return { error: 'A sample title must include the word sample or نمونه.' }
    }
    let price = null
    if (work.price !== null && work.price !== undefined && work.price !== '') {
      const n = typeof work.price === 'number' ? work.price : Number(String(work.price).replace(/,/g, ''))
      if (!Number.isFinite(n) || n < 0) return { error: 'Enter a price that is zero or greater, or leave the price empty.' }
      price = Math.round(n)
    }
    if (!['available', 'reserved', 'sold'].includes(work.status)) return { error: 'Choose a status for each work.' }
    const image = imageValue(work.image, 'A work image')
    if (image.error) return { error: image.error }
    let id = text(work.id, 80)
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(id)) id = crypto.randomUUID()
    works.push({
      id,
      sample,
      artist: text(work.artist, 80),
      title,
      medium: text(work.medium, 80),
      size: text(work.size, 80),
      year: text(work.year, 20),
      price,
      status: work.status,
      image: image.value || '',
    })
  }
  const logo = imageValue(input.logo, 'The logo')
  if (logo.error) return { error: logo.error }
  let pdfUrl = null
  if (input.pdfUrl) {
    pdfUrl = text(input.pdfUrl, 500)
    if (!/^https?:\/\/\S+$/i.test(pdfUrl)) return { error: 'The PDF address must start with http:// or https://.' }
  }
  const nameFa = text(input.nameFa, 80) || name
  return {
    record: {
      slug: 'o-gallery',
      name,
      nameFa,
      logo: logo.value,
      showTitle: text(input.showTitle, 160),
      showTitleFa: text(input.showTitleFa, 160),
      dates: text(input.dates, 80),
      datesFa: text(input.datesFa, 80),
      hours: text(input.hours, 120),
      hoursFa: text(input.hoursFa, 120),
      address: text(input.address, 180),
      addressFa: text(input.addressFa, 180),
      text: text(input.text, 2000),
      textFa: text(input.textFa, 2000),
      pdfUrl,
      works,
      updatedAt: new Date().toISOString(),
    },
  }
}

function present(state) {
  return {
    record: state.record,
    visits: { scans: Object.keys(state.scans).length, views: state.views },
    leads: state.leads.map((lead) => ({
      phone: lead.phone,
      kind: lead.kind,
      at: lead.at,
      workId: lead.workId || null,
      verified: false,
    })),
    qr: QR,
  }
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function handle(method, body) {
  const verb = (method || 'GET').toUpperCase()
  if (verb === 'GET' || verb === 'HEAD') return { status: 200, body: present(load()) }
  if (verb === 'PUT') {
    if (!body || body.password !== PASSWORD) return { status: 401, body: { error: 'That password does not match.' } }
    const cleaned = sanitize(body.record)
    if (cleaned.error) return { status: 400, body: { error: cleaned.error } }
    const state = load()
    state.record = cleaned.record
    save(state)
    return { status: 200, body: present(state) }
  }
  if (verb !== 'POST') return { status: 405, body: { error: 'Method not allowed.' } }
  if (!body || (body.op !== 'visit' && body.op !== 'lead')) return { status: 400, body: { error: 'Unknown action.' } }
  const visitorId = typeof body.visitorId === 'string' ? body.visitorId : ''
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(visitorId)) return { status: 400, body: { error: 'Visitor id is not valid.' } }
  const state = load()
  if (body.op === 'visit') {
    if (body.kind === 'scan') {
      const key = `${visitorId}|${today()}`
      const duplicate = Boolean(state.scans[key])
      if (!duplicate) state.scans[key] = true
      save(state)
      return { status: 200, body: { ...present(state), counted: !duplicate, duplicate } }
    }
    if (body.kind === 'view') {
      state.views += 1
      save(state)
      return { status: 200, body: { ...present(state), counted: true, duplicate: false } }
    }
    return { status: 400, body: { error: 'Unknown visit kind.' } }
  }
  if (body.kind !== 'save' && body.kind !== 'ask') return { status: 400, body: { error: 'Unknown lead kind.' } }
  const phone = typeof body.phone === 'string' ? body.phone : ''
  if (!/^09\d{9}$/.test(phone)) return { status: 400, body: { error: 'Enter a mobile number that starts with 09 and has 11 digits.' } }
  state.leads.push({
    phone,
    kind: body.kind,
    at: new Date().toISOString(),
    workId: typeof body.workId === 'string' ? body.workId.slice(0, 80) : null,
    verified: false,
  })
  if (state.leads.length > 200) state.leads.splice(0, state.leads.length - 200)
  save(state)
  return { status: 200, body: present(state) }
}

export function handlePilot(method, body) {
  return enqueue(() => handle(method, body))
}

export const pilotQr = QR
