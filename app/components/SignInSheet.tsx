import { useEffect, useRef, useState } from 'react'
import { reportLead } from '../lib/pilot'
import { normalizePhone, visitor } from '../lib/store'
import { useT } from '../lib/i18n'
import { Heart, Lock } from './Icons'

export type SheetKind = 'save' | 'ask' | 'follow' | 'stamp'

interface Props {
  kind: SheetKind
  subtitle?: string
  onDone: () => void
  onClose: () => void
}

export function SignInSheet({ kind, subtitle, onDone, onClose }: Props) {
  const { t, dir } = useT()
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
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

  function submitPhone(e: React.FormEvent) {
    e.preventDefault()
    const p = normalizePhone(phone)
    if (!p) return setError(t.badPhone)
    setError('')
    setPhone(p)
    setStep('code')
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault()
    const c = code.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    if (!/^\d{4}$/.test(c)) return setError(t.badCode)
    visitor.signIn(phone)
    reportLead(phone, kind)
    onDone()
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
            {error && <p id="sheet-error" className="error">{error}</p>}
            <button className="btn btn-primary" type="submit">{t.sendCode}</button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="sheet-form" noValidate>
            <label htmlFor="code">{t.code}</label>
            <input id="code" ref={inputRef} inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={4} placeholder="••••"
              value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={!!error} aria-describedby="code-hint" className="code-input" />
            <p id="code-hint" className="muted small">{error || t.codeHint}</p>
            <button className="btn btn-primary" type="submit">{t.confirm}</button>
          </form>
        )}
        <p className="privacy"><Lock size={16} />{t.privacy}</p>
        <button className="btn-text" onClick={onClose}>{t.notNow}</button>
      </div>
    </div>
  )
}
