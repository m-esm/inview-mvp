import { data, Link, type MetaFunction } from 'react-router'
import { useT } from '~/lib/i18n'
import { metaCopy, rootData } from '~/lib/meta'

export function loader() {
  return data(null, { status: 404 })
}

export const meta: MetaFunction = ({ matches }) => {
  const words = metaCopy(rootData(matches).lang)
  return [{ title: `${words.notFound} · ${words.site}` }, { name: 'robots', content: 'noindex' }]
}

export default function NotFound() {
  const { t, dir } = useT()
  return (
    <main className="pad empty" dir={dir}>
      <h1 className="page-title">{t.notFound}</h1>
      <p className="muted">{t.notFoundBody}</p>
      <Link className="btn btn-outline" to="/g/o-gallery">{t.goToGallery}</Link>
    </main>
  )
}
