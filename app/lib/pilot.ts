import { useEffect, useState } from 'react'
import seedJson from '../data/o-gallery-seed.json'

export type PilotStatus = 'available' | 'reserved' | 'sold'

export interface PilotWork {
  id: string
  artist: string
  title: string
  medium: string
  size: string
  year: string
  price: number | null
  status: PilotStatus
  image: string
  sample: boolean
}

export interface PilotRecord {
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
  works: PilotWork[]
  updatedAt?: string
}

export interface PilotLead {
  phone: string
  kind: 'save' | 'ask'
  at: string
  workId: string | null
  verified: false
}

export interface StaffReport {
  visits: { scans: number; views: number }
  leads: PilotLead[]
}

export const seed = seedJson as PilotRecord
export const QR_ADDRESS =
  typeof window !== 'undefined'
    ? `${window.location.origin}/g/o-gallery`
    : 'https://inview.moshes.io/g/o-gallery'

const visitorKey = 'inview-visitor-id'
const memoryVisitorId = crypto.randomUUID()

export function getVisitorId(): string {
  try {
    const current = localStorage.getItem(visitorKey)
    if (current && /^[a-zA-Z0-9-]{8,80}$/.test(current)) return current
    const id = crypto.randomUUID()
    localStorage.setItem(visitorKey, id)
    return id
  } catch {
    return memoryVisitorId
  }
}

export function oCopy(lang: 'en' | 'fa') {
  if (lang === 'fa') {
    return {
      currentShow: 'نمایش جاری',
      seeWorks: 'دیدن آثار',
      priceList: 'فهرست قیمت',
      catalogue: 'فهرست آثار هنوز بارگذاری نشده است.',
      sampleBanner: 'این یک نمونه است. این اثر متعلق به گالری اُ نیست.',
      samplesTitle: 'نمونه‌ها',
      downloadPdf: 'دریافت PDF',
      worksTitle: 'آثار',
    }
  }
  return {
    currentShow: 'Current show',
    seeWorks: 'See the works',
    priceList: 'Price list',
    catalogue: 'The catalogue is not loaded yet.',
    sampleBanner: 'This is a sample. It is not an O Gallery artwork.',
    samplesTitle: 'Samples',
    downloadPdf: 'Download PDF',
    worksTitle: 'Works',
  }
}

export function pick(lang: 'en' | 'fa', en: string, fa: string) {
  if (lang === 'fa') return fa || en
  return en || fa
}

export async function fetchPilot(): Promise<{ record: PilotRecord }> {
  const res = await fetch('/api/pilot', { cache: 'no-store' })
  if (!res.ok) throw new Error('The gallery record did not load.')
  return res.json()
}

export async function fetchStaff(accessCode: string): Promise<StaffReport> {
  const res = await fetch('/api/pilot/staff', {
    cache: 'no-store',
    headers: { 'X-Access-Code': accessCode },
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data.error || 'The visit report did not load.')
  return data as StaffReport
}

export function usePilotRecord(enabled = true) {
  const [record, setRecord] = useState<PilotRecord>(seed)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let live = true
    fetchPilot()
      .then((state) => { if (live && state.record) setRecord(state.record) })
      .catch(() => {})
      .finally(() => { if (live) setReady(true) })
    return () => { live = false }
  }, [enabled])
  return { record, ready, setRecord }
}

const sent = new Set<string>()

export function recordLandingScan() {
  const day = new Date().toISOString().slice(0, 10)
  const localKey = `inview-o-scan-${day}`
  try {
    if (localStorage.getItem(localKey) === '1') return
  } catch { /* count on the server */ }
  const mark = `scan:${day}:${getVisitorId()}`
  if (sent.has(mark)) return
  sent.add(mark)
  void fetch('/api/pilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'visit', kind: 'scan', visitorId: getVisitorId() }),
  }).then(async (res) => {
    if (!res.ok) throw new Error('scan failed')
    try { localStorage.setItem(localKey, '1') } catch { /* server still dedupes */ }
  }).catch(() => { sent.delete(mark) })
}

export function recordWorkView(workId: string) {
  const mark = `view:${workId}:${Math.floor(Date.now() / 500)}`
  if (sent.has(mark)) return
  sent.add(mark)
  void fetch('/api/pilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'visit', kind: 'view', visitorId: getVisitorId(), workId }),
  }).catch(() => {})
}

export function reportLead(phone: string, kind: 'save' | 'ask' | 'follow' | 'stamp', workId?: string) {
  if (kind !== 'save' && kind !== 'ask') return
  if (!window.location.pathname.startsWith('/g/o-gallery')) return
  void fetch('/api/pilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'lead', kind, phone, visitorId: getVisitorId(), workId: workId ?? null }),
  }).catch(() => {})
}
