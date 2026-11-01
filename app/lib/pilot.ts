import { pilotSeed as seedJson } from './galleries'
import { leadBody } from './consent'
import { isDatabaseGallery, O_SLUG } from './galleries'
import { QR_CODE_PATTERN, tehranDay } from './tehran-day'

export type PilotStatus = 'available' | 'reserved' | 'sold'

export interface PilotImageSet {
  webp: string
  jpeg: string
}

export interface PilotWork {
  id: string
  artist: string
  artistFa?: string
  title: string
  titleFa?: string
  medium: string
  mediumFa?: string
  size: string
  year: string
  price: number | null
  status: PilotStatus
  image: string
  imageSet?: PilotImageSet | null
  sample: boolean
}

export interface PilotRecord {
  slug: string
  demo?: boolean
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
  startsOn?: string | null
  endsOn?: string | null
  works: PilotWork[]
  updatedAt?: string
}

/** What every `/g/:slug` and `/site/:slug` loader returns. `null` means the read failed. */
export interface GalleryPageData {
  pilot: PilotRecord | null
}

export const seed = seedJson as PilotRecord
export const QR_ADDRESS =
  typeof window !== 'undefined'
    ? `${window.location.origin}/g/${O_SLUG}`
    : `https://inview.moshes.io/g/${O_SLUG}`

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

function withArticle(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`
}

export function oCopy(lang: 'en' | 'fa', galleryName?: string) {
  if (lang === 'fa') {
    return {
      currentShow: 'نمایش جاری',
      seeWorks: 'دیدن آثار',
      priceList: 'فهرست قیمت',
      emptyBody: 'آثار این نمایشگاه را اینجا خواهید دید.',
      emptyNote: 'برای این نمایشگاه یادداشتی نیست.',
      missingWork: 'این اثر در این نمایش نیست.',
      sampleBanner: `این یک نمونه است. این اثر متعلق به ${galleryName || 'گالری اُ'} نیست.`,
      demoLabel: 'نمونه نمایشی',
      demoNote: 'این گالری نمونه است. نام‌ها، آثار و قیمت‌ها ساختگی هستند.',
      samplesTitle: 'نمونه‌ها',
      downloadPdf: 'دریافت PDF',
      worksTitle: 'آثار',
      filterLabel: 'وضعیت آثار',
      filterAll: 'همه',
      artistsTitle: 'هنرمندان',
      worksCount: (n: string) => `${n} اثر`,
      noMatch: 'اثری با این وضعیت نیست.',
      showAll: 'نمایش همه آثار',
    }
  }
  return {
    currentShow: 'Current show',
    seeWorks: 'See the works',
    priceList: 'Price list',
    emptyBody: 'You will see the works for this show here.',
    emptyNote: 'This show has no note yet.',
    missingWork: 'This work is not in the show.',
    sampleBanner: `This is a sample. It is not ${withArticle(galleryName || 'O Gallery')} artwork.`,
    demoLabel: 'Demo',
    demoNote: 'This is a demo gallery. Names, works and prices are invented.',
    samplesTitle: 'Samples',
    downloadPdf: 'Download PDF',
    worksTitle: 'Works',
    filterLabel: 'Work status',
    filterAll: 'All',
    artistsTitle: 'Artists',
    worksCount: (n: string) => (n === '1' ? '1 work' : `${n} works`),
    noMatch: 'No work has this status.',
    showAll: 'Show all works',
  }
}

export function pick(lang: 'en' | 'fa', en: string, fa: string) {
  if (lang === 'fa') return fa || en
  return en || fa
}

export function gallerySlugFromPath(pathname: string): string | null {
  return pathname.match(/^\/g\/([^/]+)/)?.[1] ?? null
}

export async function fetchPilot(): Promise<{ record: PilotRecord }> {
  const res = await fetch('/api/v1/pilot', { cache: 'no-store' })
  if (!res.ok) throw new Error('The gallery record did not load.')
  return res.json()
}

const sent = new Set<string>()

function readBody(res: Response) {
  return res.text().then(() => res)
}

export function recordLandingScan(gallery: string, qrCode?: string | null) {
  const day = tehranDay()
  const localKey = gallery === O_SLUG ? `inview-o-scan-${day}` : `inview-scan-${gallery}-${day}`
  try {
    if (localStorage.getItem(localKey) === '1') return
  } catch { /* count on the server */ }
  const mark = `scan:${gallery}:${day}:${getVisitorId()}`
  if (sent.has(mark)) return
  sent.add(mark)
  void fetch('/api/v1/pilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      op: 'visit',
      gallery,
      kind: 'scan',
      visitorId: getVisitorId(),
      qrCode: qrCode && QR_CODE_PATTERN.test(qrCode) ? qrCode : undefined,
    }),
  }).then(readBody).then((res) => {
    if (!res.ok) throw new Error('scan failed')
    try { localStorage.setItem(localKey, '1') } catch { /* server still dedupes */ }
  }).catch(() => { sent.delete(mark) })
}

export function recordWorkView(gallery: string, workId: string) {
  const mark = `view:${gallery}:${workId}:${Math.floor(Date.now() / 500)}`
  if (sent.has(mark)) return
  sent.add(mark)
  void fetch('/api/v1/pilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'visit', gallery, kind: 'view', visitorId: getVisitorId(), workId }),
  }).then(readBody).catch(() => {})
}

export function reportLead(
  gallery: string | null,
  phone: string,
  kind: 'save' | 'ask' | 'follow' | 'stamp',
  workId?: string,
) {
  if (kind !== 'save' && kind !== 'ask') return
  if (!workId || !gallery || !isDatabaseGallery(gallery)) return
  void fetch('/api/v1/pilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...leadBody({ phone, kind, workId, visitorId: getVisitorId() }), gallery }),
  }).then(readBody).catch(() => {})
}
