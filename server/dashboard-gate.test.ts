import test from 'node:test'
import assert from 'node:assert/strict'
import * as React from 'react'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Route, Routes, StaticRouter } from 'react-router'
import GalleryLayout from '../app/pages/gallery/GalleryLayout.tsx'
import { StaffSignIn } from '../app/pages/gallery/StaffSignIn.tsx'

;(globalThis as unknown as { React: typeof React }).React = React

test('the Rooz dashboard renders without the client password gate', () => {
  const html = renderToString(
    createElement(
      StaticRouter,
      { location: '/dashboard' },
      createElement(
        Routes,
        null,
        createElement(
          Route,
          { path: '/dashboard', element: createElement(GalleryLayout) },
          createElement(Route, { index: true, element: createElement('p', null, 'rooz-demo') }),
        ),
      ),
    ),
  )
  assert.match(html, /rooz-demo/)
  assert.match(html, /Quiet Rooms/)
  assert.doesNotMatch(html, /Demo password/)
  assert.doesNotMatch(html, /Dashboard password/)
  assert.doesNotMatch(html, /sessionStorage/)
})

test('the staff sign-in form posts to the server and does not show a demo password', () => {
  const html = renderToString(
    createElement(StaticRouter, { location: '/dashboard/sign-in' }, createElement(StaffSignIn)),
  )
  assert.match(html, /method="post"/)
  assert.match(html, /name="accessCode"/)
  assert.match(html, /Open the editor/)
  assert.match(html, /Gallery access code/)
  assert.doesNotMatch(html, /Demo password/)
  assert.doesNotMatch(html, /sessionStorage/)
})
