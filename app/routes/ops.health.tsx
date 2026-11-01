import { useLoaderData, type AppLoadContext } from 'react-router'
import { database } from '../../database/context'
import { operatorHealth } from '../../server/ops-admin'
import { useOpsT } from '../lib/i18n-ops'
import { operatorFor, privateHeaders } from './ops-session.server'

export const headers = privateHeaders
export async function loader({ request, context }: { request: Request; context: AppLoadContext }) {
  const principal = await operatorFor(request)
  return operatorHealth(database(), principal, context.storage)
}

export default function Health() {
  const health = useLoaderData<typeof loader>()
  const { t, format } = useOpsT()
  return <><h1>{t.health}</h1><dl className="ops-health-details">
    <dt>{t.imageTag}</dt><dd><bdi>{health.imageTag}</bdi></dd>
    <dt>{t.ready}</dt><dd>{health.readiness.body.ok ? t.ready : t.down} ({health.readiness.status})</dd>
    {Object.entries(health.readiness.body.checks).map(([name, status]) => <div key={name}><dt>{name === 'db' ? t.database : t.storage}</dt><dd>{status === 'ok' ? t.ready : t.down}</dd></div>)}
    <dt>{t.blocksToday}</dt><dd>{health.blocks === null ? t.unknown : format.number(health.blocks)}</dd>
    <dt>{t.mediaCount}</dt><dd>{health.mediaCount === null ? t.unknown : format.number(health.mediaCount)}</dd>
  </dl><p>{t.blocksHint}</p><section className="ops-section"><h2>{t.migrations}</h2>
    <ul className="ops-activity">{health.migrations.map((migration) => <li key={migration.id}><bdi>{migration.id}</bdi><time>{format.dateTime(String(migration.applied_at))}</time></li>)}</ul>
    {!health.migrations.length && <p>{t.noRows}</p>}
  </section></>
}
