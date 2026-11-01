import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createRoutesStub, Outlet } from 'react-router'
import './test-render.ts'
import Home, { loader, meta } from '../app/routes/home.tsx'
import { defaultLang, dirFor, resolveLang } from '../app/lib/lang.ts'
import { gallery } from '../app/data/gallery.ts'

function renderHome(url: string, cookie?: string) {
  const request = new Request(url, { headers: cookie ? { cookie } : {} })
  const data = loader({ request })
  assert.ok(!(data instanceof Response))
  const lang = resolveLang(new URL(url).pathname, request.headers.get('cookie'))
  const Stub = createRoutesStub([{
    id: 'root',
    path: '/',
    Component: () => createElement('html', { lang, dir: dirFor(lang) }, createElement('body', null, createElement(Outlet))),
    children: [{ id: 'home', index: true, Component: Home }],
  }])
  const html = renderToString(createElement(Stub, {
    initialEntries: ['/'],
    hydrationData: { loaderData: { root: { lang, dir: dirFor(lang) }, home: data } },
  }))
  return { html, data }
}

test('root server-renders the Inview landing in Persian without a redirect', () => {
  const { html, data } = renderHome('https://inview.test/')
  assert.equal(data.isGallerySite, false)
  assert.match(html, /<html lang="fa" dir="rtl"/)
  assert.match(html, /آثار گالری شما، در دست بازدیدکننده/)
  assert.match(html, /href="\/g\/o-gallery"/)
  assert.match(html, /href="\/dashboard\/sign-in"/)
  assert.match(html, /اطلاعات تماس، با رضایت/)
  assert.equal(defaultLang('/unrelated'), 'en')
  assert.equal(defaultLang('/g/rooz-gallery'), 'en')
})

test('the language cookie server-renders the root landing in English', () => {
  const { html } = renderHome('https://inview.test/', 'inview-lang=en')
  assert.match(html, /<html lang="en" dir="ltr"/)
  assert.match(html, /Your gallery, in your visitor/)
  assert.match(html, /Contact details, with consent/)
  assert.doesNotMatch(html, /آثار گالری شما/)
})

test('the gallery subdomain keeps its gallery website', () => {
  const { html, data } = renderHome(`https://${gallery.subdomain}.inview.ir/`)
  assert.equal(data.isGallerySite, true)
  assert.match(html, /class="site"/)
  assert.doesNotMatch(html, /class="landing/)
  assert.equal(loader({ request: new Request('https://other.inview.ir/') }).isGallerySite, false)
})

test('landing metadata uses the root public origin and language', () => {
  for (const lang of ['fa', 'en'] as const) {
    const tags = meta({
      data: { isGallerySite: false },
      matches: [{ id: 'root', data: { lang, origin: 'https://inview.example' } }],
    } as Parameters<typeof meta>[0])
    assert.ok(tags.some((tag) => 'rel' in tag && tag.rel === 'canonical' && tag.href === 'https://inview.example/'))
    assert.ok(tags.some((tag) => 'property' in tag && tag.property === 'og:image' && tag.content === 'https://inview.example/landing/share.png'))
    assert.ok(tags.some((tag) => 'name' in tag && tag.name === 'twitter:card' && tag.content === 'summary_large_image'))
    assert.ok(tags.some((tag) => 'title' in tag && String(tag.title).includes(lang === 'fa' ? 'اینویو' : 'Inview')))
  }
})
