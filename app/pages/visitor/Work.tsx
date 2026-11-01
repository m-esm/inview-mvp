import { Link, useNavigate, useParams } from 'react-router'
import { useState } from 'react'
import { OWork } from './OGalleryPages'
import { artworks, gallery } from '../../data/gallery'
import { useT } from '../../lib/i18n'
import { useVisitor, visitor } from '../../lib/store'
import { useSignIn } from '../../components/VisitorShell'
import { Back, Chat, Heart } from '../../components/Icons'

export default function Work() {
  const { slug } = useParams()
  if (slug === 'o-gallery') return <OWork />
  return <RoozWork />
}

function RoozWork() {
  const { id } = useParams()
  const nav = useNavigate()
  const { t, price, status, artist, medium, size, year, title } = useT()
  const { saved, follows } = useVisitor()
  const { requireSignIn } = useSignIn()
  const [asked, setAsked] = useState<string | null>(null)
  const i = artworks.findIndex((a) => a.id === id)
  const a = artworks[i]
  const base = `/g/${gallery.slug}`

  if (!a) {
    return (
      <div className="pad empty">
        <p>This work isn’t in the current show.</p>
        <Link className="btn btn-outline" to={`${base}/works`}>{t.artworks}</Link>
      </div>
    )
  }
  const isSaved = saved.includes(a.id)
  const isFollowing = follows.includes(a.artist)
  const next = artworks[(i + 1) % artworks.length]
  const p = price(a)

  return (
    <div className="work">
      <div className="pad row between">
        <button className="btn-text inline" onClick={() => nav(-1)}><Back />{t.back}</button>
        <span className="muted small">{t.workOf(i + 1, artworks.length)}</span>
      </div>
      <figure className="work-figure">
        <img src={a.image} alt={a.alt} />
      </figure>
      <div className="pad wall-label reveal">
        <h1 className="work-artist">{artist(a)}</h1>
        <span className="ink-rule" aria-hidden />
        <p className="work-title">{title(a)}, {year(a)}</p>
        <p className="muted">{medium(a)}, {size(a)}</p>
        <div className="row between price-row">
          <span className="work-price">{p ?? t.sold}</span>
          <span className={`status s-${a.status}`}>{status(a.status)}</span>
        </div>
      </div>
      <div className="pad actions">
        <button className={`btn ${isSaved ? 'btn-quiet' : 'btn-primary'}`} aria-pressed={isSaved}
          onClick={() => (isSaved ? visitor.toggleSaved(a.id) : requireSignIn('save', () => visitor.save(a.id), `${artist(a)}, ${title(a)}`))}>
          <Heart filled={isSaved} />{isSaved ? t.saved : t.save}
        </button>
        {a.status !== 'sold' && (
          <button className="btn btn-outline" disabled={asked === a.id}
            onClick={() => requireSignIn('ask', () => setAsked(a.id), `${artist(a)}, ${title(a)}`)}>
            <Chat />{asked === a.id ? t.asked : t.ask}
          </button>
        )}
        <button className="btn-text" aria-pressed={isFollowing}
          onClick={() => (isFollowing ? visitor.toggleFollow(a.artist) : requireSignIn('follow', () => visitor.toggleFollow(a.artist), artist(a)))}>
          {isFollowing ? `${t.following}: ${artist(a)}` : `${t.follow}: ${artist(a)}`}
        </button>
      </div>
      <Link to={`${base}/works/${next.id}`} className="next">
        <img src={next.image} alt="" />
        <span><span className="muted small">{t.workOf(((i + 1) % artworks.length) + 1, artworks.length)}</span><strong>{artist(next)}</strong></span>
      </Link>
    </div>
  )
}
