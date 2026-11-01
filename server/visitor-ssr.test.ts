import test from 'node:test'
import assert from 'node:assert/strict'
import * as React from 'react'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createRoutesStub, Outlet } from 'react-router'
import type { PilotRecord } from '../app/lib/pilot.ts'
import { useVisitor } from '../app/lib/store.ts'

// tsx loads app JSX with the classic runtime; expose React for those modules.
;(globalThis as unknown as { React: typeof React }).React = React

// The router stub renders a client router, so React warns about its layout effects.
const reactError = console.error
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return
  reactError(...args)
}

function record(patch: Partial<PilotRecord> = {}): PilotRecord {
  return {
    slug: 'o-gallery',
    name: 'O Gallery',
    nameFa: 'گالری اُ',
    logo: null,
    showTitle: 'Quiet Surfaces',
    showTitleFa: 'سطح‌های آرام',
    dates: '',
    datesFa: '',
    hours: '',
    hoursFa: '',
    address: '',
    addressFa: '',
    text: '',
    textFa: '',
    pdfUrl: null,
    works: [
      {
        id: 'ssrwork01',
        artist: 'N. Karimi',
        title: 'Harbour light',
        medium: 'Oil',
        size: '40 x 50',
        year: '2024',
        price: 1000000,
        status: 'available',
        image: '',
        sample: false,
      },
    ],
    ...patch,
  }
}

/**
 * Renders a visitor route the way the server does: the language comes from the root
 * loader and the catalogue comes from the route loader.
 */
async function renderRoute(location: string, pilot: PilotRecord | null, lang: 'en' | 'fa') {
  const { VisitorShell } = await import('../app/components/VisitorShell.tsx')
  const Welcome = (await import('../app/pages/visitor/Welcome.tsx')).default
  const Works = (await import('../app/pages/visitor/Works.tsx')).default
  const Work = (await import('../app/pages/visitor/Work.tsx')).default

  const Stub = createRoutesStub([
    {
      id: 'root',
      path: '/',
      Component: () => createElement(Outlet),
      children: [
        {
          id: 'routes/g',
          path: 'g/:slug',
          Component: VisitorShell,
          children: [
            { id: 'welcome', index: true, Component: Welcome },
            { id: 'works', path: 'works', Component: Works },
            { id: 'work', path: 'works/:id', Component: Work },
          ],
        },
      ],
    },
  ])

  const page = { pilot, work: pilot?.works[0] ?? null }
  return renderToString(
    createElement(Stub, {
      initialEntries: [location],
      hydrationData: {
        loaderData: {
          root: { lang, dir: lang === 'fa' ? 'rtl' : 'ltr' },
          'routes/g': page,
          welcome: page,
          works: page,
          work: page,
        },
      },
    }),
  )
}

test('useVisitor server-renders with the stable default visitor state', () => {
  function Probe() {
    const { phone, saved, follows, stamps } = useVisitor()
    return createElement('div', {
      'data-phone': phone ?? '',
      'data-saved': String(saved.length),
      'data-follows': String(follows.length),
      'data-stamps': String(stamps.length),
    })
  }

  const html = renderToString(createElement(Probe))
  assert.match(html, /data-phone=""/)
  assert.match(html, /data-saved="0"/)
  assert.match(html, /data-follows="0"/)
  assert.match(html, /data-stamps="0"/)
})

test('the landing page server-renders the show title from the loader', async () => {
  const html = await renderRoute('/g/o-gallery', record(), 'en')
  assert.match(html, /Quiet Surfaces/)
  assert.match(html, /O Gallery/)
})

test('the works page server-renders the work titles from the loader', async () => {
  const html = await renderRoute('/g/o-gallery/works', record(), 'fa')
  assert.match(html, /Harbour light/)
  assert.match(html, /N. Karimi/)
})

test('a work page server-renders the work the loader resolved', async () => {
  const html = await renderRoute('/g/o-gallery/works/ssrwork01', record(), 'fa')
  assert.match(html, /Harbour light/)
  assert.match(html, /موجود/)
})

test('an unreadable catalogue server-renders the empty notice, not stale works', async () => {
  const html = await renderRoute('/g/o-gallery/works', null, 'fa')
  assert.doesNotMatch(html, /Harbour light/)
  assert.match(html, /فهرست آثار هنوز بارگذاری نشده است/)
})

test('the root language decides the visitor copy', async () => {
  const persian = await renderRoute('/g/o-gallery', record(), 'fa')
  assert.match(persian, /دیدن آثار/)
  const english = await renderRoute('/g/o-gallery', record(), 'en')
  assert.match(english, /See the works/)
})

test('the sign-in sheet starts with an empty consent box in Persian and English', async () => {
  const { SignInSheet } = await import('../app/components/SignInSheet.tsx')
  const props = {
    kind: 'save' as const,
    workId: 'samplework1',
    onDone: () => {},
    onClose: () => {},
  }
  const sheet = (lang: 'en' | 'fa') => {
    const Stub = createRoutesStub([
      { id: 'root', path: '/', Component: () => createElement(SignInSheet, props) },
    ])
    return renderToString(
      createElement(Stub, {
        initialEntries: ['/'],
        hydrationData: { loaderData: { root: { lang, dir: lang === 'fa' ? 'rtl' : 'ltr' } } },
      }),
    )
  }
  const fa = sheet('fa')
  const en = sheet('en')
  for (const html of [fa, en]) {
    assert.match(html, /type="checkbox"/)
    assert.doesNotMatch(html, /checked/)
  }
  assert.match(fa, /اگر اثری را ذخیره کنید/)
  assert.match(fa, /موافقم که این گالری/)
  assert.match(en, /Save sends your mobile number/)
  assert.match(en, /I agree/)
})
