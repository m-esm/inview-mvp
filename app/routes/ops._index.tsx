import { Link, useLoaderData, type AppLoadContext } from 'react-router'
import { database } from '../../database/context'
import { listGalleries, recentAudit } from '../../server/ops'
import { pingDatabase, runChecks } from '../../server/ready'
import { useOpsT } from '../lib/i18n-ops'
import { operatorFor, privateHeaders } from './ops-session.server'

export const headers = privateHeaders
export async function loader({ request, context }: { request: Request; context: AppLoadContext }) {
  const principal = await operatorFor(request)
  const db = database()
  const [galleries, audit, health] = await Promise.all([
    listGalleries(db, principal), recentAudit(db, principal),
    runChecks({ db: () => pingDatabase(db), storage: () => context.storage.probe() }),
  ])
  return { galleries, audit, ready: health.body.ok }
}

export default function OpsOverview() {
  const { galleries, audit, ready } = useLoaderData<typeof loader>()
  const { t, lang, format } = useOpsT()
  return <>
    <div className="ops-title"><div><p className="ops-eyebrow">{t.panel}</p><h1>{t.overview}</h1></div><Link className="btn btn-primary" to="/ops/galleries/new">{t.newGallery}</Link></div>
    <p className="ops-health">{t.health}: <strong>{ready ? t.ready : t.down}</strong></p>
    <div className="ops-table-scroll" tabIndex={0} role="region" aria-label={t.overview}><table className="ops-table">
      <thead><tr><th scope="col">{t.gallery}</th><th scope="col">{t.status}</th><th scope="col">{t.works}</th><th scope="col">{t.lastPublish}</th><th scope="col">{t.days7}</th><th scope="col">{t.days30}</th></tr></thead>
      <tbody>{galleries.map((gallery) => <tr key={gallery.id}>
        <th scope="row"><Link to={`/ops/galleries/${gallery.slug}`}>{lang === 'fa' ? gallery.nameFa : gallery.nameEn}</Link><small dir="ltr">{gallery.slug}</small></th>
        <td><span className="ops-status">{t[gallery.status]}</span></td><td>{format.number(gallery.worksCount)}</td>
        <td>{gallery.lastPublish ? format.dateTime(String(gallery.lastPublish)) : t.never}</td>
        {[gallery.days7, gallery.days30].map((period, index) => <td key={index}><div className="ops-stats"><span>{t.scans}: {format.number(period.scans)}</span><span>{t.views}: {format.number(period.views)}</span><span>{t.leads}: {format.number(period.leads)}</span></div></td>)}
      </tr>)}</tbody>
    </table></div>{!galleries.length && <p>{t.noRows}</p>}
    <section className="ops-section"><h2>{t.recent}</h2><ul className="ops-activity">{audit.map((row) => <li key={row.id}><span>{Object.hasOwn(t, row.action) ? t[row.action as keyof typeof t] : row.action}</span><time>{format.dateTime(String(row.createdAt))}</time></li>)}</ul>{!audit.length && <p>{t.noRows}</p>}</section>
  </>
}
