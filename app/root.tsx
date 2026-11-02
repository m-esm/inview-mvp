import { O_SLUG } from './lib/galleries'
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
import { ServiceWorker } from './components/ServiceWorker'
import '@fontsource/fraunces/400.css'
import '@fontsource/fraunces/500.css'
import '@fontsource/sora/400.css'
import '@fontsource/sora/500.css'
import '@fontsource/sora/600.css'
import '@fontsource/sora/700.css'
import fraunces400 from '@fontsource/fraunces/files/fraunces-latin-400-normal.woff2?url'
import fraunces500 from '@fontsource/fraunces/files/fraunces-latin-500-normal.woff2?url'
import persianFonts from './styles-fa.css?url'
import './styles.css'

export const links: Route.LinksFunction = () => [
  { rel: 'icon', href: '/icons/favicon.svg', type: 'image/svg+xml' },
  { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
  { rel: 'manifest', href: '/manifest.webmanifest' },
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
  const persian = data?.lang === 'fa'
  return (
    <html lang={data?.lang ?? 'en'} dir={data?.dir ?? 'ltr'}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#17332E" />
        <Meta />
        <Links />
        {persian ? (
          <link rel="stylesheet" href={persianFonts} />
        ) : (
          <>
            <link rel="preload" href={fraunces400} as="font" type="font/woff2" crossOrigin="anonymous" />
            <link rel="preload" href={fraunces500} as="font" type="font/woff2" crossOrigin="anonymous" />
          </>
        )}
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
      <Link className="btn btn-outline" to={`/g/${O_SLUG}`}>{t.goToGallery}</Link>
      {import.meta.env.DEV && error instanceof Error && <pre className="muted small">{error.message}</pre>}
    </main>
  )
}
