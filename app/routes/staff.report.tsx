import { useLoaderData } from 'react-router'
import { galleryData } from './staff-session.server'
import { staffHeaders } from '../../server/staff'
import GalleryEditor from '../pages/gallery/GalleryEditor'
import { GalleryStaffLayout } from '../pages/gallery/GalleryStaffLayout'

export const headers = staffHeaders
export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  return galleryData(request, params.slug ?? '', 'view-report')
}
export default function StaffReport() {
  const { gallery, record, report, permissions } = useLoaderData<typeof loader>()
  return <GalleryStaffLayout gallery={gallery} permissions={permissions}><GalleryEditor key={gallery.slug} initialRecord={record} initialReport={report} canExport={permissions.includes('export-leads')} reportOnly /></GalleryStaffLayout>
}
