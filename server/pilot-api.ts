import {
  loadPublicRecord,
  publishGalleryRecord,
  readStaffReport,
  recordLead,
  recordVisit,
} from './gallery-record'
import type { ObjectStorage } from './storage'

export async function handlePilotApi(
  db: Parameters<typeof loadPublicRecord>[0],
  storage: ObjectStorage,
  method: string,
  body: unknown,
) {
  const verb = (method || 'GET').toUpperCase()
  if (verb === 'GET' || verb === 'HEAD') {
    return { status: 200, body: await loadPublicRecord(db) }
  }
  if (verb === 'PUT') {
    const payload = (body || {}) as { password?: string; accessCode?: string; record?: unknown }
    const code = payload.accessCode || payload.password || ''
    return publishGalleryRecord(db, storage, code, payload.record)
  }
  if (verb !== 'POST') return { status: 405, body: { error: 'Method not allowed.' } }
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
    return recordVisit(db, payload.kind, String(payload.visitorId || ''), payload.workId, payload.qrCode)
  }
  if (payload.op === 'lead') {
    if (payload.kind !== 'save' && payload.kind !== 'ask') {
      return { status: 400, body: { error: 'Unknown lead kind.' } }
    }
    return recordLead(
      db,
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
) {
  return readStaffReport(db, accessCode)
}
