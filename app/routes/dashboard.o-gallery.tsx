import { useLoaderData } from 'react-router'
import OGalleryEditor from '~/pages/gallery/OGalleryEditor'
import { OGalleryStaffLayout } from '~/pages/gallery/OGalleryStaffLayout'
import { database } from '../../database/context'
import { loadStaffRecord, tenantById } from '../../server/gallery-record'
import { readStaffSession, anonymousEditorGate } from '../../server/staff-session'

export function headers() {
  return { 'Cache-Control': 'no-store' }
}

export async function loader({ request }: { request: Request }) {
  const db = database()
  const session = await readStaffSession(db, request.headers.get('cookie'))
  const gate = anonymousEditorGate(session)
  if (gate) return gate
  const tenant = await tenantById(db, session!.galleryId)
  if (!tenant) throw new Response('Not found', { status: 404 })
  const { record } = await loadStaffRecord(db, tenant)
  return { record }
}

export default function DashboardOGallery() {
  const { record } = useLoaderData<typeof loader>() as Awaited<ReturnType<typeof loadStaffRecord>>
  return (
    <OGalleryStaffLayout>
      <OGalleryEditor initialRecord={record} />
    </OGalleryStaffLayout>
  )
}
