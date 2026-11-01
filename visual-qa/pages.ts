export const routes = [
  { name: 'landing', path: '/' },
  { name: 'gallery', path: '/g/sample' },
  { name: 'gallery-works', path: '/g/sample/works' },
  { name: 'gallery-prices', path: '/g/sample/prices' },
  { name: 'gallery-about', path: '/g/sample/about' },
  { name: 'sign-in', path: '/dashboard/sign-in' },
  { name: 'not-found', path: '/no-such-page' },
] as const

export const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const

export const langs = ['fa', 'en'] as const
