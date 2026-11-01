import { O_SLUG } from '../../lib/galleries'
import { Link } from 'react-router'
import { StaffLangSwitch } from '../../components/StaffLangSwitch'
import { useStaffT } from '../../lib/i18n-staff'

export function OGalleryStaffLayout({ children }: { children: React.ReactNode }) {
  const { t, lang, dir } = useStaffT()
  return (
    <div className={`staff staff-${lang}`} dir={dir}>
      <header className="staff-bar">
        <div className="staff-id">
          <p className="brand">{t.brand} <span>{t.brandSub}</span></p>
          <span className="staff-gallery">
            <span className="avatar sq" aria-hidden>اُ</span>
            <strong>{t.galleryName}</strong>
          </span>
        </div>
        <nav className="staff-nav" aria-label={t.staffNav}>
          <a href="#report">{t.navReport}</a>
          <a href="#catalogue">{t.navEditor}</a>
          <Link to={`/g/${O_SLUG}`} target="_blank" rel="noopener">{t.viewLive}</Link>
        </nav>
        <div className="staff-tools">
          <StaffLangSwitch />
          <form method="post" action="/dashboard/sign-out">
            <button className="btn btn-outline small-btn" type="submit">{t.signOut}</button>
          </form>
        </div>
      </header>
      <main className="staff-main">
        <header className="dash-head">
          <div>
            <p className="muted small">{t.pageEyebrow}</p>
            <h1>{t.pageTitle}</h1>
          </div>
        </header>
        {children}
      </main>
    </div>
  )
}
