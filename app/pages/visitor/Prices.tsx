import { Link, useLoaderData, useParams } from 'react-router'
import { OPrices } from './OGalleryPages'
import { artworks, gallery } from '../../data/gallery'
import { useT } from '../../lib/i18n'
import { isDatabaseGallery } from '../../lib/galleries'
import { seed, type GalleryPageData } from '../../lib/pilot'

export default function Prices() {
  const { slug } = useParams()
  const { pilot } = useLoaderData() as GalleryPageData
  if (isDatabaseGallery(slug)) return <OPrices record={pilot ?? seed} />
  return <RoozPrices />
}

function RoozPrices() {
  const { t, price, status, artist, medium, size, showTitle, galleryName } = useT()
  return (
    <div className="pad prices reveal">
      <p className="eyebrow">{galleryName}</p>
      <h1 className="page-title">{t.priceList}</h1>
      <span className="ink-rule" aria-hidden />
      <p className="muted small">{showTitle}</p>
      <ol className="price-list">
        {artworks.map((a, i) => (
          <li key={a.id}>
            <Link to={`/g/${gallery.slug}/works/${a.id}`}>
              <span className="pl-num" aria-hidden>{i + 1}</span>
              <img src={a.image} alt="" />
              <span className="pl-text">
                <strong>{artist(a)}</strong>
                <span className="muted small">{medium(a)}, {size(a)}</span>
              </span>
              <span className="pl-price">
                <span>{price(a) ?? '—'}</span>
                <span className={`status s-${a.status}`}>{status(a.status)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
