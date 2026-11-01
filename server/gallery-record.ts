import { and, asc, count, desc, eq } from 'drizzle-orm'
/** Drizzle database handle (Postgres.js in production, PGlite in tests). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
import {
  galleries,
  leads,
  media,
  qrCodes,
  showWorks,
  shows,
  visits,
  works,
} from '../database/schema'
import { CONSENT_TEXT_VERSION } from '../app/lib/consent'
import { hashSecret, verifySecret } from './crypto'
import { decodeDataUrl, processAndStoreImage } from './images'
import type { ObjectStorage } from './storage'

const SAMPLE_RE = /sample|نمونه/i
const O_SLUG = 'o-gallery'

export interface GalleryWorkDto {
  id: string
  artist: string
  title: string
  medium: string
  size: string
  year: string
  price: number | null
  status: 'available' | 'reserved' | 'sold'
  image: string
  sample: boolean
}

export interface GalleryRecordDto {
  slug: 'o-gallery'
  name: string
  nameFa: string
  logo: string | null
  showTitle: string
  showTitleFa: string
  dates: string
  datesFa: string
  hours: string
  hoursFa: string
  address: string
  addressFa: string
  text: string
  textFa: string
  pdfUrl: string | null
  works: GalleryWorkDto[]
  updatedAt?: string
}

export interface GalleryStateDto {
  record: GalleryRecordDto
  visits: { scans: number; views: number }
  leads: Array<{
    phone: string
    kind: 'save' | 'ask'
    at: string
    workId: string | null
    consentTextVersion: string
    verified: false
  }>
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

const DEV_ACCESS_CODE = 'inview'

export function resolveOGalleryAccessCode(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.O_GALLERY_ACCESS_CODE
  if (typeof configured === 'string' && configured.trim() !== '') return configured
  if (env.NODE_ENV === 'production') {
    throw new Error('O_GALLERY_ACCESS_CODE is required in production.')
  }
  return DEV_ACCESS_CODE
}

function errorWithoutSecrets(error: unknown, secrets: string[]): Error {
  let message = error instanceof Error ? error.message : 'Database request failed.'
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join('[redacted]')
  }
  return new Error(`Could not store the O Gallery access code hash. ${message}`)
}

export async function ensureOGalleryTenant(
  db: Db,
  accessCodePlain?: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const code =
    typeof accessCodePlain === 'string' && accessCodePlain.trim() !== ''
      ? accessCodePlain
      : resolveOGalleryAccessCode(env)
  const [existing] = await db.select().from(galleries).where(eq(galleries.slug, O_SLUG)).limit(1)
  if (existing) {
    let [show] = await db
      .select()
      .from(shows)
      .where(eq(shows.galleryId, existing.id))
      .orderBy(desc(shows.updatedAt))
      .limit(1)
    if (!show) {
      const [created] = await db
        .insert(shows)
        .values({ galleryId: existing.id, titleEn: '', titleFa: '', status: 'published' })
        .returning()
      show = created
      await db.insert(qrCodes).values({ showId: show.id, code: 'o-gallery-main', label: 'Entrance' })
    }
    return { gallery: existing, show }
  }

  const accessCodeHash = hashSecret(code)
  let gallery: typeof galleries.$inferSelect
  try {
    const [created] = await db
      .insert(galleries)
      .values({
        slug: O_SLUG,
        nameEn: 'O Gallery',
        nameFa: 'گالری اُ',
        subdomain: 'ogallery',
        accessCodeHash,
      })
      .returning()
    gallery = created
  } catch (error) {
    throw errorWithoutSecrets(error, [code, accessCodeHash])
  }
  const [show] = await db
    .insert(shows)
    .values({ galleryId: gallery.id, titleEn: '', titleFa: '', status: 'published' })
    .returning()
  await db.insert(qrCodes).values({ showId: show.id, code: 'o-gallery-main', label: 'Entrance' })
  return { gallery, show }
}

// A row can already exist with a null or old hash. Replace that hash from the env code.
export async function syncOGalleryAccessCode(db: Db, env: NodeJS.ProcessEnv = process.env) {
  const code = resolveOGalleryAccessCode(env)
  const { gallery, show } = await ensureOGalleryTenant(db, code, env)
  if (verifySecret(code, gallery.accessCodeHash)) return { gallery, show }
  const accessCodeHash = hashSecret(code)
  try {
    const [updated] = await db
      .update(galleries)
      .set({ accessCodeHash, updatedAt: new Date() })
      .where(eq(galleries.id, gallery.id))
      .returning()
    return { gallery: updated ?? gallery, show }
  } catch (error) {
    throw errorWithoutSecrets(error, [code, accessCodeHash])
  }
}

async function logoUrl(db: Db, logoMediaId: string | null): Promise<string | null> {
  if (!logoMediaId) return null
  const [row] = await db.select().from(media).where(eq(media.id, logoMediaId)).limit(1)
  if (!row) return null
  const variants = row.variants || {}
  return variants['w640.webp'] || variants['w640.jpeg'] || Object.values(variants)[0] || null
}

async function readRecord(
  db: Db,
  gallery: { nameEn: string; nameFa: string; logoMediaId: string | null },
  show: {
    titleEn: string
    titleFa: string
    datesEn: string
    datesFa: string
    hoursEn: string
    hoursFa: string
    addressEn: string
    addressFa: string
    textEn: string
    textFa: string
    pdfUrl: string | null
    updatedAt: Date
    id: string
  },
): Promise<GalleryRecordDto> {
  const linked = await db
    .select({
      work: works,
      sortOrder: showWorks.sortOrder,
    })
    .from(showWorks)
    .innerJoin(works, eq(showWorks.workId, works.id))
    .where(eq(showWorks.showId, show.id))
    .orderBy(asc(showWorks.sortOrder))

  const workDtos: GalleryWorkDto[] = linked.map((row: { work: typeof works.$inferSelect }) => ({
    id: row.work.id,
    artist: row.work.artist,
    title: row.work.title,
    medium: row.work.medium,
    size: row.work.size,
    year: row.work.year,
    price: row.work.priceToman,
    status: row.work.status,
    image: row.work.imageUrl || '',
    sample: row.work.sample,
  }))

  return {
    slug: 'o-gallery',
    name: gallery.nameEn,
    nameFa: gallery.nameFa,
    logo: await logoUrl(db, gallery.logoMediaId),
    showTitle: show.titleEn,
    showTitleFa: show.titleFa,
    dates: show.datesEn,
    datesFa: show.datesFa,
    hours: show.hoursEn,
    hoursFa: show.hoursFa,
    address: show.addressEn,
    addressFa: show.addressFa,
    text: show.textEn,
    textFa: show.textFa,
    pdfUrl: show.pdfUrl,
    works: workDtos,
    updatedAt: show.updatedAt.toISOString(),
  }
}

async function readVisitCounts(db: Db, showId: string): Promise<GalleryStateDto['visits']> {
  const [scanRow] = await db
    .select({ value: count() })
    .from(visits)
    .where(and(eq(visits.showId, showId), eq(visits.kind, 'scan')))
  const [viewRow] = await db
    .select({ value: count() })
    .from(visits)
    .where(and(eq(visits.showId, showId), eq(visits.kind, 'view')))
  return { scans: Number(scanRow?.value || 0), views: Number(viewRow?.value || 0) }
}

async function readLeadList(db: Db, galleryId: string): Promise<GalleryStateDto['leads']> {
  const leadRows = await db
    .select()
    .from(leads)
    .where(eq(leads.galleryId, galleryId))
    .orderBy(desc(leads.createdAt))
    .limit(200)
  return leadRows.map((lead: typeof leads.$inferSelect) => ({
    phone: lead.phone,
    kind: lead.kind,
    at: lead.consentAt.toISOString(),
    workId: lead.workId,
    consentTextVersion: lead.consentTextVersion,
    verified: false as const,
  }))
}

/** Public catalogue only. This function does not read visits or leads. */
export async function loadPublicRecord(db: Db): Promise<{ record: GalleryRecordDto }> {
  const { gallery, show } = await ensureOGalleryTenant(db)
  return { record: await readRecord(db, gallery, show) }
}

type StaffReportResult =
  | { status: 200; body: { visits: GalleryStateDto['visits']; leads: GalleryStateDto['leads'] } }
  | { status: 401; body: { error: string } }

async function staffReportForTenant(
  db: Db,
  galleryId: string,
  showId: string,
): Promise<StaffReportResult> {
  return {
    status: 200,
    body: {
      visits: await readVisitCounts(db, showId),
      leads: await readLeadList(db, galleryId),
    },
  }
}

export async function readStaffReport(db: Db, accessCode: string): Promise<StaffReportResult> {
  const { gallery, show } = await ensureOGalleryTenant(db)
  if (!verifySecret(accessCode, gallery.accessCodeHash)) {
    return { status: 401, body: { error: 'That access code does not match.' } }
  }
  return staffReportForTenant(db, gallery.id, show.id)
}

export async function readStaffReportForSession(db: Db, galleryId: string): Promise<StaffReportResult> {
  const { gallery, show } = await ensureOGalleryTenant(db)
  if (gallery.id !== galleryId) {
    return { status: 401, body: { error: 'Sign in to see visits and phone numbers.' } }
  }
  return staffReportForTenant(db, gallery.id, show.id)
}

function sanitizeRecord(input: unknown): { error: string } | { record: Omit<GalleryRecordDto, 'slug' | 'updatedAt'> } {
  if (!input || typeof input !== 'object') return { error: 'The record is missing.' }
  const body = input as Record<string, unknown>
  const name = text(body.name, 80)
  if (!name) return { error: 'Enter the gallery name.' }
  if (!Array.isArray(body.works)) return { error: 'Works must be a list.' }
  if (body.works.length > 40) return { error: 'You can publish up to 40 works.' }

  const worksOut: GalleryWorkDto[] = []
  for (const raw of body.works) {
    if (!raw || typeof raw !== 'object') return { error: 'One work is not valid.' }
    const work = raw as Record<string, unknown>
    const title = text(work.title, 120)
    if (!title) return { error: 'Enter a title for each work.' }
    const sample = Boolean(work.sample)
    if (sample && !SAMPLE_RE.test(title)) {
      return { error: 'A sample title must include the word sample or نمونه.' }
    }
    let price: number | null = null
    if (work.price !== null && work.price !== undefined && work.price !== '') {
      const n = typeof work.price === 'number' ? work.price : Number(String(work.price).replace(/,/g, ''))
      if (!Number.isFinite(n) || n < 0) {
        return { error: 'Enter a price that is zero or greater, or leave the price empty.' }
      }
      price = Math.round(n)
    }
    if (!['available', 'reserved', 'sold'].includes(String(work.status))) {
      return { error: 'Choose a status for each work.' }
    }
    let id = text(work.id, 80)
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(id)) id = crypto.randomUUID()
    const image = typeof work.image === 'string' ? work.image : ''
    if (image.startsWith('/artworks/')) {
      return { error: 'Use an image you upload. Do not use another gallery’s images.' }
    }
    worksOut.push({
      id,
      sample,
      artist: text(work.artist, 80),
      title,
      medium: text(work.medium, 80),
      size: text(work.size, 80),
      year: text(work.year, 20),
      price,
      status: work.status as GalleryWorkDto['status'],
      image,
    })
  }

  let pdfUrl: string | null = null
  if (body.pdfUrl) {
    pdfUrl = text(body.pdfUrl, 500)
    if (!/^https?:\/\/\S+$/i.test(pdfUrl)) {
      return { error: 'The PDF address must start with http:// or https://.' }
    }
  }

  const nameFa = text(body.nameFa, 80) || name
  return {
    record: {
      name,
      nameFa,
      logo: typeof body.logo === 'string' ? body.logo : null,
      showTitle: text(body.showTitle, 160),
      showTitleFa: text(body.showTitleFa, 160),
      dates: text(body.dates, 80),
      datesFa: text(body.datesFa, 80),
      hours: text(body.hours, 120),
      hoursFa: text(body.hoursFa, 120),
      address: text(body.address, 180),
      addressFa: text(body.addressFa, 180),
      text: text(body.text, 2000),
      textFa: text(body.textFa, 2000),
      pdfUrl,
      works: worksOut,
    },
  }
}

async function resolveImageUrl(
  db: Db,
  storage: ObjectStorage,
  galleryId: string,
  gallerySlug: string,
  image: string,
): Promise<{ url: string; mediaId: string | null }> {
  if (!image) return { url: '', mediaId: null }
  if (image.startsWith('http://') || image.startsWith('https://') || image.startsWith('/media/')) {
    return { url: image, mediaId: null }
  }
  const decoded = decodeDataUrl(image)
  if (!decoded) throw new Error('A work image must be a PNG, JPEG, or WebP upload.')
  const processed = await processAndStoreImage(storage, gallerySlug, decoded.buffer, decoded.contentType)
  const [row] = await db
    .insert(media)
    .values({
      galleryId,
      s3Key: processed.key,
      width: processed.width,
      height: processed.height,
      variants: processed.variants,
    })
    .returning()
  return { url: processed.variants['w640.webp'] || processed.primaryUrl, mediaId: row.id }
}

type PublishResult = { status: number; body: { ok: true; record: GalleryRecordDto } | { error: string } }

export async function publishGalleryRecord(
  db: Db,
  storage: ObjectStorage,
  accessCode: string,
  input: unknown,
): Promise<PublishResult> {
  const tenant = await ensureOGalleryTenant(db)
  if (!verifySecret(accessCode, tenant.gallery.accessCodeHash)) {
    return { status: 401, body: { error: 'That access code does not match.' } }
  }
  return writeGalleryRecord(db, storage, tenant, input)
}

export async function publishGalleryRecordForSession(
  db: Db,
  storage: ObjectStorage,
  galleryId: string,
  input: unknown,
): Promise<PublishResult> {
  const tenant = await ensureOGalleryTenant(db)
  if (tenant.gallery.id !== galleryId) {
    return { status: 401, body: { error: 'Sign in to publish.' } }
  }
  return writeGalleryRecord(db, storage, tenant, input)
}

async function writeGalleryRecord(
  db: Db,
  storage: ObjectStorage,
  tenant: Awaited<ReturnType<typeof ensureOGalleryTenant>>,
  input: unknown,
): Promise<PublishResult> {
  const { gallery, show } = tenant
  const cleaned = sanitizeRecord(input)
  if ('error' in cleaned) return { status: 400, body: { error: cleaned.error } }

  try {
    let logoMediaId: string | null = gallery.logoMediaId
    if (cleaned.record.logo === null) {
      logoMediaId = null
    } else if (cleaned.record.logo) {
      const logo = await resolveImageUrl(db, storage, gallery.id, gallery.slug, cleaned.record.logo)
      logoMediaId = logo.mediaId
      if (!logoMediaId && cleaned.record.logo.startsWith('data:')) {
        return { status: 400, body: { error: 'The logo must be a PNG, JPEG, or WebP upload.' } }
      }
    }

    await db
      .update(galleries)
      .set({
        nameEn: cleaned.record.name,
        nameFa: cleaned.record.nameFa,
        logoMediaId,
        updatedAt: new Date(),
      })
      .where(eq(galleries.id, gallery.id))

    await db
      .update(shows)
      .set({
        titleEn: cleaned.record.showTitle,
        titleFa: cleaned.record.showTitleFa,
        datesEn: cleaned.record.dates,
        datesFa: cleaned.record.datesFa,
        hoursEn: cleaned.record.hours,
        hoursFa: cleaned.record.hoursFa,
        addressEn: cleaned.record.address,
        addressFa: cleaned.record.addressFa,
        textEn: cleaned.record.text,
        textFa: cleaned.record.textFa,
        pdfUrl: cleaned.record.pdfUrl,
        updatedAt: new Date(),
      })
      .where(eq(shows.id, show.id))

    await db.delete(showWorks).where(eq(showWorks.showId, show.id))
    // Replace works for this gallery show (pilot: one show).
    const existingWorks = await db.select({ id: works.id }).from(works).where(eq(works.galleryId, gallery.id))
    const keep = new Set(cleaned.record.works.map((w) => w.id))
    for (const row of existingWorks) {
      if (!keep.has(row.id)) await db.delete(works).where(eq(works.id, row.id))
    }

    let order = 0
    for (const work of cleaned.record.works) {
      const image = await resolveImageUrl(db, storage, gallery.id, gallery.slug, work.image)
      const values = {
        galleryId: gallery.id,
        artist: work.artist,
        title: work.title,
        medium: work.medium,
        size: work.size,
        year: work.year,
        priceToman: work.price,
        status: work.status,
        sample: work.sample,
        mediaId: image.mediaId,
        imageUrl: image.url,
        updatedAt: new Date(),
      }
      const [found] = await db.select({ id: works.id }).from(works).where(eq(works.id, work.id)).limit(1)
      if (found) {
        await db.update(works).set(values).where(eq(works.id, work.id))
      } else {
        await db.insert(works).values({ id: work.id, ...values })
      }
      await db.insert(showWorks).values({ showId: show.id, workId: work.id, sortOrder: order++ })
    }

    const published = await loadPublicRecord(db)
    return { status: 200, body: { ok: true, record: published.record } }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Publish did not complete.'
    return { status: 400, body: { error: message } }
  }
}

export async function recordVisit(
  db: Db,
  kind: 'scan' | 'view',
  visitorId: string,
  workId?: string | null,
): Promise<{ status: number; body: { ok: true; counted: boolean; duplicate: boolean } | { error: string } }> {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(visitorId)) {
    return { status: 400, body: { error: 'Visitor id is not valid.' } }
  }
  const { show } = await ensureOGalleryTenant(db)
  const day = new Date().toISOString().slice(0, 10)
  if (kind === 'scan') {
    try {
      await db.insert(visits).values({
        showId: show.id,
        visitorId,
        kind: 'scan',
        day,
      })
      return { status: 200, body: { ok: true, counted: true, duplicate: false } }
    } catch {
      return { status: 200, body: { ok: true, counted: false, duplicate: true } }
    }
  }

  let resolvedWorkId: string | null = null
  if (workId && /^[a-zA-Z0-9-]{8,80}$/.test(workId)) {
    const [found] = await db.select({ id: works.id }).from(works).where(eq(works.id, workId)).limit(1)
    resolvedWorkId = found?.id ?? null
  }
  await db.insert(visits).values({
    showId: show.id,
    visitorId,
    kind: 'view',
    day,
    workId: resolvedWorkId,
  })
  return { status: 200, body: { ok: true, counted: true, duplicate: false } }
}

export async function recordLead(
  db: Db,
  phone: string,
  kind: 'save' | 'ask',
  visitorId: string,
  workId: string | null | undefined,
  consent: unknown,
  consentTextVersion: unknown,
): Promise<{ status: number; body: { ok: true } | { error: string } }> {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(visitorId)) {
    return { status: 400, body: { error: 'Visitor id is not valid.' } }
  }
  if (!/^09\d{9}$/.test(phone)) {
    return { status: 400, body: { error: 'Enter a mobile number that starts with 09 and has 11 digits.' } }
  }
  if (consent !== true) {
    return { status: 400, body: { error: 'Consent is required.' } }
  }
  if (consentTextVersion !== CONSENT_TEXT_VERSION) {
    return { status: 400, body: { error: 'The consent text version is not valid.' } }
  }
  if (!workId || !/^[a-zA-Z0-9-]{8,80}$/.test(workId)) {
    return { status: 400, body: { error: 'A work id is required.' } }
  }
  const { gallery, show } = await ensureOGalleryTenant(db)
  const [found] = await db.select({ id: works.id }).from(works).where(eq(works.id, workId)).limit(1)
  if (!found) {
    return { status: 400, body: { error: 'That work was not found.' } }
  }
  const consentAt = new Date()
  await db.insert(leads).values({
    galleryId: gallery.id,
    showId: show.id,
    workId: found.id,
    phone,
    kind,
    consentAt,
    consentTextVersion: CONSENT_TEXT_VERSION,
  })
  return { status: 200, body: { ok: true } }
}