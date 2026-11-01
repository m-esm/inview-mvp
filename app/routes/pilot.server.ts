import { database } from '../../database/context'
import { loadPublicRecord, tenantBySlug } from '../../server/gallery-record'
import { artworks } from '../data/gallery'
import { DEMO_SLUG, O_SLUG } from '../lib/galleries'
import type { GalleryPageData, PilotRecord, PilotWork } from '../lib/pilot'

type GalleryRead = { found: true; record: PilotRecord | null } | { found: false }

const perRequest = new WeakMap<Request, Map<string, Promise<GalleryRead>>>()

function readGallery(slug: string): Promise<GalleryRead> {
  const db = database()
  return tenantBySlug(db, slug).then(async (tenant): Promise<GalleryRead> => {
    if (!tenant) return { found: false }
    const { record } = await loadPublicRecord(db, tenant)
    return { found: true, record }
  })
}

function sharedRead(request: Request, slug: string): Promise<GalleryRead> {
  let bySlug = perRequest.get(request)
  if (!bySlug) {
    bySlug = new Map()
    perRequest.set(request, bySlug)
  }
  const started = bySlug.get(slug)
  if (started) return started
  const pending = readGallery(slug)
  bySlug.set(slug, pending)
  return pending
}

export function loadOGalleryPilot(request: Request): Promise<PilotRecord | null> {
  return sharedRead(request, O_SLUG)
    .then((read) => (read.found ? read.record : null))
    .catch((error: unknown) => {
      console.error('O Gallery loader failed', error)
      return null
    })
}

export function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
}

function unavailable(): Response {
  return new Response('The catalogue is not available.', { status: 503, headers: { 'Cache-Control': 'no-store' } })
}

export async function loadGalleryPage(
  request: Request,
  slug: string | undefined,
): Promise<GalleryPageData> {
  if (!slug) throw notFound()
  if (slug === DEMO_SLUG) return { pilot: null }
  if (slug === O_SLUG) return { pilot: await loadOGalleryPilot(request) }
  let read: GalleryRead
  try {
    read = await sharedRead(request, slug)
  } catch (error) {
    console.error('Gallery loader failed', error)
    throw unavailable()
  }
  if (!read.found) throw notFound()
  return { pilot: read.record }
}

export async function loadWorkPage(
  request: Request,
  slug: string | undefined,
  id: string | undefined,
): Promise<GalleryPageData & { work: PilotWork | null }> {
  const page = await loadGalleryPage(request, slug)
  if (slug === DEMO_SLUG) {
    if (!artworks.some((artwork) => artwork.id === id)) throw notFound()
    return { ...page, work: null }
  }
  if (!page.pilot) throw unavailable()
  const work = page.pilot.works.find((item) => item.id === id)
  if (!work) throw notFound()
  return { ...page, work }
}
