import {
  loadPublicRecord,
  publishGalleryRecord,
  readStaffReport,
  recordLead,
  recordVisit,
  tenantBySlug,
  GALLERY_NOT_FOUND,
} from './gallery-record'
import type { ObjectStorage } from './storage'

import { O_SLUG } from '../app/lib/galleries'

const UNKNOWN_GALLERY = GALLERY_NOT_FOUND

export function gallerySlugOf(body: unknown): string {
  const raw = body && typeof body === 'object' ? (body as { gallery?: unknown }).gallery : undefined
  if (raw === undefined || raw === null || raw === '') return O_SLUG
  return typeof raw === 'string' ? raw : ''
}

export async function handlePilotApi(
  db: Parameters<typeof loadPublicRecord>[0],
  storage: ObjectStorage,
  method: string,
  body: unknown,
) {
  const verb = (method || 'GET').toUpperCase()
  const tenant = await tenantBySlug(db, gallerySlugOf(body))
  if (!tenant) return UNKNOWN_GALLERY
  if (verb === 'PUT') {
    const payload = (body || {}) as { password?: string; accessCode?: string; record?: unknown }
    const code = payload.accessCode || payload.password || ''
    return publishGalleryRecord(db, storage, tenant, code, payload.record)
  }
  if (verb !== 'GET' && verb !== 'HEAD' && verb !== 'POST') {
    return { status: 405, body: { error: 'Method not allowed.' } }
  }
  if (tenant.gallery.status !== 'live') return UNKNOWN_GALLERY
  if (verb === 'GET' || verb === 'HEAD') {
    try {
      return { status: 200, body: await loadPublicRecord(db, tenant) }
    } catch (error) {
      if (error instanceof Response && error.status === 404) return UNKNOWN_GALLERY
      throw error
    }
  }
  const payload = (body || {}) as {
    op?: string
    kind?: string
    visitorId?: string
    phone?: string
    workId?: string | null
    qrCode?: string | null
    consent?: unknown
    consentTextVersion?: unknown
  }
  if (payload.op === 'visit') {
    if (payload.kind !== 'scan' && payload.kind !== 'view') {
      return { status: 400, body: { error: 'Unknown visit kind.' } }
    }
    return recordVisit(db, tenant, payload.kind, String(payload.visitorId || ''), payload.workId, payload.qrCode)
  }
  if (payload.op === 'lead') {
    if (payload.kind !== 'save' && payload.kind !== 'ask') {
      return { status: 400, body: { error: 'Unknown lead kind.' } }
    }
    return recordLead(
      db,
      tenant,
      String(payload.phone || ''),
      payload.kind,
      String(payload.visitorId || ''),
      payload.workId,
      payload.consent,
      payload.consentTextVersion,
    )
  }
  return { status: 400, body: { error: 'Unknown action.' } }
}

export async function handleStaffApi(
  db: Parameters<typeof loadPublicRecord>[0],
  accessCode: string,
  gallerySlug: string,
) {
  const tenant = await tenantBySlug(db, gallerySlug)
  if (!tenant) return UNKNOWN_GALLERY
  return readStaffReport(db, tenant, accessCode)
}
