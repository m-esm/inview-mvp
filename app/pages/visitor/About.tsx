import { useEffect } from 'react'
import { useLoaderData, useLocation, useParams } from 'react-router'
import { OAbout } from './OGalleryPages'
import { artworks, artists, gallery } from '../../data/gallery'
import { useT } from '../../lib/i18n'
import { isDatabaseGallery } from '../../lib/galleries'
import { seed, type GalleryPageData } from '../../lib/pilot'
import { useVisitor, visitor } from '../../lib/store'
import { useSignIn } from '../../components/VisitorShell'

export default function About() {
  const { slug } = useParams()
  const { pilot } = useLoaderData() as GalleryPageData
  if (isDatabaseGallery(slug)) return <OAbout record={pilot ?? seed} />
  return <RoozAbout />
}

function RoozAbout() {
  const { t, n, showText, artist } = useT()
  const { follows } = useVisitor()
  const { requireSignIn } = useSignIn()
  const { hash } = useLocation()

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [hash])

  return (
    <div className="pad about">
      <section id="artists">
        <h1 className="page-title">{t.aboutArtists}</h1>
        <ul className="artists" role="list">
          {artists.map((name) => {
            const works = artworks.filter((a) => a.artist === name)
            const on = follows.includes(name)
            return (
              <li key={name}>
                <img src={works[0].image} alt="" />
                <span className="artist-text">
                  <strong>{artist(works[0])}</strong>
                  <span className="muted small">{n(works.length)} {t.artworks.toLowerCase()}</span>
                </span>
                <button className={`btn small-btn ${on ? 'btn-quiet' : 'btn-outline'}`}
                  onClick={() => (on ? visitor.toggleFollow(name) : requireSignIn('follow', () => visitor.toggleFollow(name), name))}>
                  {on ? t.following : t.follow}
                </button>
              </li>
            )
          })}
        </ul>
      </section>
      <section id="text">
        <h2 className="section-title">{t.aboutText}</h2>
        <p className="reading">{showText}</p>
      </section>
      <section id="visit">
        <h2 className="section-title">{t.visit}</h2>
        <p>{t.address}</p>
        <p>{t.hours}</p>
        <p><a href={`https://instagram.com/${gallery.instagram}`}>@{gallery.instagram}</a></p>
        <a className="btn btn-outline" href={`tel:${gallery.phone.replace(/\s/g, '')}`}>{t.call}</a>
      </section>
    </div>
  )
}
