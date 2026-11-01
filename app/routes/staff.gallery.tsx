import { useLoaderData } from 'react-router'
import GalleryEditor from '../pages/gallery/GalleryEditor'
import { GalleryStaffLayout } from '../pages/gallery/GalleryStaffLayout'
import { staffHeaders } from '../../server/staff'
import { galleryData } from './staff-session.server'

export const headers = staffHeaders
export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  return galleryData(request, params.slug ?? '', 'view-report')
}
export default function StaffGallery() {
  const { gallery, record, report, permissions } = useLoaderData<typeof loader>()
  return <GalleryStaffLayout gallery={gallery} permissions={permissions}><GalleryEditor key={gallery.slug} initialRecord={record} initialReport={report} canExport={permissions.includes('export-leads')} reportOnly={!permissions.includes('edit-catalogue')} /></GalleryStaffLayout>
}
