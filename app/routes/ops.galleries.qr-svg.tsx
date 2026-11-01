import { database } from '../../database/context'
import { galleryQrSvg } from '../../server/ops-data'
import { actionFailure, operatorGallery, privateHeaders } from './ops-session.server'

export async function loader({ request, params }: { request: Request; params: { slug?: string; code?: string } }) {
  const { principal, gallery } = await operatorGallery(request, params.slug ?? '')
  try {
    const svg = await galleryQrSvg(database(), principal, gallery.id, gallery.slug, params.code ?? '', process.env.PUBLIC_APP_URL || new URL(request.url).origin)
    return new Response(svg, { headers: { ...privateHeaders(), 'Content-Type': 'image/svg+xml', 'Content-Disposition': 'attachment; filename="gallery-qr.svg"' } })
  } catch (error) { return actionFailure(error) }
}
