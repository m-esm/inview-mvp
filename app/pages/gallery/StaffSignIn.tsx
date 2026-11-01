import { StaffLangSwitch } from '../../components/StaffLangSwitch'
import { useStaffT } from '../../lib/i18n-staff'

export type SignInError = 'wrong' | 'limited' | ''

export function StaffSignIn({ error = '' }: { error?: SignInError }) {
  const { t, lang, dir } = useStaffT()
  const message = error === 'limited' ? t.tooMany : error === 'wrong' ? t.wrongCode : ''
  return (
    <main className={`gate staff-${lang}`} dir={dir}>
      <aside className="gate-panel" aria-hidden>
        <h2>{t.signInPanelTitle}</h2>
        <p>{t.signInPanelBody}</p>
      </aside>
      <form method="post" className="gate-card">
        <div className="row between gap">
          <p className="brand">{t.brand} <span>{t.brandSub}</span></p>
          <StaffLangSwitch />
        </div>
        <span className="ink-rule" aria-hidden />
        <h1>{t.signInTitle}</h1>
        <label htmlFor="access-code">{t.accessCode}</label>
        <input
          id="access-code"
          name="accessCode"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
          aria-describedby="access-msg"
          aria-invalid={message ? true : undefined}
        />
        <p id="access-msg" className={message ? 'error' : 'muted small'} role={message ? 'alert' : undefined}>
          {message || t.signInHint}
        </p>
        <button className="btn btn-primary" type="submit">
          {t.signInButton}
        </button>
      </form>
    </main>
  )
}
