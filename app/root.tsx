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
import { dirFor, resolveLang } from './lib/lang'
import { ServiceWorker } from './components/ServiceWorker'
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
  { rel: 'manifest', href: '/manifest.webmanifest' },
]

export function loader({ request }: Route.LoaderArgs) {
  const { pathname } = new URL(request.url)
  const lang = resolveLang(pathname, request.headers.get('cookie'))
  return { lang, dir: dirFor(lang) }
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>('root')
  return (
    <html lang={data?.lang ?? 'en'} dir={data?.dir ?? 'ltr'}>
      <head>
        <meta charSet="utf-8" />
        <title>Inview</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#17332E" />
        <meta name="description" content="Inview: the show, the works and the prices, in your pocket." />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ServiceWorker />
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
