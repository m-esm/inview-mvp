import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useRevalidator, useRouteLoaderData } from 'react-router'
import { gallery } from '../data/gallery'
import { useT } from '../lib/i18n'
import { CONSENT_TEXT_VERSION } from '../lib/consent'
import { O_SLUG } from '../lib/galleries'
import { langCookie, type Lang } from '../lib/lang'
import { pick, recordLandingScan, seed, type GalleryPageData } from '../lib/pilot'
import { useVisitor } from '../lib/store'
import { SignInSheet, type SheetKind } from './SignInSheet'
import { Grid, Home, User } from './Icons'

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
  const revalidator = useRevalidator()

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

  const chooseLang = useCallback((next: Lang) => {
    if (next === lang) return
    document.cookie = langCookie(next)
    void revalidator.revalidate()
  }, [lang, revalidator])

  const slug = pathname.match(/^\/g\/([^/]+)/)?.[1] ?? ''
  const isO = slug === O_SLUG
  const layoutData = useRouteLoaderData('routes/g') as GalleryPageData | undefined
  const record = layoutData?.pilot ?? seed
  const oName = pick(lang, record.name, record.nameFa)
  const base = isO ? '/g/o-gallery' : `/g/${gallery.slug}`
  const brand = isO ? oName : galleryName

  useEffect(() => {
    if (pathname === '/g/o-gallery') recordLandingScan(new URLSearchParams(window.location.search).get('q'))
  }, [pathname])

  return (
    <SignInCtx.Provider value={{ requireSignIn }}>
      <div className="visitor-stage">
        <div className={`visitor ${lang === 'fa' ? 'fa' : ''}`} dir={dir}>
          <header className="v-top">
            <div className="v-brand-stack">
              {isO ? (
                <Link to="/site/o-gallery" className="v-gallery v-wordmark" title={brand}>
                  {record.logo ? <img className="v-logo" src={record.logo} alt={oName} /> : brand}
                </Link>
              ) : (
                <Link to={base} className="v-gallery" title={brand}>{brand}</Link>
              )}
              <span className="ink-rule" aria-hidden />
            </div>
            <div className="lang" role="group" aria-label="Language">
              <button type="button" aria-pressed={lang === 'en'} onClick={() => chooseLang('en')}>EN</button>
              <button type="button" aria-pressed={lang === 'fa'} onClick={() => chooseLang('fa')} className="fa-btn">فا</button>
            </div>
          </header>
          <nav className="v-desktop-nav" aria-label="Visitor">
            <NavLink to={base} end>{isO ? brand : galleryName}</NavLink>
            <NavLink to={`${base}/works`}>{t.artworks}</NavLink>
            <NavLink to={`${base}/prices`}>{t.priceList}</NavLink>
            {!isO && <NavLink to="/me">{t.profile}</NavLink>}
            {isO && <NavLink to={`${base}/about`}>{t.visit}</NavLink>}
          </nav>
          <main className="v-main"><Outlet /></main>
          <nav className={`v-tabs${isO ? ' tabs-2' : ''}`} aria-label="Visitor">
            <NavLink to={base} end><Home /><span>{isO ? brand : galleryName}</span></NavLink>
            <NavLink to={`${base}/works`}><Grid /><span>{t.artworks}</span></NavLink>
            {!isO && <NavLink to="/me"><User /><span>{t.profile}</span></NavLink>}
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
