import { database } from '../../database/context'
import { exportGalleryLeads } from '../../server/ops-data'
import { actionFailure, operatorGallery, privateHeaders } from './ops-session.server'

export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  const { principal, gallery } = await operatorGallery(request, params.slug ?? '')
  try {
    const csv = await exportGalleryLeads(database(), principal, gallery.id)
    return new Response(csv, { headers: { ...privateHeaders(), 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${gallery.slug}-leads-${new Date().toISOString().slice(0, 10)}.csv"` } })
  } catch (error) { return actionFailure(error) }
}
