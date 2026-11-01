import * as React from 'react'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createRoutesStub } from 'react-router'

;(globalThis as unknown as { React: typeof React }).React = React

const reactError = console.error
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return
  reactError(...args)
}

export function renderStaff(element: React.ReactElement, lang: 'en' | 'fa', location = '/staff/sign-in') {
  const Stub = createRoutesStub([{ id: 'root', path: '*', Component: () => element }])
  return renderToString(
    createElement(Stub, {
      initialEntries: [location],
      hydrationData: { loaderData: { root: { lang, dir: lang === 'fa' ? 'rtl' : 'ltr' } } },
    }),
  )
}
