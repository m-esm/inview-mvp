import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigation, useRouteLoaderData } from 'react-router'
import { gallery } from '../data/gallery'
import { useT } from '../lib/i18n'
import { CONSENT_TEXT_VERSION } from '../lib/consent'
import { isDatabaseGallery } from '../lib/galleries'
import { gallerySlugFromPath, oCopy, pick, recordLandingScan, seed, type GalleryPageData } from '../lib/pilot'
import { useVisitor } from '../lib/store'
import { LangSwitch } from './LangSwitch'
import { SignInSheet, type SheetKind } from './SignInSheet'
import { SkipLink } from './SkipLink'
import { Calendar, Grid, Home, User } from './Icons'

interface Ctx {
  requireSignIn: (kind: SheetKind, action: () => void, subtitle?: string, workId?: string) => void
}
const SignInCtx = createContext<Ctx>({ requireSignIn: (_k, a) => a() })
export const useSignIn = () => useContext(SignInCtx)

export function VisitorShell() {
  const { t, lang, dir, galleryName } = useT()
  const { phone, consentVersion } = useVisitor()
  const [pending, setPending] = useState<{ kind: SheetKind; action: () => void; subtitle?: string; workId?: string } | null>(null)
  const { pathname } = useLocation()
  const busy = useNavigation().state !== 'idle'

  // A language switch revalidates instead of reloading, so keep the document in step.
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const requireSignIn = useCallback<Ctx['requireSignIn']>((kind, action, subtitle, workId) => {
    if (phone && consentVersion === CONSENT_TEXT_VERSION) action()
    else setPending({ kind, action, subtitle, workId })
  }, [phone, consentVersion])

  const slug = gallerySlugFromPath(pathname) ?? ''
  const isDb = isDatabaseGallery(slug)
  const layoutData = useRouteLoaderData('routes/g') as GalleryPageData | undefined
  const record = layoutData?.pilot ?? seed
  const oName = pick(lang, record.name, record.nameFa)
  const base = isDb ? `/g/${slug}` : `/g/${gallery.slug}`
  const brand = isDb ? oName : galleryName
  const demo = isDb && Boolean(layoutData?.pilot?.demo)
  const demoCopy = oCopy(lang)
  const isPrices = pathname === `${base}/prices`
  const navItems = [
    { to: base, label: t.galleryNav, icon: <Home />, end: true },
    { to: `${base}/works`, label: t.artworks, icon: <Grid />, end: false },
    { to: `${base}/prices`, label: t.priceList, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M3 6h1M3 12h1M3 18h1" /></svg>, end: false },
    { to: `${base}/about`, label: t.visitNav, icon: <Calendar />, end: false },
    { to: '/me', label: t.profile, icon: <User />, end: true },
  ]

  useEffect(() => {
    if (isDb && pathname === `/g/${slug}`) recordLandingScan(slug, new URLSearchParams(window.location.search).get('q'))
  }, [isDb, pathname, slug])

  return (
    <SignInCtx.Provider value={{ requireSignIn }}>
      <div className="visitor-stage">
        <div className={`visitor ${lang === 'fa' ? 'fa' : ''}`} dir={dir}>
          <SkipLink label={t.skipToContent} />
          <header className="v-top">
            <div className="v-brand-stack">
              {isDb ? (
                <Link to={`/site/${slug}`} className="v-gallery" title={brand}>
                  {record.logo && !(demo && isPrices) ? <img className="v-logo" src={record.logo} alt={oName} /> : brand}
                </Link>
              ) : (
                <Link to={base} className="v-gallery" title={brand}>{brand}</Link>
              )}
              <span className="ink-rule" aria-hidden />
              {demo && !isPrices && <span className="demo-badge" title={demoCopy.demoNote}>{demoCopy.demoLabel}</span>}
            </div>
            <LangSwitch />
          </header>
          <nav className="v-desktop-nav" aria-label={t.visitorNav}>
            {navItems.map((item) => <NavLink key={item.to} to={item.to} end={item.end}>{item.label}</NavLink>)}
          </nav>
          {demo && !isPrices && <p className="demo-banner" role="note">{demoCopy.demoNote}</p>}
          <main id="main" tabIndex={-1} className="v-main" aria-busy={busy || undefined}><Outlet /></main>
          <nav className="v-tabs" aria-label={t.visitorNav}>
            {navItems.map((item) => <NavLink key={item.to} to={item.to} end={item.end}>{item.icon}<span>{item.label}</span></NavLink>)}
          </nav>
          {pending && (
            <SignInSheet kind={pending.kind} subtitle={pending.subtitle} workId={pending.workId}
              onClose={() => setPending(null)}
              onDone={() => { pending.action(); setPending(null) }} />
          )}
        </div>
      </div>
    </SignInCtx.Provider>
  )
}
