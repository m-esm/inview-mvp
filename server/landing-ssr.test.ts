import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createRoutesStub, Outlet } from 'react-router'
import './test-render.ts'
import Home, { loader, meta } from '../app/routes/home.tsx'
import { defaultLang, dirFor, resolveLang } from '../app/lib/lang.ts'
import { gallery } from '../app/data/gallery.ts'
import InviewLanding, { landingCopy } from '../app/pages/site/InviewLanding.tsx'
import { landingContact } from '../app/lib/landing-contact.ts'

function renderHome(url: string, cookie?: string, contact?: typeof landingContact) {
  const request = new Request(url, { headers: cookie ? { cookie } : {} })
  const data = loader({ request })
  assert.ok(!(data instanceof Response))
  const lang = resolveLang(new URL(url).pathname, request.headers.get('cookie'))
  const Stub = createRoutesStub([{
    id: 'root',
    path: '/',
    Component: () => createElement('html', { lang, dir: dirFor(lang) }, createElement('body', null, createElement(Outlet))),
    children: [{ id: 'home', index: true, Component: contact ? () => createElement(InviewLanding, { contact }) : Home }],
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
  assert.ok(html.includes(landingCopy.fa.hero))
  assert.match(html, /href="\/g\/sample"/)
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

test('default landing contact shows no unverified contact link', () => {
  const { html } = renderHome('https://inview.test/')
  assert.doesNotMatch(html, /tel:|wa\.me|t\.me|mailto:|000/)
  assert.ok(html.includes(landingCopy.fa.comingSoon))
  assert.doesNotMatch(html, /href="#contact"/)
})

test('empty contact channels show the localized coming-soon line', () => {
  const contact = { phone: '', whatsappUrl: '', telegramUrl: '', email: '' }
  for (const lang of ['fa', 'en'] as const) {
    const { html } = renderHome('https://inview.test/', `inview-lang=${lang}`, contact)
    assert.ok(html.includes(landingCopy[lang].comingSoon))
    assert.doesNotMatch(html, /tel:|wa\.me|t\.me|mailto:/)
    assert.ok(!html.includes(landingCopy[lang].contact))
  }
})

test('each configured contact channel can be the primary action', () => {
  const empty = { phone: '', whatsappUrl: '', telegramUrl: '', email: '' }
  for (const [key, value, href] of [
    ['whatsappUrl', 'https://wa.me/358401234567', 'https://wa.me/358401234567'],
    ['telegramUrl', 'https://t.me/example_gallery', 'https://t.me/example_gallery'],
    ['email', 'hello@inview.test', 'mailto:hello@inview.test'],
    ['phone', '+358 40 1234567', 'tel:+358401234567'],
  ]) {
    const { html } = renderHome('https://inview.test/', undefined, { ...empty, [key]: value })
    assert.ok(html.includes(`class="btn btn-primary${key === 'phone' ? ' landing-phone-link' : ''}" href="${href}"`))
    assert.ok(!html.includes(landingCopy.fa.comingSoon))
    assert.ok(html.includes(`<a class="btn btn-outline" href="#contact">${landingCopy.fa.contact}</a>`))
    if (key === 'phone') assert.match(html, /<bdi dir="ltr">\+۳۵۸ ۴۰ ۱۲۳۴۵۶۷<\/bdi>/)
  }
})

test('pilot labels and the screenshot region are localized with an English-only Persian UI note', () => {
  for (const lang of ['fa', 'en'] as const) {
    const { html } = renderHome('https://inview.test/', `inview-lang=${lang}`)
    const words = landingCopy[lang]
    assert.equal(html.split(words.pilot).length - 1, 1)
    assert.ok(html.includes(`tabindex="0" role="region" aria-label="${words.screensLabel}"`))
    assert.equal(html.includes(landingCopy.en.persianDemo), lang === 'en')
    assert.ok(!html.includes(landingCopy.fa.persianDemo))
  }
})

test('header and footer offer full language labels and the hero shows work details', () => {
  const { html } = renderHome('https://inview.test/')
  assert.equal(html.split('lang="fa">فارسی</button>').length - 1, 2)
  assert.equal(html.split('lang="en">English</button>').length - 1, 2)
  assert.match(html, /class="landing-phone"><picture><source srcSet="\/landing\/work.webp"/)
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
