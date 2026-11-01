import { Link, useLoaderData, useParams } from 'react-router'
import { OPrices } from './OGalleryPages'
import { artworks, gallery } from '../../data/gallery'
import { useT } from '../../lib/i18n'
import { isDatabaseGallery } from '../../lib/galleries'
import { seed, type GalleryPageData } from '../../lib/pilot'
import { formatNumber, formatSize } from '../../lib/format'

export default function Prices() {
  const { slug } = useParams()
  const { pilot } = useLoaderData() as GalleryPageData
  if (isDatabaseGallery(slug)) return <OPrices record={pilot ?? seed} />
  return <RoozPrices />
}

function RoozPrices() {
  const { t, lang, title, year, status, artist, medium, size, showTitle, galleryName } = useT()
  return (
    <div className="pad prices reveal">
      <p className="eyebrow">{galleryName}</p>
      <h1 className="page-title">{t.priceList}</h1>
      <span className="ink-rule" aria-hidden />
      <p className="prices-subtitle">{showTitle}</p>
      <p className="small">{t.allPricesToman}</p>
      <ol className="price-list">
        {artworks.map((a) => (
          <li key={a.id}>
            <Link to={`/g/${gallery.slug}/works/${a.id}`}>
              <img src={a.image} alt={title(a)} />
              <span className="pl-text">
                <strong dir="auto">{title(a)}</strong>
                <span className="pl-artist" dir="auto">{artist(a)}</span>
                <span className="pl-meta"><bdi>{medium(a)}</bdi> · <bdi dir="ltr">{formatSize(lang, size(a))}</bdi> · <bdi>{year(a)}</bdi></span>
              </span>
              <span className={`pl-price${a.status === 'sold' ? ' pl-sold' : ''}`}>
                <span className="pl-amount">{formatNumber(lang, a.price)}</span>
                <span className={`status s-${a.status}`}>{status(a.status)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
