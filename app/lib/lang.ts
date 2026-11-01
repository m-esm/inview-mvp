import { O_SLUG } from './galleries'
export type Lang = 'en' | 'fa'
export type Dir = 'rtl' | 'ltr'

export const LANG_COOKIE = 'inview-lang'
const ONE_YEAR = 60 * 60 * 24 * 365

const PERSIAN_FIRST = [`/g/${O_SLUG}`, `/site/${O_SLUG}`, '/ops', '/staff']
const BILINGUAL_STAFF = ['/ops', '/staff']

function underPath(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

export function isStaffPath(pathname: string): boolean {
  return underPath(pathname, '/dashboard') || underPath(pathname, '/staff')
}

export function defaultLang(pathname: string): Lang {
  return pathname === '/' || PERSIAN_FIRST.some((base) => underPath(pathname, base)) ? 'fa' : 'en'
}

export function readLangCookie(header: string | null | undefined): Lang | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name !== LANG_COOKIE) continue
    const value = rest.join('=')
    if (value === 'en' || value === 'fa') return value
  }
  return null
}

export function isBilingualStaffPath(pathname: string): boolean {
  return BILINGUAL_STAFF.some((base) => underPath(pathname, base))
}

/** The Rooz demo dashboard has English labels only, so the cookie does not apply there. */
export function resolveLang(pathname: string, cookieHeader: string | null | undefined): Lang {
  if (isStaffPath(pathname) && !isBilingualStaffPath(pathname)) return 'en'
  return readLangCookie(cookieHeader) ?? defaultLang(pathname)
}

export function dirFor(lang: Lang): Dir {
  return lang === 'fa' ? 'rtl' : 'ltr'
}

export function langCookie(lang: Lang): string {
  return `${LANG_COOKIE}=${lang}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax`
}
