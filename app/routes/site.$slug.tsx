import Website from '~/pages/site/Website'
import { PUBLIC_PAGE_HEADERS } from '~/lib/cache'
import { loadGalleryPage } from './pilot.server'
import type { MetaFunction } from 'react-router'
import { galleryPageMeta } from '~/lib/meta'

export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  return loadGalleryPage(request, params.slug)
}

export const meta: MetaFunction = ({ data, matches, location }) =>
  galleryPageMeta('website', matches, location.pathname, data as Parameters<typeof galleryPageMeta>[3])

export function headers() {
  return PUBLIC_PAGE_HEADERS
}

export default function SitePage() {
  return <Website />
}
