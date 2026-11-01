import { VisitorShell } from '~/components/VisitorShell'
import { loadGalleryPage } from './pilot.server'

export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  // `/me` shares this layout and carries no gallery slug.
  if (!params.slug) return { pilot: null }
  return loadGalleryPage(request, params.slug)
}

export default function GalleryVisitorLayout() {
  return <VisitorShell />
}
