import type { MetaFunction } from 'react-router'
import Profile from '~/pages/visitor/Profile'
import { metaCopy, pageMeta, rootData } from '~/lib/meta'

export const meta: MetaFunction = ({ matches, location }) => {
  const { lang, origin } = rootData(matches)
  const words = metaCopy(lang)
  return pageMeta({ lang, origin, path: location.pathname, title: `${words.profile} · ${words.site}`, description: words.tagline, noindex: true })
}

export function headers() {
  return { 'Cache-Control': 'no-store' }
}

export default function Me() {
  return <Profile />
}
