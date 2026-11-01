import { Form, Link, Outlet } from 'react-router'
import { StaffLangSwitch } from '../components/StaffLangSwitch'
import { useOpsT } from '../lib/i18n-ops'
import { operatorFor, privateHeaders } from './ops-session.server'

export const headers = privateHeaders
export async function loader({ request }: { request: Request }) {
  await operatorFor(request)
  return null
}

export default function OpsLayout() {
  const { t, dir } = useOpsT()
  return <div className="ops-shell" dir={dir}>
    <a className="ops-skip" href="#ops-content">{t.overview}</a>
    <header className="ops-header">
      <Link className="ops-brand" to="/ops">{t.brand}<span>{t.panel}</span></Link>
      <nav aria-label={t.panel}><Link to="/ops">{t.overview}</Link><Link to="/ops/galleries/new">{t.newGallery}</Link></nav>
      <StaffLangSwitch /><Form method="post" action="/ops/sign-out"><button className="btn btn-outline">{t.signOut}</button></Form>
    </header>
    <main id="ops-content" className="ops-content"><Outlet /></main>
  </div>
}
