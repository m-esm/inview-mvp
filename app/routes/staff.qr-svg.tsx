import { database } from '../../database/context'
import { qrSvg, qrUrl, staffQr } from '../../server/qr'
import { staffHeaders, staffTenant } from '../../server/staff'

export const headers = staffHeaders
export async function loader({ request, params }: { request: Request; params: { slug?: string; code?: string } }) {
  const db = database()
  const { tenant } = await staffTenant(db, request, params.slug ?? '', 'create-qr')
  const qr = await staffQr(db, tenant, params.code ?? '')
  if (!qr) throw new Response('Not found', { status: 404, headers: staffHeaders() })
  return new Response(qrSvg(qrUrl(process.env.PUBLIC_APP_URL || new URL(request.url).origin, tenant.gallery.slug, qr.code)), { headers: { ...staffHeaders(), 'Content-Type': 'image/svg+xml', 'Content-Disposition': `attachment; filename="${tenant.gallery.slug}-${qr.code}.svg"` } })
}
