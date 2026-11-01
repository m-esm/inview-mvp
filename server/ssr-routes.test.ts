import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
delete process.env.O_GALLERY_ACCESS_CODE

import { DatabaseContext } from '../database/context.ts'
import { PUBLIC_PAGE_HEADERS } from '../app/lib/cache.ts'
import { defaultLang, langCookie, readLangCookie, resolveLang } from '../app/lib/lang.ts'
import { loadGalleryPage, loadWorkPage } from '../app/routes/pilot.server.ts'
import { publishGalleryRecord } from './gallery-record.ts'
import { createTestDb } from './test-db.ts'

const WORK = {
  id: 'ssrwork01',
  title: 'Harbour light',
  artist: 'N. Karimi',
  medium: 'Oil',
  size: '40 x 50',
  year: '2024',
  price: 1000000,
  status: 'available',
  image: '',
  sample: false,
}

async function withCatalogue(
  fn: (run: <T>(task: () => Promise<T>) => Promise<T>) => Promise<void>,
) {
  const testDb = await createTestDb()
  const run = <T>(task: () => Promise<T>) => DatabaseContext.run(testDb.db, task)
  try {
    const published = await publishGalleryRecord(testDb.db, testDb.storage, 'inview', {
      name: 'O Gallery',
      nameFa: 'گالری اُ',
      showTitle: 'Quiet Surfaces',
      works: [WORK],
    })
    assert.equal(published.status, 200, JSON.stringify(published.body))
    await fn(run)
  } finally {
    await testDb.close()
  }
}

function pageRequest(path: string) {
  return new Request(`http://inview.test${path}`)
}

async function rejection(task: Promise<unknown>): Promise<Response> {
  try {
    await task
  } catch (thrown) {
    assert.ok(thrown instanceof Response, `expected a Response, got ${String(thrown)}`)
    return thrown
  }
  throw new Error('The loader resolved instead of answering with a status.')
}

test('the language comes from the cookie, then from the path', () => {
  assert.equal(defaultLang('/g/o-gallery'), 'fa')
  assert.equal(defaultLang('/g/o-gallery/works'), 'fa')
  assert.equal(defaultLang('/site/o-gallery'), 'fa')
  assert.equal(defaultLang('/g/rooz-gallery'), 'en')
  assert.equal(defaultLang('/g/o-gallery-two'), 'en')

  assert.equal(resolveLang('/g/o-gallery', null), 'fa')
  assert.equal(resolveLang('/g/o-gallery', 'inview-lang=en'), 'en')
  assert.equal(resolveLang('/g/rooz-gallery', 'inview-lang=fa'), 'fa')
  assert.equal(resolveLang('/g/o-gallery', 'other=1; inview-lang=en; more=2'), 'en')
  assert.equal(resolveLang('/g/o-gallery', 'inview-lang=de'), 'fa')

  // The Rooz demo dashboard has English labels only. The O Gallery staff pages follow the cookie.
  assert.equal(resolveLang('/dashboard', 'inview-lang=fa'), 'en')
  assert.equal(resolveLang('/dashboard/artworks', 'inview-lang=fa'), 'en')
  assert.equal(resolveLang('/dashboard/o-gallery', 'inview-lang=en'), 'en')
  assert.equal(resolveLang('/dashboard/o-gallery', null), 'fa')
  assert.equal(resolveLang('/dashboard/sign-in', 'inview-lang=fa'), 'fa')

  assert.equal(readLangCookie(null), null)
  assert.equal(readLangCookie('inview-langue=fa'), null)
  assert.match(langCookie('fa'), /^inview-lang=fa; Path=\/; Max-Age=\d+; SameSite=Lax$/)
})

test('public pages carry the ADR D7 cache header and vary on the cookie', () => {
  assert.equal(
    PUBLIC_PAGE_HEADERS['Cache-Control'],
    'public, max-age=0, s-maxage=60, stale-while-revalidate=600',
  )
  assert.equal(PUBLIC_PAGE_HEADERS.Vary, 'Cookie')
})

test('the gallery loader reads the published catalogue', async () => {
  await withCatalogue(async (run) => {
    const page = await run(() => loadGalleryPage(pageRequest('/g/o-gallery/works'), 'o-gallery'))
    assert.equal(page.pilot?.showTitle, 'Quiet Surfaces')
    assert.deepEqual(page.pilot?.works.map((work) => work.title), ['Harbour light'])
  })
})

test('the gallery loader reads the database once for each request', async () => {
  await withCatalogue(async (run) => {
    const request = pageRequest('/g/o-gallery')
    const [layout, page] = await run(() =>
      Promise.all([
        loadGalleryPage(request, 'o-gallery'),
        loadGalleryPage(request, 'o-gallery'),
      ]),
    )
    assert.equal(layout.pilot, page.pilot)
  })
})

test('the demo gallery loads without a catalogue', async () => {
  await withCatalogue(async (run) => {
    const page = await run(() => loadGalleryPage(pageRequest('/g/rooz-gallery'), 'rooz-gallery'))
    assert.equal(page.pilot, null)
  })
})

test('an unknown gallery slug answers 404', async () => {
  await withCatalogue(async (run) => {
    const response = await rejection(
      run(() => loadGalleryPage(pageRequest('/g/unknown-slug'), 'unknown-slug')),
    )
    assert.equal(response.status, 404)
    assert.match(String(response.headers.get('cache-control')), /no-store/)

    const site = await rejection(run(() => loadGalleryPage(pageRequest('/site/unknown'), 'unknown')))
    assert.equal(site.status, 404)
  })
})

test('a work id outside the catalogue answers 404', async () => {
  await withCatalogue(async (run) => {
    const found = await run(() =>
      loadWorkPage(pageRequest('/g/o-gallery/works/ssrwork01'), 'o-gallery', 'ssrwork01'),
    )
    assert.equal(found.work?.title, 'Harbour light')

    const response = await rejection(
      run(() => loadWorkPage(pageRequest('/g/o-gallery/works/nope'), 'o-gallery', 'nope')),
    )
    assert.equal(response.status, 404)
  })
})

test('a demo work id outside the demo data answers 404', async () => {
  await withCatalogue(async (run) => {
    const response = await rejection(
      run(() => loadWorkPage(pageRequest('/g/rooz-gallery/works/nope'), 'rooz-gallery', 'nope')),
    )
    assert.equal(response.status, 404)
  })
})
