import { Form, Link, Outlet, useLoaderData } from 'react-router'
import { can } from '../../server/authz'
import { StaffLangSwitch } from '../components/StaffLangSwitch'
import { useOpsT } from '../lib/i18n-ops'
import { operatorFor, privateHeaders } from './ops-session.server'

export const headers = privateHeaders
export async function loader({ request }: { request: Request }) {
  const principal = await operatorFor(request)
  return { manageOperators: can(principal, 'manage-operators') }
}

export default function OpsLayout() {
  const { t, dir } = useOpsT()
  const { manageOperators } = useLoaderData<typeof loader>()
  return <div className="ops-shell" dir={dir}>
    <a className="ops-skip" href="#ops-content">{t.overview}</a>
    <header className="ops-header">
      <Link className="ops-brand" to="/ops">{t.brand}<span>{t.panel}</span></Link>
      <nav aria-label={t.panel}><Link to="/ops">{t.overview}</Link><Link to="/ops/galleries/new">{t.newGallery}</Link>
        {manageOperators && <Link to="/ops/operators">{t.operators}</Link>}<Link to="/ops/audit">{t.audit}</Link><Link to="/ops/health">{t.health}</Link>
      </nav>
      <StaffLangSwitch /><Form method="post" action="/ops/sign-out"><button className="btn btn-outline">{t.signOut}</button></Form>
    </header>
    <main id="ops-content" className="ops-content"><Outlet /></main>
  </div>
}
