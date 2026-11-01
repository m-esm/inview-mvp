import Work from '~/pages/visitor/Work'
import { PUBLIC_PAGE_HEADERS } from '~/lib/cache'
import { loadWorkPage } from './pilot.server'
import type { MetaFunction } from 'react-router'
import { galleryPageMeta } from '~/lib/meta'

export async function loader({
  request,
  params,
}: {
  request: Request
  params: { slug?: string; id?: string }
}) {
  return loadWorkPage(request, params.slug, params.id)
}

export const meta: MetaFunction = ({ data, matches, location }) =>
  galleryPageMeta('work', matches, location.pathname, data as Parameters<typeof galleryPageMeta>[3])

export function headers() {
  return PUBLIC_PAGE_HEADERS
}

export default function GalleryWork() {
  return <Work />
}
