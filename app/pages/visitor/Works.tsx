import { useState } from 'react'
import { Link, useLoaderData, useParams } from 'react-router'
import { OWorks } from './OGalleryPages'
import { artworks, gallery, type Status } from '../../data/gallery'
import { useT } from '../../lib/i18n'
import { isDatabaseGallery } from '../../lib/galleries'
import { seed, type GalleryPageData } from '../../lib/pilot'
import { ArtworkCard } from '../../components/ArtworkCard'

type Filter = 'all' | Status

export default function Works() {
  const { slug } = useParams()
  const { pilot } = useLoaderData() as GalleryPageData
  if (isDatabaseGallery(slug)) return <OWorks record={pilot ?? seed} />
  return <RoozWorks />
}

function RoozWorks() {
  const { t, n, showTitle, showKind } = useT()
  const [filter, setFilter] = useState<Filter>('all')
  const list = filter === 'all' ? artworks : artworks.filter((a) => a.status === filter)
  const filters: Filter[] = ['all', 'available', 'reserved', 'sold']
  const label = (f: Filter) => (f === 'all' ? t.all : t[f])
  const count = (f: Filter) => (f === 'all' ? artworks.length : artworks.filter((a) => a.status === f).length)

  return (
    <div>
      <div className="pad reveal">
        <p className="eyebrow">{showKind}</p>
        <h1 className="page-title">{showTitle}</h1>
        <span className="ink-rule" aria-hidden />
        <p className="muted small">{n(artworks.length)} {t.artworks.toLowerCase()}</p>
      </div>
      <div className="chips" role="group" aria-label={t.artworks}>
        {filters.map((f) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {label(f)} <span className="chip-count">{n(count(f))}</span>
          </button>
        ))}
      </div>
      <div className="grid">
        {list.map((a, index) => <ArtworkCard key={a.id} a={a} priority={index < 2} />)}
      </div>
      <div className="pad">
        <Link to={`/g/${gallery.slug}/prices`} className="btn btn-outline wide">{t.priceList}</Link>
      </div>
    </div>
  )
}
