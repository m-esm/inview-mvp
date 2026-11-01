import { database } from '../../database/context'
import { loadPublicRecord } from '../../server/gallery-record'
import { artworks } from '../data/gallery'
import { DEMO_SLUG, O_SLUG } from '../lib/galleries'
import type { GalleryPageData, PilotRecord, PilotWork } from '../lib/pilot'

// The layout loader and the page loader of one request share this read.
const perRequest = new WeakMap<Request, Promise<PilotRecord | null>>()

export function loadOGalleryPilot(request: Request): Promise<PilotRecord | null> {
  const started = perRequest.get(request)
  if (started) return started
  const pending = loadPublicRecord(database())
    .then(({ record }): PilotRecord => record)
    .catch((error: unknown) => {
      console.error('O Gallery loader failed', error)
      return null
    })
  perRequest.set(request, pending)
  return pending
}

export function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
}

export async function loadGalleryPage(
  request: Request,
  slug: string | undefined,
): Promise<GalleryPageData> {
  if (slug === O_SLUG) return { pilot: await loadOGalleryPilot(request) }
  if (slug === DEMO_SLUG) return { pilot: null }
  throw notFound()
}

export async function loadWorkPage(
  request: Request,
  slug: string | undefined,
  id: string | undefined,
): Promise<GalleryPageData & { work: PilotWork | null }> {
  const page = await loadGalleryPage(request, slug)
  if (slug !== O_SLUG) {
    if (!artworks.some((artwork) => artwork.id === id)) throw notFound()
    return { ...page, work: null }
  }
  // The catalogue is unreadable, so this work is neither present nor missing.
  if (!page.pilot) throw new Response('The catalogue is not available.', { status: 503 })
  const work = page.pilot.works.find((item) => item.id === id)
  if (!work) throw notFound()
  return { ...page, work }
}
