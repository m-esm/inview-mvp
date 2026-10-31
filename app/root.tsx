import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router'
import type { Route } from './+types/root'
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/500.css'
import '@fontsource/archivo/600.css'
import '@fontsource/archivo/700.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/vazirmatn/400.css'
import '@fontsource/vazirmatn/600.css'
import './styles.css'

export const links: Route.LinksFunction = () => [
  { rel: 'icon', href: '/icons/favicon.svg', type: 'image/svg+xml' },
  { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
]

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#203F3B" />
        <meta name="description" content="Inview: the show, the works and the prices, in your pocket." />
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
  let message = 'Error'
  let details = 'The page did not load.'
  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? 'Not found' : `Error ${error.status}`
    details =
      error.status === 404
        ? 'This page does not exist. Scan the QR code at the gallery again.'
        : error.statusText || details
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message
  }
  return (
    <main className="pad empty">
      <h1 className="page-title">{message}</h1>
      <p className="muted">{details}</p>
    </main>
  )
}
