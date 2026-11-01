import Work from '~/pages/visitor/Work'
import { PUBLIC_PAGE_HEADERS } from '~/lib/cache'
import { loadWorkPage } from './pilot.server'

export async function loader({
  request,
  params,
}: {
  request: Request
  params: { slug?: string; id?: string }
}) {
  return loadWorkPage(request, params.slug, params.id)
}

export function headers() {
  return PUBLIC_PAGE_HEADERS
}

export default function GalleryWork() {
  return <Work />
}
