import { Link } from 'react-router'
import type { Artwork } from '../data/gallery'
import { gallery } from '../data/gallery'
import { useT } from '../lib/i18n'
import { useVisitor, visitor } from '../lib/store'
import { useSignIn } from './VisitorShell'
import { Heart } from './Icons'

export function ArtworkCard({ a, priority = false }: { a: Artwork, priority?: boolean }) {
  const { t, price, status, artist, medium, size } = useT()
  const { saved } = useVisitor()
  const { requireSignIn } = useSignIn()
  const isSaved = saved.includes(a.id)
  const p = price(a)
  return (
    <article className="card">
      <Link to={`/g/${gallery.slug}/works/${a.id}`} className="card-img">
        <img src={a.image} alt={a.alt} width={a.width} height={a.height} loading={priority ? 'eager' : 'lazy'} />
      </Link>
      <button
        className={`heart ${isSaved ? 'on' : ''}`}
        aria-pressed={isSaved}
        aria-label={`${t.save}: ${artist(a)}`}
        onClick={() => (isSaved ? visitor.toggleSaved(a.id) : requireSignIn('save', () => visitor.save(a.id), artist(a)))}
      >
        <Heart size={18} filled={isSaved} />
      </button>
      <Link to={`/g/${gallery.slug}/works/${a.id}`} className="label">
        <span className="label-artist" dir="auto">{artist(a)}</span>
        <span className="label-meta">
          <bdi className="bidi-plain">{medium(a)}</bdi>
          {', '}
          <bdi className="bidi-plain">{size(a)}</bdi>
        </span>
        <span className="label-row">
          {p && <span className="label-price"><bdi className="bidi-plain">{p}</bdi></span>}
          <span className={`status s-${a.status}`}>{status(a.status)}</span>
        </span>
      </Link>
    </article>
  )
}
