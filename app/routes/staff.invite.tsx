import { useState } from 'react'
import { useLoaderData } from 'react-router'
import { database } from '../../database/context'
import { readInvite } from '../../server/invitations'
import { StaffLangSwitch } from '../components/StaffLangSwitch'
import { useOpsT } from '../lib/i18n-ops'
import { privateHeaders } from './ops-session.server'

export const headers = privateHeaders

export async function loader({ params }: { params: { token?: string } }) {
  return { invite: await readInvite(database(), params.token ?? '') }
}

export default function InviteAccept() {
  const { invite } = useLoaderData<typeof loader>()
  const { t, lang, dir } = useOpsT()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <main className="ops-auth" dir={dir}><div className="ops-auth-form">
    <div className="row between"><strong>{t.brand}</strong><StaffLangSwitch /></div>
    <h1>{t.invitation}</h1>
    {!invite ? <p role="alert">{t.invalidInvite}</p> : <>
      <p>{invite.kind === 'operator' ? t.operator : invite.kind === 'reset' ? t.resetKind : t.staff}</p>
      <p>{lang === 'fa' ? invite.galleryNameFa || invite.galleryName : invite.galleryName}</p>
      <form onSubmit={async (event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        setBusy(true); setError('')
        try {
          const token = window.location.pathname.split('/').pop()
          const response = await fetch(`/api/v1/invites/${encodeURIComponent(token ?? '')}/accept`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: form.get('name'), password: form.get('password') }),
          })
          const result = await response.json()
          if (!response.ok) setError(response.status === 404 ? t.invalidInvite : t.error)
          else window.location.replace(result.user.platformRole ? '/ops' : `/staff/${encodeURIComponent(invite.gallerySlug ?? '')}`)
        } catch { setError(t.error) } finally { setBusy(false) }
      }}>
        <label>{t.name}<input name="name" autoComplete="name" maxLength={200} required /></label>
        <label>{t.password}<input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={1024} required dir="ltr" aria-describedby="password-hint" /></label>
        <p id="password-hint">{t.passwordHint}</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{t.accept}</button>
      </form>
    </>}
  </div></main>
}
