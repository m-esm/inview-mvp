import { useLoaderData } from 'react-router'
import { database } from '../../database/context'
import { loadStaffRecord } from '../../server/gallery-record'
import { staffHeaders, staffTenant } from '../../server/staff'
import { OLandingPreview } from '../pages/visitor/OGalleryPages'
import { useStaffT } from '../lib/i18n-staff'

export const headers = staffHeaders
export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  const db = database()
  const { tenant } = await staffTenant(db, request, params.slug ?? '', 'view-gallery')
  return loadStaffRecord(db, tenant)
}
export default function StaffPreview() {
  const { record } = useLoaderData<typeof loader>()
  const { t, lang, dir } = useStaffT()
  return <main dir={dir} lang={lang}><h1>{t.preview}</h1><OLandingPreview record={record} lang={lang} /></main>
}
