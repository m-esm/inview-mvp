import { database } from '../../database/context'
import { galleryNotFound, loadPublicRecord, tenantBySlug } from '../../server/gallery-record'
import { artworks } from '../data/gallery'
import { DEMO_SLUG } from '../lib/galleries'
import type { GalleryPageData, PilotRecord, PilotWork } from '../lib/pilot'

type GalleryRead = { found: true; record: PilotRecord | null } | { found: false }

const perRequest = new WeakMap<Request, Map<string, Promise<GalleryRead>>>()

function readGallery(slug: string): Promise<GalleryRead> {
  const db = database()
  return tenantBySlug(db, slug).then(async (tenant): Promise<GalleryRead> => {
    if (!tenant || tenant.gallery.status !== 'live') return { found: false }
    let record: PilotRecord
    try {
      ;({ record } = await loadPublicRecord(db, tenant))
    } catch (error) {
      if (error instanceof Response && error.status === 404) return { found: false }
      throw error
    }
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

export function notFound(): Response {
  return galleryNotFound()
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
