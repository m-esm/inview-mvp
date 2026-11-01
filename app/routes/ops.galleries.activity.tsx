import { useLoaderData } from 'react-router'
import { database } from '../../database/context'
import { galleryActivity } from '../../server/ops-data'
import { GalleryLinks } from '../components/OpsUi'
import { useOpsT } from '../lib/i18n-ops'
import { operatorGallery, privateHeaders } from './ops-session.server'

export const headers = privateHeaders
export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  const { principal, gallery } = await operatorGallery(request, params.slug ?? '')
  return { gallery, ...await galleryActivity(database(), principal, gallery.id) }
}

export default function GalleryActivity() {
  const { gallery, days, works, audit } = useLoaderData<typeof loader>()
  const { t, lang, format } = useOpsT()
  return <><p className="ops-eyebrow">{lang === 'fa' ? gallery.nameFa : gallery.nameEn}</p><h1>{t.activity}</h1><GalleryLinks slug={gallery.slug} />
    <h2>{t.days30} · {t.tehran}</h2>
    <table className="ops-table ops-table-compact"><thead><tr><th scope="col">{t.day}</th><th scope="col">{t.scans}</th><th scope="col">{t.views}</th></tr></thead>
      <tbody>{days.map((day) => <tr key={day.day}><th scope="row">{format.day(day.day)}</th><td>{format.number(day.scans)}</td><td>{format.number(day.views)}</td></tr>)}</tbody>
    </table>
    <section className="ops-section"><h2>{t.viewsByWork}</h2><ul className="ops-activity">{works.map((work) => <li key={work.id}>
      <span>{lang === 'fa' ? work.titleFa || work.title : work.title}</span><span>{format.number(work.views)}</span>
    </li>)}</ul>{!works.length && <p>{t.noRows}</p>}</section>
    <section className="ops-section"><h2>{t.audit}</h2><ul className="ops-activity">{audit.map((row) => <li key={row.id}>
      <span>{t[row.action as keyof typeof t] || row.action}</span><time dateTime={String(row.createdAt)}>{format.dateTime(String(row.createdAt))}</time>
    </li>)}</ul>{!audit.length && <p>{t.noRows}</p>}</section>
  </>
}
