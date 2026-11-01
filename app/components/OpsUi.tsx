import { useEffect, useState } from 'react'
import { Link, useNavigation } from 'react-router'
import { useOpsT } from '../lib/i18n-ops'

export function OpsSubmit({ children, name, value }: { children: React.ReactNode; name?: string; value?: string }) {
  const navigation = useNavigation()
  return <button className="btn btn-primary" type="submit" name={name} value={value} disabled={navigation.state !== 'idle'}>{children}</button>
}

export function OneTimeValue({ value, label }: { value: string; label: string }) {
  const { t } = useOpsT()
  const [message, setMessage] = useState('')
  const [visible, setVisible] = useState(true)
  const [display, setDisplay] = useState(value)
  useEffect(() => {
    setVisible(true)
    setMessage('')
    setDisplay(value.startsWith('/') ? new URL(value, window.location.origin).href : value)
    const hide = () => setVisible(false)
    window.addEventListener('pagehide', hide)
    return () => window.removeEventListener('pagehide', hide)
  }, [value])
  if (!visible) return null
  return <section className="ops-once" aria-label={label}>
    <h2>{label}</h2><p>{t.once}</p>
    <textarea aria-label={label} readOnly value={display} dir="ltr" onFocus={(event) => event.currentTarget.select()} />
    <button type="button" className="btn btn-outline" onClick={async () => {
      try { await navigator.clipboard.writeText(display); setMessage(t.copied) } catch { setMessage(t.copyFailed) }
    }}>{t.copy}</button><p role="status">{message}</p>
  </section>
}

export function GalleryLinks({ slug }: { slug: string }) {
  const { t } = useOpsT()
  return <nav className="ops-links" aria-label={t.gallery}>
    <Link to={`/ops/galleries/${slug}`}>{t.profile}</Link>
    <Link to={`/ops/galleries/${slug}/team`}>{t.team}</Link>
    <Link to={`/ops/galleries/${slug}/qr`}>{t.qr}</Link>
    <Link to={`/ops/galleries/${slug}/leads`}>{t.leads}</Link>
    <Link to={`/ops/galleries/${slug}/activity`}>{t.activity}</Link>
    <a href={`/g/${slug}`}>{t.visitor}</a><a href={`/staff/${slug}`}>{t.editor}</a>
  </nav>
}

export function RoleSelect({ value = 'editor' }: { value?: string }) {
  const { t } = useOpsT()
  return <label>{t.role}<select name="role" defaultValue={value}>
    <option value="owner">{t.owner}</option><option value="editor">{t.editorRole}</option><option value="viewer">{t.viewer}</option>
  </select></label>
}
