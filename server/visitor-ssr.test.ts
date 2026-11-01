import test from 'node:test'
import assert from 'node:assert/strict'
import * as React from 'react'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Route, Routes, StaticRouter } from 'react-router'
import { useVisitor } from '../app/lib/store.ts'

// tsx loads app JSX with the classic runtime; expose React for those modules.
;(globalThis as unknown as { React: typeof React }).React = React

test('useVisitor server-renders with the stable default visitor state', () => {
  function Probe() {
    const { lang, phone, saved, follows, stamps, langChosen } = useVisitor()
    return createElement('div', {
      'data-lang': lang,
      'data-phone': phone ?? '',
      'data-saved': String(saved.length),
      'data-follows': String(follows.length),
      'data-stamps': String(stamps.length),
      'data-chosen': String(langChosen),
    })
  }

  const html = renderToString(createElement(Probe))
  assert.match(html, /data-lang="en"/)
  assert.match(html, /data-phone=""/)
  assert.match(html, /data-saved="0"/)
  assert.match(html, /data-follows="0"/)
  assert.match(html, /data-stamps="0"/)
  assert.match(html, /data-chosen="false"/)
})

test('VisitorShell server-renders /g/o-gallery without throwing', async () => {
  const { VisitorShell } = await import('../app/components/VisitorShell.tsx')

  const html = renderToString(
    createElement(
      StaticRouter,
      { location: '/g/o-gallery' },
      createElement(
        Routes,
        null,
        createElement(
          Route,
          { path: '/g/:slug', element: createElement(VisitorShell) },
          createElement(Route, { index: true, element: createElement('p', null, 'o-gallery-ssr') }),
        ),
      ),
    ),
  )

  assert.match(html, /o-gallery-ssr/)
  assert.match(html, /visitor/)
})

test('the sign-in sheet starts with an empty consent box in Persian and English', async () => {
  const { SignInSheet } = await import('../app/components/SignInSheet.tsx')
  const props = {
    kind: 'save' as const,
    workId: 'samplework1',
    onDone: () => {},
    onClose: () => {},
  }
  const fa = renderToString(
    createElement(StaticRouter, { location: '/g/o-gallery/works/samplework1' }, createElement(SignInSheet, props)),
  )
  const en = renderToString(
    createElement(StaticRouter, { location: '/g/rooz/works/samplework1' }, createElement(SignInSheet, props)),
  )
  for (const html of [fa, en]) {
    assert.match(html, /type="checkbox"/)
    assert.doesNotMatch(html, /checked/)
  }
  assert.match(fa, /اگر اثری را ذخیره کنید/)
  assert.match(fa, /موافقم که این گالری/)
  assert.match(en, /Save sends your mobile number/)
  assert.match(en, /I agree/)
})
