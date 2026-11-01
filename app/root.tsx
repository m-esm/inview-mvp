import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from 'react-router'
import type { Route } from './+types/root'
import { useT } from './lib/i18n'
import { metaCopy } from './lib/meta'
import { dirFor, resolveLang } from './lib/lang'
import '@fontsource/fraunces/400.css'
import '@fontsource/fraunces/500.css'
import '@fontsource/sora/400.css'
import '@fontsource/sora/500.css'
import '@fontsource/sora/600.css'
import '@fontsource/sora/700.css'
import '@fontsource/estedad/400.css'
import '@fontsource/estedad/600.css'
import '@fontsource/estedad/700.css'
import './styles.css'

export const links: Route.LinksFunction = () => [
  { rel: 'icon', href: '/icons/favicon.svg', type: 'image/svg+xml' },
  { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
]

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const lang = resolveLang(url.pathname, request.headers.get('cookie'))
  const origin = (process.env.PUBLIC_APP_URL || url.origin).replace(/\/$/, '')
  return { lang, dir: dirFor(lang), origin }
}

export const meta: Route.MetaFunction = ({ data }) => {
  const words = metaCopy(data?.lang ?? 'en')
  return [{ title: words.site }, { name: 'description', content: words.tagline }]
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>('root')
  return (
    <html lang={data?.lang ?? 'en'} dir={data?.dir ?? 'ltr'}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#17332E" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t, dir } = useT()
  const missing = isRouteErrorResponse(error) && error.status === 404
  return (
    <main className="pad empty" dir={dir}>
      <h1 className="page-title">{missing ? t.notFound : t.loadFailed}</h1>
      <p className="muted">{missing ? t.notFoundBody : t.loadFailedBody}</p>
      <Link className="btn btn-outline" to="/g/o-gallery">{t.goToGallery}</Link>
      {import.meta.env.DEV && error instanceof Error && <pre className="muted small">{error.message}</pre>}
    </main>
  )
}
