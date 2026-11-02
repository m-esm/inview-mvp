import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigation } from 'react-router'
import { SkipLink } from '../../components/SkipLink'
import { staffDictionaries } from '../../lib/i18n-staff'
import { gallery, report, show } from '../../data/gallery'

export default function GalleryLayout() {
  const { pathname } = useLocation()
  const busy = useNavigation().state !== 'idle'
  const page = pathname.endsWith('/website') ? 'Website and import' : pathname.endsWith('/plans') ? 'Plans' : null

  useEffect(() => {
    document.documentElement.lang = 'en'
    document.documentElement.dir = 'ltr'
  }, [])

  return (
    <div className="dash">
      <SkipLink label={staffDictionaries.en.skipToContent} />
      <aside className="side" aria-label="Gallery">
        <p className="brand">Inview <span>for galleries</span></p>
        <p className="demo-flag" role="note"><strong>Demo</strong> Sample gallery with illustrative numbers. It is not O Gallery data.</p>
        <div className="side-gallery">
          <span className="avatar sq">RG</span>
          <span>
            <strong>{gallery.name}</strong>
            <span className="muted small">Demo plan</span>
          </span>
        </div>
        <nav aria-label="Dashboard">
          <NavLink to="/dashboard" end>Show report</NavLink>
          <NavLink to="/dashboard/artworks">Artworks</NavLink>
          <NavLink to="/dashboard/audience">Audience and leads</NavLink>
          <NavLink to="/dashboard/website">Website and import</NavLink>
          <NavLink to="/dashboard/plans">Plans</NavLink>
        </nav>
      </aside>
      <main id="main" tabIndex={-1} className="dash-main" aria-busy={busy || undefined}>
        <header className="dash-head">
          {page ? (
            <div>
              <p className="muted small">{gallery.name}</p>
              <h1>{page}</h1>
            </div>
          ) : (
            <>
              <div>
                <p className="muted small">{show.kind}, {show.dates}. Day {report.dayOf} of {report.days}</p>
                <h1>{show.title}</h1>
              </div>
              <span className="pill good">{report.vsLastShow} scans vs your last show</span>
            </>
          )}
        </header>
        <Outlet />
      </main>
    </div>
  )
}
