import { useEffect, useState } from 'react'
import { OLandingPreview } from '../visitor/OGalleryPages'
import { fetchPilot, QR_ADDRESS, seed, type PilotRecord, type PilotState, type PilotWork } from '../../lib/pilot'

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      reject(new Error('Choose a PNG, JPEG, or WebP image.'))
      return
    }
    if (file.size > 350_000) {
      reject(new Error('Use an image smaller than 350 KB.'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('That image did not load.'))
    reader.readAsDataURL(file)
  })
}

function blankWork(sample: boolean): PilotWork {
  return {
    id: crypto.randomUUID(),
    artist: '',
    title: sample ? 'Sample work' : '',
    medium: '',
    size: '',
    year: '',
    price: null,
    status: 'available',
    image: '',
    sample,
  }
}

export default function OGalleryEditor() {
  const [draft, setDraft] = useState<PilotRecord>(seed)
  const [stats, setStats] = useState<PilotState | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [previewLang, setPreviewLang] = useState<'fa' | 'en'>('fa')
  const [loaded, setLoaded] = useState(false)
  const [copied, setCopied] = useState(false)

  async function load() {
    const state = await fetchPilot()
    setDraft(state.record)
    setStats(state)
    setLoaded(true)
  }

  useEffect(() => {
    load().catch(() => setError('The saved record did not load. You can still edit and publish.'))
  }, [])

  function setField<K extends keyof PilotRecord>(key: K, value: PilotRecord[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function updateWork(id: string, patch: Partial<PilotWork>) {
    setDraft((current) => ({
      ...current,
      works: current.works.map((work) => (work.id === id ? { ...work, ...patch } : work)),
    }))
  }

  async function publish(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    const res = await fetch('/api/pilot', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, record: draft }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Publish did not complete.')
      return
    }
    setDraft(data.record)
    setStats(data)
    setMessage('Published. The QR path is still /g/o-gallery.')
  }

  async function copyQr() {
    try {
      await navigator.clipboard.writeText(QR_ADDRESS)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const noVisits = loaded && !!stats && stats.visits.scans === 0 && stats.visits.views === 0

  return (
    <div className="editor">
      <section className="box">
        <h2>Visits</h2>
        {noVisits && <p>There are no visits yet.</p>}
        {stats && !noVisits && (
          <div className="kpis">
            <div className="kpi"><span className="muted small">Landing scans</span><strong>{stats.visits.scans}</strong><span className="muted tiny">One per browser per day</span></div>
            <div className="kpi"><span className="muted small">Work views</span><strong>{stats.visits.views}</strong></div>
          </div>
        )}
        <label htmlFor="qr">QR address</label>
        <div className="row gap wrap">
          <input id="qr" readOnly value={QR_ADDRESS} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn btn-outline" type="button" onClick={() => void copyQr()}>{copied ? 'Copied' : 'Copy'}</button>
          <button className="btn btn-outline" type="button" onClick={() => load().catch(() => setError('The visit report did not refresh.'))}>Refresh</button>
        </div>
        <h3>Phone numbers</h3>
        <p className="muted small">Every saved number is unverified. The 4-digit code is still only a demo.</p>
        {stats && stats.leads.length > 0 ? (
          <ul className="lead-list">
            {stats.leads.map((lead) => (
              <li key={`${lead.at}-${lead.phone}`}>
                <span dir="ltr">{lead.phone}</span>
                <span className="muted small">{lead.kind === 'save' ? 'Save' : 'Question'}</span>
                <span className="pill warn">Unverified</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted small">No phone numbers yet.</p>}
      </section>

      <form onSubmit={(e) => void publish(e)}>
        <section className="box">
          <h2>Gallery</h2>
          <div className="editor-grid">
            <label>Name<input value={draft.name} onChange={(e) => setField('name', e.target.value)} required /></label>
            <label>Persian name<input value={draft.nameFa} onChange={(e) => setField('nameFa', e.target.value)} /></label>
            <label>Show title<input value={draft.showTitle} onChange={(e) => setField('showTitle', e.target.value)} /></label>
            <label>Show title in Persian<input value={draft.showTitleFa} onChange={(e) => setField('showTitleFa', e.target.value)} /></label>
            <label>Dates<input value={draft.dates} onChange={(e) => setField('dates', e.target.value)} /></label>
            <label>Dates in Persian<input value={draft.datesFa} onChange={(e) => setField('datesFa', e.target.value)} /></label>
            <label>Hours<input value={draft.hours} onChange={(e) => setField('hours', e.target.value)} /></label>
            <label>Hours in Persian<input value={draft.hoursFa} onChange={(e) => setField('hoursFa', e.target.value)} /></label>
            <label>Address<input value={draft.address} onChange={(e) => setField('address', e.target.value)} /></label>
            <label>Address in Persian<input value={draft.addressFa} onChange={(e) => setField('addressFa', e.target.value)} /></label>
            <label className="span-2">Exhibition text<textarea value={draft.text} onChange={(e) => setField('text', e.target.value)} rows={4} /></label>
            <label className="span-2">Exhibition text in Persian<textarea value={draft.textFa} onChange={(e) => setField('textFa', e.target.value)} rows={4} /></label>
            <label className="span-2">PDF address<input value={draft.pdfUrl ?? ''} placeholder="https://" onChange={(e) => setField('pdfUrl', e.target.value || null)} /></label>
            <label>Logo
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                readImage(file).then((url) => setField('logo', url)).catch((err: Error) => setError(err.message))
              }} />
            </label>
          </div>
          {draft.logo && <button className="btn-text" type="button" onClick={() => setField('logo', null)}>Remove logo</button>}
        </section>

        <section className="box">
          <div className="row between wrap gap">
            <h2>Works</h2>
            <div className="row gap wrap">
              <button className="btn btn-outline" type="button" onClick={() => setDraft((current) => ({ ...current, works: [...current.works, blankWork(true)] }))}>Add a labeled sample</button>
              <button className="btn btn-outline" type="button" onClick={() => setDraft((current) => ({ ...current, works: [...current.works, blankWork(false)] }))}>Add a work</button>
            </div>
          </div>
          <p className="muted small">A sample must say “sample” or «نمونه» in the title. A sample is not an O Gallery artwork.</p>
          {draft.works.map((work) => (
            <fieldset key={work.id} className="work-edit">
              <legend>{work.title || 'Work'}</legend>
              <div className="editor-grid">
                <label>Artist<input value={work.artist} onChange={(e) => updateWork(work.id, { artist: e.target.value })} /></label>
                <label>Title<input value={work.title} onChange={(e) => updateWork(work.id, { title: e.target.value })} /></label>
                <label>Medium<input value={work.medium} onChange={(e) => updateWork(work.id, { medium: e.target.value })} /></label>
                <label>Size<input value={work.size} onChange={(e) => updateWork(work.id, { size: e.target.value })} /></label>
                <label>Year<input value={work.year} onChange={(e) => updateWork(work.id, { year: e.target.value })} /></label>
                <label>Price in Toman<input inputMode="numeric" value={work.price ?? ''} onChange={(e) => updateWork(work.id, { price: e.target.value === '' ? null : Number(e.target.value) })} /></label>
                <label>Status
                  <select value={work.status} onChange={(e) => updateWork(work.id, { status: e.target.value as PilotWork['status'] })}>
                    <option value="available">Available</option>
                    <option value="reserved">Reserved</option>
                    <option value="sold">Sold</option>
                  </select>
                </label>
                <label className="check-line">
                  <input type="checkbox" checked={work.sample} onChange={(e) => updateWork(work.id, { sample: e.target.checked })} />
                  Sample, not an O Gallery artwork
                </label>
                <label>Image
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    readImage(file).then((url) => updateWork(work.id, { image: url })).catch((err: Error) => setError(err.message))
                  }} />
                </label>
              </div>
              <button className="btn-text" type="button" onClick={() => setDraft((current) => ({ ...current, works: current.works.filter((item) => item.id !== work.id) }))}>Remove work</button>
            </fieldset>
          ))}
        </section>

        <section className="box">
          <div className="row between wrap gap">
            <h2>Preview</h2>
            <div className="lang" role="group" aria-label="Preview language">
              <button type="button" aria-pressed={previewLang === 'fa'} onClick={() => setPreviewLang('fa')}>فا</button>
              <button type="button" aria-pressed={previewLang === 'en'} onClick={() => setPreviewLang('en')}>EN</button>
            </div>
          </div>
          <div className={`phone-preview ${previewLang === 'fa' ? 'fa' : ''}`} dir={previewLang === 'fa' ? 'rtl' : 'ltr'}>
            <OLandingPreview record={draft} lang={previewLang} />
          </div>
        </section>

        <section className="box">
          <h2>Publish</h2>
          <label htmlFor="publish-password">Dashboard password</label>
          <input id="publish-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="error" role="alert">{error}</p>}
          {message && <p role="status">{message}</p>}
          <button className="btn btn-primary" type="submit">Publish</button>
        </section>
      </form>
    </div>
  )
}
