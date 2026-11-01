import { useState } from 'react'
import { redirect } from 'react-router'
import { database } from '../../database/context'
import { principalFor } from '../../server/authz'
import { StaffLangSwitch } from '../components/StaffLangSwitch'
import { useOpsT } from '../lib/i18n-ops'
import { privateHeaders } from './ops-session.server'

export const headers = privateHeaders

export async function loader({ request }: { request: Request }) {
  const principal = await principalFor(database(), request)
  if (principal?.kind === 'operator') throw redirect('/ops', { headers: privateHeaders() })
  if (principal) throw new Response('Forbidden', { status: 403, headers: privateHeaders() })
  return null
}

export default function OperatorSignIn() {
  const { t, dir } = useOpsT()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <main className="ops-auth" dir={dir}>
    <form className="ops-auth-form" onSubmit={async (event) => {
      event.preventDefault()
      const form = new FormData(event.currentTarget)
      setBusy(true); setError('')
      try {
        const response = await fetch('/api/v1/auth/sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: form.get('identifier'), password: form.get('password') }) })
        const result = await response.json()
        if (!response.ok) setError(response.status === 429 ? t.limited : t.error)
        else if (!result.user.platformRole) setError(t.forbidden)
        else window.location.assign('/ops')
      } catch { setError(t.error) } finally { setBusy(false) }
    }}>
      <div className="row between"><strong>{t.brand}</strong><StaffLangSwitch /></div>
      <p className="ops-eyebrow">{t.panel}</p><h1>{t.signIn}</h1>
      <label>{t.identifier}<input name="identifier" autoComplete="username" maxLength={320} required dir="ltr" /></label>
      <label>{t.password}<input name="password" type="password" autoComplete="current-password" required maxLength={1024} dir="ltr" /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{t.signIn}</button>
    </form>
  </main>
}
