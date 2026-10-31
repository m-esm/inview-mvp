import { Link } from 'react-router'
import type { Artwork } from '../data/gallery'
import { gallery } from '../data/gallery'
import { useT } from '../lib/i18n'
import { useVisitor, visitor } from '../lib/store'
import { useSignIn } from './VisitorShell'
import { Heart } from './Icons'

export function ArtworkCard({ a }: { a: Artwork }) {
  const { t, price, status, artist, medium, size } = useT()
  const { saved } = useVisitor()
  const { requireSignIn } = useSignIn()
  const isSaved = saved.includes(a.id)
  const p = price(a)
  return (
    <article className="card">
      <Link to={`/g/${gallery.slug}/works/${a.id}`} className="card-img">
        <img src={a.image} alt={a.alt} loading="lazy" />
      </Link>
      <button
        className={`heart ${isSaved ? 'on' : ''}`}
        aria-pressed={isSaved}
        aria-label={`${isSaved ? t.saved : t.save}: ${artist(a)}`}
        onClick={() => (isSaved ? visitor.toggleSaved(a.id) : requireSignIn('save', () => visitor.save(a.id), artist(a)))}
      >
        <Heart size={18} filled={isSaved} />
      </button>
      <Link to={`/g/${gallery.slug}/works/${a.id}`} className="label">
        <span className="label-artist">{artist(a)}</span>
        <span className="label-meta">{medium(a)}, {size(a)}</span>
        <span className="label-row">
          <span className="label-price">{p ?? '—'}</span>
          <span className={`status s-${a.status}`}>{status(a.status)}</span>
        </span>
      </Link>
    </article>
  )
}
