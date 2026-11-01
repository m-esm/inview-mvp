import { MAX_UPLOAD_MB } from './i18n-staff'

export interface StaffLead {
  phone: string
  kind: 'save' | 'ask'
  at: string
  workId: string | null
  workTitle: string | null
  consentTextVersion: string
  verified: false
}

export interface StaffDay {
  day: string
  scans: number
  views: number
}

export interface StaffWorkStat {
  workId: string
  title: string
  views: number
  saves: number
  asks: number
}

export interface StaffReport {
  visits: { scans: number; views: number }
  days: StaffDay[]
  works: StaffWorkStat[]
  leads: StaffLead[]
}

export const LEADS_CSV_PATH = '/api/v1/pilot/staff/leads.csv'
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
const ACCEPTED = /^image\/(png|jpeg|webp)$/

export async function fetchStaffReport(): Promise<StaffReport> {
  const res = await fetch('/api/v1/pilot/staff', { cache: 'no-store' })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

export type UploadProblem = 'type' | 'size' | 'failed'

export class UploadProblemError extends Error {
  constructor(readonly problem: UploadProblem, readonly serverText?: { error?: string; errorFa?: string }) {
    super(problem)
  }
}

export function checkImageFile(file: File): UploadProblem | null {
  if (!ACCEPTED.test(file.type)) return 'type'
  if (file.size > MAX_UPLOAD_BYTES) return 'size'
  return null
}

export function uploadImage(file: File, onProgress: (ratio: number) => void): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const problem = checkImageFile(file)
    if (problem) {
      reject(new UploadProblemError(problem))
      return
    }
    const body = new FormData()
    body.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/v1/uploads')
    xhr.responseType = 'json'
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      const data = (xhr.response || {}) as { url?: string; error?: string; errorFa?: string }
      if (xhr.status === 201 && data.url) {
        resolve({ url: data.url })
        return
      }
      const kind: UploadProblem = xhr.status === 413 ? 'size' : xhr.status === 400 ? 'type' : 'failed'
      reject(new UploadProblemError(kind, data))
    }
    xhr.onerror = () => reject(new UploadProblemError('failed'))
    xhr.send(body)
  })
}
