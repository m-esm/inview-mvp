import { data } from 'react-router'

export function loader() {
  return data(null, { status: 404 })
}

export default function NotFound() {
  return (
    <main className="pad empty">
      <h1 className="page-title">Not found</h1>
      <p className="muted">This page does not exist. Scan the QR code at the gallery again.</p>
    </main>
  )
}
