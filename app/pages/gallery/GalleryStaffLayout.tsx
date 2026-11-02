import { Link, useNavigation } from 'react-router'
import { SkipLink } from '../../components/SkipLink'
import { StaffLangSwitch } from '../../components/StaffLangSwitch'
import { useStaffT } from '../../lib/i18n-staff'

export function GalleryStaffLayout({ children, gallery, permissions = [], titleKey = 'pageTitle' }: { children: React.ReactNode; gallery: { slug: string; nameEn: string; nameFa: string }; permissions?: string[]; titleKey?: 'pageTitle' | 'team' | 'createQr' | null }) {
  const { t, lang, dir } = useStaffT()
  const busy = useNavigation().state !== 'idle'
  return (
    <div className={`staff staff-${lang}`} dir={dir}>
      <SkipLink label={t.skipToContent} />
      <header className="staff-bar">
        <div className="staff-id">
          <p className="brand">{t.brand} <span>{t.brandSub}</span></p>
          <span className="staff-gallery">
            <strong>{lang === 'fa' ? gallery.nameFa || gallery.nameEn : gallery.nameEn}</strong>
          </span>
        </div>
        <nav className="staff-nav" aria-label={t.staffNav}>
          <Link to="/staff">{t.galleries}</Link>
          <Link to={`/staff/${gallery.slug}/report`}>{t.navReport}</Link>
          {permissions.includes('edit-catalogue') && <Link to={`/staff/${gallery.slug}`}>{t.navEditor}</Link>}
          {permissions.includes('manage-staff') && <Link to={`/staff/${gallery.slug}/team`}>{t.team}</Link>}
          {permissions.includes('create-qr') && <Link to={`/staff/${gallery.slug}/qr`}>{t.createQr}</Link>}
          <Link to={`/staff/${gallery.slug}/preview`}>{t.preview}</Link>
          <Link to={`/g/${gallery.slug}`} target="_blank" rel="noopener">{t.viewLive}</Link>
        </nav>
        <div className="staff-tools">
          <StaffLangSwitch />
          <form method="post" action="/staff/sign-out">
            <button className="btn btn-outline small-btn" type="submit">{t.signOut}</button>
          </form>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="staff-main" aria-busy={busy || undefined}>
        {titleKey && <header className="dash-head">
          <div>
            <p className="muted small">{t.pageEyebrow}</p>
            <h1>{t[titleKey]}</h1>
          </div>
        </header>}
        {children}
      </main>
    </div>
  )
}
