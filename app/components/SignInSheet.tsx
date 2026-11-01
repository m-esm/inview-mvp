import { useEffect, useRef, useState } from 'react'
import { CONSENT_TEXT_VERSION } from '../lib/consent'
import { gallerySlugFromPath, reportLead } from '../lib/pilot'
import { normalizePhone, visitor } from '../lib/store'
import { useT } from '../lib/i18n'
import { Heart, Lock } from './Icons'

export type SheetKind = 'save' | 'ask' | 'follow' | 'stamp'

interface Props {
  kind: SheetKind
  subtitle?: string
  workId?: string
  onDone: () => void
  onClose: () => void
}

export function SignInSheet({ kind, subtitle, workId, onDone, onClose }: Props) {
  const { t, dir } = useT()
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, onClose])

  const title = { save: t.sheetSaveTitle, ask: t.sheetAskTitle, follow: t.sheetFollowTitle, stamp: t.sheetStampTitle }[kind]
  const body = kind === 'ask' ? t.sheetAskBody : t.sheetBody

  function agreeOrExplain() {
    if (consent) return true
    setError(t.needConsent)
    return false
  }

  function submitPhone(e: React.FormEvent) {
    e.preventDefault()
    const p = normalizePhone(phone)
    if (!p) return setError(t.badPhone)
    if (!agreeOrExplain()) return
    setError('')
    setPhone(p)
    setStep('code')
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault()
    const c = code.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    if (!/^\d{4}$/.test(c)) return setError(t.badCode)
    if (!agreeOrExplain()) return
    visitor.signIn(phone, CONSENT_TEXT_VERSION)
    reportLead(gallerySlugFromPath(window.location.pathname), phone, kind, workId)
    onDone()
  }

  function onConsent(next: boolean) {
    setConsent(next)
    if (next) setError('')
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" dir={dir} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" aria-hidden />
        <div className="sheet-head">
          <span className="sheet-icon"><Heart size={22} filled /></span>
          <div>
            <h2 id="sheet-title">{title}</h2>
            {subtitle && <p className="muted small">{subtitle}</p>}
          </div>
        </div>
        <p className="sheet-body">{body}</p>
        {step === 'phone' ? (
          <form onSubmit={submitPhone} className="sheet-form" noValidate>
            <label htmlFor="phone">{t.mobile}</label>
            <input id="phone" ref={inputRef} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="0912 345 6789"
              value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!!error} aria-describedby={error ? 'sheet-error' : undefined} />
            <ConsentField checked={consent} label={t.consent} invalid={error === t.needConsent} describedBy={error ? 'sheet-error' : undefined} onChange={onConsent} />
            {error && <p id="sheet-error" className="error">{error}</p>}
            <button className="btn btn-primary" type="submit">{t.sendCode}</button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="sheet-form" noValidate>
            <label htmlFor="code">{t.code}</label>
            <input id="code" ref={inputRef} inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={4} placeholder="••••"
              value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={!!error} aria-describedby="sheet-error" className="code-input" />
            <ConsentField checked={consent} label={t.consent} invalid={error === t.needConsent} describedBy="sheet-error" onChange={onConsent} />
            <p id="sheet-error" className={error ? 'error' : 'muted small'}>{error || t.codeHint}</p>
            <button className="btn btn-primary" type="submit">{t.confirm}</button>
          </form>
        )}
        <p className="privacy"><Lock size={16} />{t.privacy}</p>
        <button className="btn-text" onClick={onClose}>{t.notNow}</button>
      </div>
    </div>
  )
}

function ConsentField({
  checked,
  label,
  invalid,
  describedBy,
  onChange,
}: {
  checked: boolean
  label: string
  invalid: boolean
  describedBy?: string
  onChange: (next: boolean) => void
}) {
  return (
    <label className="consent">
      <input
        type="checkbox"
        checked={checked}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}
