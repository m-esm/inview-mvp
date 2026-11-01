import { Link, redirect, useLoaderData } from 'react-router'
import { database } from '../../database/context'
import { staffGalleries, staffHeaders, staffPrincipal } from '../../server/staff'
import { useStaffT } from '../lib/i18n-staff'
import { StaffLangSwitch } from '../components/StaffLangSwitch'

export const headers = staffHeaders
export async function loader({ request }: { request: Request }) {
  const db = database()
  const principal = await staffPrincipal(db, request)
  const galleries = await staffGalleries(db, principal)
  const destinations = galleries.map((gallery) => ({ ...gallery, path: `/staff/${gallery.slug}` }))
  if (destinations.length === 1) throw redirect(destinations[0].path, { headers: staffHeaders() })
  return { galleries: destinations }
}
export default function StaffIndex() {
  const { galleries } = useLoaderData<typeof loader>()
  const { t, lang, dir } = useStaffT()
  return <main className="staff-main" dir={dir}><StaffLangSwitch /><h1>{t.galleries}</h1><ul>{galleries.map((gallery) => <li key={gallery.id}><Link to={gallery.path}>{lang === 'fa' ? gallery.nameFa || gallery.nameEn : gallery.nameEn}</Link></li>)}</ul>{!galleries.length && <p>{t.noGalleries}</p>}<form method="post" action="/staff/sign-out"><button type="submit">{t.signOut}</button></form></main>
}
