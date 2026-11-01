import OGalleryEditor from '~/pages/gallery/OGalleryEditor'
import { guardOGallery } from './staff-session.server'

export async function loader({ request }: { request: Request }) {
  return (await guardOGallery(request)) ?? null
}

export default function DashboardOGallery() {
  return <OGalleryEditor />
}
