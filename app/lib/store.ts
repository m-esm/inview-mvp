import { useSyncExternalStore } from 'react'

// Demo only: everything is kept in this browser. Nothing is sent anywhere.
export interface VisitorState {
  phone: string | null
  saved: string[]
  follows: string[]
  stamps: string[]
  lang: 'en' | 'fa'
  langChosen: boolean
}

const KEY = 'inview-demo-v1'

/** Stable default for SSR and first client paint. Do not mutate. */
const empty: VisitorState = {
  phone: null,
  saved: [],
  follows: [],
  stamps: [],
  lang: 'en',
  langChosen: false,
}

function load(): VisitorState {
  if (typeof window === 'undefined') return empty
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...empty, ...JSON.parse(raw) } : empty
  } catch {
    return empty
  }
}

let state: VisitorState = load()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return state
}

function getServerSnapshot(): VisitorState {
  return empty
}

function set(next: Partial<VisitorState>) {
  state = { ...state, ...next }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* private mode or storage full: keep working in memory */
  }
  listeners.forEach((l) => l())
}

export function useVisitor() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

export const visitor = {
  signIn: (phone: string) => set({ phone }),
  signOut: () => set({ phone: null }),
  toggleSaved: (id: string) => set({ saved: toggle(state.saved, id) }),
  save: (id: string) => !state.saved.includes(id) && set({ saved: [...state.saved, id] }),
  toggleFollow: (artist: string) => set({ follows: toggle(state.follows, artist) }),
  stamp: (slug: string) => !state.stamps.includes(slug) && set({ stamps: [...state.stamps, slug] }),
  setLang: (lang: 'en' | 'fa') => set({ lang, langChosen: true }),
  reset: () => set({ ...empty, lang: state.lang, langChosen: state.langChosen }),
}

// Iranian mobile numbers: 09xxxxxxxxx (also accepts Persian digits and +98)
export function normalizePhone(input: string): string | null {
  const latin = input.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[\s-]/g, '')
  const local = latin.startsWith('+98') ? '0' + latin.slice(3) : latin.startsWith('98') ? '0' + latin.slice(2) : latin
  return /^09\d{9}$/.test(local) ? local : null
}
