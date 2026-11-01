import test from 'node:test'
import assert from 'node:assert/strict'
import * as React from 'react'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Route, Routes, StaticRouter } from 'react-router'
import GalleryLayout from '../app/pages/gallery/GalleryLayout.tsx'
import { StaffSignIn } from '../app/pages/gallery/StaffSignIn.tsx'
import { renderStaff } from './test-render.ts'

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
  assert.match(html, /Demo/)
  assert.doesNotMatch(html, /href="\/dashboard\/o-gallery"/)
  assert.doesNotMatch(html, /Demo password/)
  assert.doesNotMatch(html, /Dashboard password/)
  assert.doesNotMatch(html, /sessionStorage/)
})

test('the staff sign-in form posts to the server and does not show a demo password', () => {
  const html = renderStaff(createElement(StaffSignIn), 'en')
  assert.match(html, /method="post"/)
  assert.match(html, /name="accessCode"/)
  assert.match(html, /Open the editor/)
  assert.match(html, /Gallery access code/)
  assert.doesNotMatch(html, /Demo password/)
  assert.doesNotMatch(html, /sessionStorage/)
})

test('the staff sign-in page renders in Persian from the root language', () => {
  const html = renderStaff(createElement(StaffSignIn, { error: 'wrong' }), 'fa')
  assert.match(html, /dir="rtl"/)
  assert.match(html, /کد دسترسی گالری/)
  assert.match(html, /باز کردن ویرایشگر/)
  assert.match(html, /اطلاعات ورود درست نیست/)
})
