import Works from '~/pages/visitor/Works'
import { PUBLIC_PAGE_HEADERS } from '~/lib/cache'
import { loadGalleryPage } from './pilot.server'

export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  return loadGalleryPage(request, params.slug)
}

export function headers() {
  return PUBLIC_PAGE_HEADERS
}

export default function GalleryWorks() {
  return <Works />
}
