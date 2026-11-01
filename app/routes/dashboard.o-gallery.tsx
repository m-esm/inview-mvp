import { useLoaderData } from 'react-router'
import OGalleryEditor from '~/pages/gallery/OGalleryEditor'
import { database } from '../../database/context'
import { loadPublicRecord } from '../../server/gallery-record'
import { guardOGallery } from './staff-session.server'

export function headers() {
  return { 'Cache-Control': 'no-store' }
}

export async function loader({ request }: { request: Request }) {
  const gate = await guardOGallery(request)
  if (gate) return gate
  const { record } = await loadPublicRecord(database())
  return { record }
}

export default function DashboardOGallery() {
  const { record } = useLoaderData<typeof loader>() as Awaited<ReturnType<typeof loadPublicRecord>>
  return <OGalleryEditor initialRecord={record} />
}
