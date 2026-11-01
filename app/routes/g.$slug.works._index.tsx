import Works from '~/pages/visitor/Works'
import { PUBLIC_PAGE_HEADERS } from '~/lib/cache'
import { loadGalleryPage } from './pilot.server'
import type { MetaFunction } from 'react-router'
import { galleryPageMeta } from '~/lib/meta'

export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  return loadGalleryPage(request, params.slug)
}

export const meta: MetaFunction = ({ data, matches, location }) =>
  galleryPageMeta('works', matches, location.pathname, data as Parameters<typeof galleryPageMeta>[3])

export function headers() {
  return PUBLIC_PAGE_HEADERS
}

export default function GalleryWorks() {
  return <Works />
}
