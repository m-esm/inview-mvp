import { useEffect, useState } from 'react'
import { Link, useLoaderData, useParams } from 'react-router'
import OGallerySite from './OGallerySite'
import { artists, artworks, gallery, pastShows, show } from '../../data/gallery'
import { O_SLUG } from '../../lib/galleries'
import { seed, type GalleryPageData } from '../../lib/pilot'
import { normalizePhone } from '../../lib/store'

// The gallery's own public website. Served at roozgallery.inview.ir,
// or at /site/rooz-gallery on any host (useful before the domain is set up).
export default function Website() {
  const { slug } = useParams()
  // `/` has no slug, so it carries no pilot record and shows the demo website.
  const { pilot } = useLoaderData() as Partial<GalleryPageData>
  if (slug === O_SLUG) return <OGallerySite record={pilot ?? seed} />
  return <RoozWebsite />
}

function RoozWebsite() {
  const [phone, setPhone] = useState('')
  const [msg, setMsg] = useState('')
  const available = artworks.filter((a) => a.status !== 'sold')
  const cover = artworks[1]

  useEffect(() => {
    document.title = `${gallery.name}: ${show.title}`
    document.documentElement.lang = 'en'
    document.documentElement.dir = 'ltr'
  }, [])

  function follow(e: React.FormEvent) {
    e.preventDefault()
    setMsg(normalizePhone(phone) ? 'You’ll get an SMS invitation to the next opening.' : 'Enter a mobile number that starts with 09 and has 11 digits.')
  }

  const showLink = `/g/${gallery.slug}`
  return (
    <div className="site">
      <header className="site-top">
        <a href="#top" className="site-brand">{gallery.name.toUpperCase()}</a>
        <nav aria-label="Website">
          <a href="#current">Current show</a>
          <a href="#exhibitions">Exhibitions</a>
          <a href="#artists">Artists</a>
          <a href="#works">Available works</a>
          <a href="#visit">Visit</a>
        </nav>
      </header>

      <main id="top">
        <section className="site-hero" id="current">
          <div className="site-hero-text">
            <p className="muted">Now showing, {show.dates}</p>
            <h1>{show.title}</h1>
            <p className="site-kind">{show.kind}, {artists.length} artists</p>
            <p className="site-lead">{show.text}</p>
            <div className="row gap wrap">
              <Link className="btn btn-primary" to={`${showLink}/works`}>See the works</Link>
              <Link className="btn btn-outline" to={`${showLink}/prices`}>Price list</Link>
            </div>
          </div>
          <img src={cover.image} alt={cover.alt} className="site-hero-img" />
        </section>

        <form className="site-follow" onSubmit={follow}>
          <p><strong>Next opening:</strong> announced soon. Follow the gallery to get the invitation.</p>
          <div className="row gap wrap">
            <label htmlFor="site-phone" className="sr-only">Mobile number</label>
            <input id="site-phone" type="tel" inputMode="tel" dir="ltr" placeholder="0912 345 6789" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <button className="btn btn-primary" type="submit">Follow</button>
          </div>
          {msg && <p className="small" role="status">{msg}</p>}
        </form>

        <section className="site-section" id="exhibitions">
          <div className="row between wrap gap">
            <h2>Past exhibitions</h2>
            <p className="muted small">Added automatically when each show closes</p>
          </div>
          <div className="site-grid">
            {pastShows.map((p) => (
              <article key={p.title} className="site-card">
                <img src={p.image} alt="" />
                <h3>{p.title}</h3>
                <p className="muted small">{p.kind}, {p.date}</p>
                <span className="site-chip">Archived from the show’s QR page</span>
              </article>
            ))}
          </div>
        </section>

        <section className="site-section" id="artists">
          <h2>Artists</h2>
          <ul className="site-artists" role="list">
            {artists.map((name) => {
              const w = artworks.find((a) => a.artist === name)!
              return (
                <li key={name}><img src={w.image} alt="" /><span>{name}</span></li>
              )
            })}
          </ul>
        </section>

        <section className="site-section" id="works">
          <h2>Available works</h2>
          <div className="site-grid">
            {available.map((a) => (
              <Link key={a.id} to={`${showLink}/works/${a.id}`} className="site-card link">
                <img src={a.image} alt={a.alt} />
                <h3>{a.artist}</h3>
                <p className="muted small">{a.title ?? 'Untitled'}, {a.medium}, {a.size}</p>
                <p className="small"><strong>{a.price.toLocaleString('en-US')} Toman</strong>{a.status === 'reserved' ? ' (reserved)' : ''}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <footer className="site-foot" id="visit">
        <div>
          <p className="site-brand light">{gallery.name.toUpperCase()}</p>
          <p>{gallery.address}<br />{gallery.hours}<br />Instagram <a href={`https://instagram.com/${gallery.instagram}`}>@{gallery.instagram}</a></p>
        </div>
        <p className="site-made">{gallery.subdomain}.inview.ir · Website by Inview</p>
      </footer>
    </div>
  )
}
