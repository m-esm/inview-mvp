import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { gallery } from '../data/gallery'
import { useT } from '../lib/i18n'
import { pick, recordLandingScan, usePilotRecord } from '../lib/pilot'
import { visitor, useVisitor } from '../lib/store'
import { SignInSheet, type SheetKind } from './SignInSheet'
import { Grid, Home, User } from './Icons'

interface Ctx {
  requireSignIn: (kind: SheetKind, action: () => void, subtitle?: string) => void
}
const SignInCtx = createContext<Ctx>({ requireSignIn: (_k, a) => a() })
export const useSignIn = () => useContext(SignInCtx)

export function VisitorShell() {
  const { t, lang, dir, galleryName } = useT()
  const { phone } = useVisitor()
  const [pending, setPending] = useState<{ kind: SheetKind; action: () => void; subtitle?: string } | null>(null)
  const { pathname } = useLocation()

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])
  useEffect(() => window.scrollTo(0, 0), [pathname])

  const requireSignIn = useCallback<Ctx['requireSignIn']>((kind, action, subtitle) => {
    if (phone) action()
    else setPending({ kind, action, subtitle })
  }, [phone])

  const slug = pathname.match(/^\/g\/([^/]+)/)?.[1] ?? ''
  const isO = slug === 'o-gallery'
  const { record } = usePilotRecord(isO)
  const oName = pick(lang, record.name, record.nameFa)
  const base = isO ? '/g/o-gallery' : `/g/${gallery.slug}`

  useEffect(() => {
    if (pathname === '/g/o-gallery') recordLandingScan()
  }, [pathname])

  return (
    <SignInCtx.Provider value={{ requireSignIn }}>
      <div className={`visitor ${lang === 'fa' ? 'fa' : ''}`} dir={dir}>
        <header className="v-top">
          {isO ? (
            <Link to="/site/o-gallery" className="v-gallery v-wordmark">
              {record.logo ? <img className="v-logo" src={record.logo} alt={oName} /> : oName}
            </Link>
          ) : (
            <Link to={base} className="v-gallery">{galleryName}</Link>
          )}
          <div className="lang" role="group" aria-label="Language">
            <button aria-pressed={lang === 'en'} onClick={() => visitor.setLang('en')}>EN</button>
            <button aria-pressed={lang === 'fa'} onClick={() => visitor.setLang('fa')} className="fa-btn">فا</button>
          </div>
        </header>
        <main className="v-main"><Outlet /></main>
        <nav className={`v-tabs${isO ? ' tabs-2' : ''}`} aria-label="Visitor">
          <NavLink to={base} end><Home /><span>{isO ? oName : galleryName}</span></NavLink>
          <NavLink to={`${base}/works`}><Grid /><span>{t.artworks}</span></NavLink>
          {!isO && <NavLink to="/me"><User /><span>{t.profile}</span></NavLink>}
        </nav>
        {pending && (
          <SignInSheet kind={pending.kind} subtitle={pending.subtitle}
            onClose={() => setPending(null)}
            onDone={() => { pending.action(); setPending(null) }} />
        )}
      </div>
    </SignInCtx.Provider>
  )
}
