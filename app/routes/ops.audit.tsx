import { Form, Link, useLoaderData } from 'react-router'
import { database } from '../../database/context'
import { auditChoices, auditPage } from '../../server/ops-admin'
import { OpsSubmit } from '../components/OpsUi'
import { useOpsT } from '../lib/i18n-ops'
import { operatorFor, privateHeaders } from './ops-session.server'

export const headers = privateHeaders
export async function loader({ request }: { request: Request }) {
  const principal = await operatorFor(request)
  const search = new URL(request.url).searchParams
  const filters = { gallery: search.get('gallery') || '', actor: search.get('actor') || '', action: search.get('action') || '', page: Number(search.get('page')) || 1 }
  return { filters, ...await auditPage(database(), principal, filters), ...await auditChoices(database(), principal) }
}

export default function Audit() {
  const { filters, rows, page, hasNext, galleries, actors, actions } = useLoaderData<typeof loader>()
  const { t, lang, format } = useOpsT()
  const pageLink = (value: number) => `?${new URLSearchParams({ gallery: filters.gallery, actor: filters.actor, action: filters.action, page: String(value) })}`
  return <><h1>{t.audit}</h1><Form method="get" className="ops-filters" key={JSON.stringify(filters)}>
    <label>{t.gallery}<select name="gallery" defaultValue={filters.gallery}><option value="">{t.all}</option>{galleries.map((gallery) => <option key={gallery.id} value={gallery.id}>{lang === 'fa' ? gallery.nameFa : gallery.name}</option>)}</select></label>
    <label>{t.actor}<select name="actor" defaultValue={filters.actor}><option value="">{t.all}</option>{actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name || actor.id}</option>)}</select></label>
    <label>{t.action}<select name="action" defaultValue={filters.action}><option value="">{t.all}</option>{actions.map(({ action }) => <option key={action} value={action}>{t[action as keyof typeof t] || action}</option>)}</select></label>
    <OpsSubmit>{t.filter}</OpsSubmit>
  </Form><ul className="ops-audit-list">{rows.map((row) => <li key={row.id}>
    <strong>{t[row.action as keyof typeof t] || row.action}</strong>
    <p>{t.actor}: {row.actor || t.unknown} · {t.gallery}: {(lang === 'fa' ? row.galleryFa : row.gallery) || t.platform}</p>
    <p>{t.target}: <bdi>{row.targetType} / {row.targetId}</bdi></p>
    <time dateTime={String(row.createdAt)}>{format.dateTime(String(row.createdAt))}</time>
  </li>)}</ul>{!rows.length && <p>{t.noRows}</p>}
    <nav className="ops-links" aria-label={t.pagination}>{page > 1 && <Link to={pageLink(page - 1)}>{t.previous}</Link>}<span>{t.page} {format.number(page)}</span>{hasNext && <Link to={pageLink(page + 1)}>{t.next}</Link>}</nav>
  </>
}
