import { Link, useParams } from 'react-router'
import { OWelcome } from './OGalleryPages'
import { artworks, artists, gallery } from '../../data/gallery'
import { useT } from '../../lib/i18n'
import { useVisitor, visitor } from '../../lib/store'
import { useSignIn } from '../../components/VisitorShell'
import { Check, Chevron } from '../../components/Icons'

export default function Welcome() {
  const { slug } = useParams()
  if (slug === 'o-gallery') return <OWelcome />
  return <RoozWelcome />
}

function RoozWelcome() {
  const { t, n, lang, galleryName, showTitle, showKind, showDates } = useT()
  const { stamps } = useVisitor()
  const { requireSignIn } = useSignIn()
  const base = `/g/${gallery.slug}`
  const available = artworks.filter((a) => a.status === 'available').length
  const stamped = stamps.includes(gallery.slug)
  const cover = artworks[1]

  const sections = [
    { to: `${base}/works`, mark: n(artworks.length), title: t.artworks, sub: t.artworksSub, accent: 'pine' },
    { to: `${base}/prices`, mark: lang === 'fa' ? 'ت' : 'T', title: t.priceList, sub: t.priceListSub(available), accent: 'copper' },
    { to: `${base}/about#artists`, mark: n(artists.length), title: t.aboutArtists, sub: artists.slice(0, 3).join(', ') + '…' },
    { to: `${base}/about#text`, mark: 'Aa', title: t.aboutText, sub: t.aboutTextSub },
    { to: `${base}/about#visit`, mark: 'i', title: t.visit, sub: t.visitSub },
  ]

  return (
    <div className="welcome">
      <div className="cover">
        <img src={cover.image} alt={cover.alt} />
      </div>
      <div className="pad intro">
        <p className="muted">{t.welcomeLine(galleryName)}. {t.nowShowing}</p>
        <h1 className="show-title">{showTitle}</h1>
        <p className="show-kind">{showKind}</p>
        <p className="muted small">{showDates}. {t.hours}</p>
      </div>
      <ul className="menu" role="list">
        {sections.map((s) => (
          <li key={s.title}>
            <Link to={s.to}>
              <span className={`mark ${s.accent ?? ''}`} aria-hidden>{s.mark}</span>
              <span className="menu-text"><strong>{s.title}</strong><span className="muted small">{s.sub}</span></span>
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>
      <div className="pad">
        <button className={`btn ${stamped ? 'btn-quiet' : 'btn-primary'} wide`} disabled={stamped}
          onClick={() => requireSignIn('stamp', () => visitor.stamp(gallery.slug))}>
          <Check />{stamped ? t.stamped : t.stamp}
        </button>
        <p className="muted tiny center">{t.noApp}</p>
      </div>
    </div>
  )
}
