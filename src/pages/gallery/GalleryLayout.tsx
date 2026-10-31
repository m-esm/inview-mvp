import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { gallery, report, show } from '../../data/gallery'

const KEY = 'inview-dashboard-unlocked'

export default function GalleryLayout() {
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem(KEY) === '1' } catch { return false }
  })
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const { pathname } = useLocation()
  const oGalleryPage = pathname.endsWith('/o-gallery')
  const page = pathname.endsWith('/website') ? 'Website and import' : pathname.endsWith('/plans') ? 'Plans' : oGalleryPage ? 'O Gallery landing page' : null

  useEffect(() => {
    document.documentElement.lang = 'en'
    document.documentElement.dir = 'ltr'
  }, [])

  if (!unlocked) {
    return (
      <div className="gate">
        <form className="gate-card" onSubmit={(e) => {
          e.preventDefault()
          if (pw.trim() === gallery.dashboardPassword) {
            try { sessionStorage.setItem(KEY, '1') } catch { /* ignore */ }
            setUnlocked(true)
          } else setError('That password doesn’t match. Check it and try again.')
        }}>
          <p className="brand">Inview <span>for galleries</span></p>
          <h1>{gallery.name}</h1>
          <label htmlFor="pw">Dashboard password</label>
          <input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus aria-describedby="pw-msg" />
          <p id="pw-msg" className={error ? 'error' : 'muted small'}>{error || 'Demo password: inview'}</p>
          <button className="btn btn-primary" type="submit">Open dashboard</button>
        </form>
      </div>
    )
  }

  return (
    <div className="dash">
      <aside className="side">
        <p className="brand">Inview <span>for galleries</span></p>
        <div className="side-gallery"><span className="avatar sq">RG</span><span><strong>{gallery.name}</strong><span className="muted small">Growth plan</span></span></div>
        <nav aria-label="Dashboard">
          <NavLink to="/dashboard" end>Show report</NavLink>
          <NavLink to="/dashboard/o-gallery">O Gallery</NavLink>
          <NavLink to="/dashboard/artworks">Artworks</NavLink>
          <NavLink to="/dashboard/audience">Audience and leads</NavLink>
          <NavLink to="/dashboard/website">Website and import</NavLink>
          <NavLink to="/dashboard/plans">Plans</NavLink>
        </nav>
        <p className="muted tiny side-note">Demo with illustrative numbers.</p>
      </aside>
      <main className="dash-main">
        <header className="dash-head">
          {page ? (
            <div><p className="muted small">{oGalleryPage ? 'O Gallery' : gallery.name}</p><h1>{page}</h1></div>
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
