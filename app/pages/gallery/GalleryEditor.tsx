import { useEffect, useId, useMemo, useState } from 'react'
import { OLandingPreview } from '../visitor/OGalleryPages'
import { parseToman } from '../../lib/price'
import { type PilotRecord, type PilotWork } from '../../lib/pilot'
import { useStaffT, type StaffDict } from '../../lib/i18n-staff'
import {
  fetchStaffReport,
  LEADS_CSV_PATH,
  uploadImage,
  UploadProblemError,
  type StaffReport,
} from '../../lib/staff-api'

type ServerText = { error?: string; errorFa?: string }

function serverMessage(lang: 'en' | 'fa', data: ServerText | undefined, fallback: string) {
  if (!data) return fallback
  if (lang === 'fa') return data.errorFa || fallback
  return data.error || fallback
}

function uploadMessage(t: StaffDict, lang: 'en' | 'fa', error: unknown) {
  if (!(error instanceof UploadProblemError)) return t.uploadFailed
  const fallback = error.problem === 'size' ? t.uploadSize : error.problem === 'type' ? t.uploadType : t.uploadFailed
  return serverMessage(lang, error.serverText, fallback)
}

function blankWork(sample: boolean, t: StaffDict): PilotWork {
  return {
    id: crypto.randomUUID(),
    artist: '',
    title: sample ? t.sampleTitle : '',
    medium: '',
    size: '',
    year: '',
    price: null,
    status: 'available',
    image: '',
    sample,
  }
}

function priceText(price: number | null) {
  return price === null ? '' : price.toLocaleString('en-US')
}

function ImageField({
  gallery,
  label,
  value,
  onChange,
  onError,
}: {
  gallery: string
  label: string
  value: string
  onChange: (url: string) => void
  onError: (message: string) => void
}) {
  const { t, lang, format } = useStaffT()
  const id = useId()
  const [progress, setProgress] = useState<number | null>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    setProgress(0)
    try {
      const saved = await uploadImage(file, setProgress, gallery)
      onChange(saved.url)
    } catch (error) {
      onError(uploadMessage(t, lang, error))
    } finally {
      setProgress(null)
    }
  }

  const busy = progress !== null
  return (
    <div className="upload-field">
      <span className="upload-label" id={`${id}-label`}>{label}</span>
      <div className="upload-body">
        <div className="upload-thumb">
          {value ? <img src={value} alt="" /> : <span className="muted tiny">{t.noImage}</span>}
        </div>
        <div className="upload-actions">
          <label className="btn btn-outline small-btn upload-button" aria-disabled={busy || undefined}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              aria-labelledby={`${id}-label`}
              onChange={(e) => {
                void pick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {value ? t.replaceImage : t.chooseImage}
          </label>
          {value && !busy ? (
            <button className="btn-text" type="button" onClick={() => onChange('')}>{t.removeImage}</button>
          ) : null}
          {busy ? (
            <span className="upload-progress" role="status">
              {t.uploading} {format.number(Math.round((progress ?? 0) * 100))}{lang === 'fa' ? '٪' : '%'}
              <progress max={1} value={progress ?? 0} aria-label={t.uploading} />
            </span>
          ) : (
            <span className="muted tiny">{t.uploadHint}</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function GalleryEditor({ initialRecord, initialReport = null, reportOnly = false, canExport = false }: { initialRecord: PilotRecord; initialReport?: StaffReport | null; reportOnly?: boolean; canExport?: boolean }) {
  const qrAddress = `/g/${initialRecord.slug}`
  const { t, lang, format } = useStaffT()
  const [draft, setDraft] = useState<PilotRecord>(initialRecord)
  const [published, setPublished] = useState(() => JSON.stringify(initialRecord))
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialRecord.works.map((work) => [work.id, priceText(work.price)])),
  )
  const [stats, setStats] = useState<StaffReport | null>(initialReport)
  const [reportFailed, setReportFailed] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [previewLang, setPreviewLang] = useState<'fa' | 'en'>(lang)
  const [copied, setCopied] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const badPrices = useMemo(
    () => new Set(Object.entries(prices).filter(([, raw]) => parseToman(raw) === 'invalid').map(([id]) => id)),
    [prices],
  )
  const dirty = JSON.stringify(draft) !== published || badPrices.size > 0

  function adopt(record: PilotRecord) {
    setDraft(record)
    setPublished(JSON.stringify(record))
    setPrices(Object.fromEntries(record.works.map((work) => [work.id, priceText(work.price)])))
  }

  async function loadRecord() {
    const response = await fetch(`/api/v1/pilot/staff/record?gallery=${encodeURIComponent(initialRecord.slug)}`, { cache: 'no-store' })
    if (!response.ok) throw new Error(String(response.status))
    const state = await response.json()
    adopt(state.record)
  }

  async function loadReport() {
    try {
      setStats(await fetchStaffReport(initialRecord.slug))
      setReportFailed(false)
    } catch {
      setStats(null)
      setReportFailed(true)
    }
  }

  useEffect(() => {
    void loadReport()
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

  function addWork(sample: boolean) {
    const work = blankWork(sample, t)
    setDraft((current) => ({ ...current, works: [...current.works, work] }))
    setPrices((current) => ({ ...current, [work.id]: '' }))
  }

  function removeWork(id: string) {
    setDraft((current) => ({ ...current, works: current.works.filter((item) => item.id !== id) }))
    setPrices((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  async function publish(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    if (badPrices.size > 0) {
      setError(t.priceHint)
      return
    }
    setPublishing(true)
    try {
      const res = await fetch('/api/v1/pilot', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gallery: initialRecord.slug, record: draft }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(serverMessage(lang, data, t.publishFailed))
        return
      }
      adopt(data.record)
      await loadReport()
      setMessage(t.published)
    } catch {
      setError(t.publishFailed)
    } finally {
      setPublishing(false)
    }
  }

  async function copyQr() {
    try {
      await navigator.clipboard.writeText(new URL(qrAddress, window.location.origin).href)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const noVisits = !!stats && stats.visits.scans === 0 && stats.visits.views === 0
  const ReportHeading = reportOnly ? 'h1' : 'h2'
  const titleOf = (workId: string | null, fallback: string | null) =>
    fallback || (workId ? draft.works.find((work) => work.id === workId)?.title || workId : t.noWork)

  return (
    <div className="editor">
      <section className="box staff-report" id="report" aria-labelledby="report-title">
        <div className="row between wrap gap">
          <ReportHeading id="report-title">{t.reportTitle}</ReportHeading>
          <div className="row gap wrap">
            <button className="btn btn-outline small-btn" type="button" onClick={() => {
              loadRecord().catch(() => setError(t.publishFailed))
              void loadReport()
            }}>{t.refresh}</button>
            {canExport && <a className="btn btn-quiet small-btn" href={`${LEADS_CSV_PATH}?gallery=${encodeURIComponent(initialRecord.slug)}`} download>{t.downloadCsv}</a>}
          </div>
        </div>
        {reportFailed && <p className="error" role="alert">{t.reportFailed}</p>}
        {!stats && !reportFailed && <p className="muted small">{t.reportLoading}</p>}
        {stats && (
          <>
            <dl className="staff-totals">
              <div><dt>{t.scans}</dt><dd>{format.number(stats.visits.scans)}</dd><dd className="staff-hint muted tiny">{t.scansHint}</dd></div>
              <div><dt>{t.views}</dt><dd>{format.number(stats.visits.views)}</dd></div>
              <div><dt>{t.leadsTotal}</dt><dd>{format.number(stats.leads.length)}</dd></div>
            </dl>
            {noVisits && <p className="muted">{t.noVisits}</p>}
            <div className="staff-tables">
              {stats.days.length > 0 && (
                <div className="staff-table">
                  <h3>{t.byDay}</h3>
                  <table>
                    <thead><tr><th scope="col">{t.day}</th><th scope="col" className="num">{t.scans}</th><th scope="col" className="num">{t.views}</th></tr></thead>
                    <tbody>
                      {stats.days.map((row) => (
                        <tr key={row.day}><td>{format.day(row.day)}</td><td className="num">{format.number(row.scans)}</td><td className="num">{format.number(row.views)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="staff-table">
                <h3>{t.byWork}</h3>
                {stats.works.length === 0 ? (
                  <p className="muted small">{t.noWorkStats}</p>
                ) : (
                  <table>
                    <thead><tr><th scope="col">{t.work}</th><th scope="col" className="num">{t.views}</th><th scope="col" className="num">{t.saves}</th><th scope="col" className="num">{t.asks}</th></tr></thead>
                    <tbody>
                      {stats.works.map((row) => (
                        <tr key={row.workId}><td>{row.title}</td><td className="num">{format.number(row.views)}</td><td className="num">{format.number(row.saves)}</td><td className="num">{format.number(row.asks)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <h3>{t.leadsTitle}</h3>
            <p className="muted small">{t.leadsNote}</p>
            {stats.leads.length > 0 ? (
              <ul className="lead-list">
                {stats.leads.map((lead) => (
                  <li key={`${lead.at}-${lead.phone}`}>
                    <span dir="ltr" className="lead-phone">{lead.phone}</span>
                    <span className="small">{lead.kind === 'save' ? t.leadSave : t.leadAsk}</span>
                    <span className="small">{titleOf(lead.workId, lead.workTitle)}</span>
                    <time className="muted small" dateTime={lead.at}>{format.dateTime(lead.at)}</time>
                    <span className="muted tiny">{t.consentVersion} {lead.consentTextVersion}</span>
                    <span className="pill warn">{t.unverified}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">{t.noLeads}</p>
            )}
          </>
        )}
        <label htmlFor="qr" className="staff-qr-label">{t.qrAddress}</label>
        <div className="row gap wrap">
          <input id="qr" readOnly dir="ltr" value={qrAddress} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn btn-outline small-btn" type="button" onClick={() => void copyQr()}>{copied ? t.copied : t.copy}</button>
        </div>
      </section>

      {!reportOnly && <div className="editor-layout">
        <form id="catalogue" className="editor-main-col" onSubmit={(e) => void publish(e)}>
          <section className="box" aria-labelledby="gallery-title">
            <h2 id="gallery-title">{t.galleryTitle}</h2>
            <div className="editor-grid">
              <label>{t.name}<input dir="ltr" value={draft.name} onChange={(e) => setField('name', e.target.value)} required /></label>
              <label>{t.nameFa}<input dir="rtl" value={draft.nameFa} onChange={(e) => setField('nameFa', e.target.value)} /></label>
              <div className="span-2">
                <ImageField
                  gallery={initialRecord.slug}
                  label={t.logo}
                  value={draft.logo ?? ''}
                  onChange={(url) => setField('logo', url || null)}
                  onError={setError}
                />
              </div>
            </div>
          </section>

          <section className="box" aria-labelledby="show-title">
            <h2 id="show-title">{t.showTitleGroup}</h2>
            <div className="editor-grid">
              <label>{t.showTitle}<input dir="ltr" value={draft.showTitle} onChange={(e) => setField('showTitle', e.target.value)} /></label>
              <label>{t.showTitleFa}<input dir="rtl" value={draft.showTitleFa} onChange={(e) => setField('showTitleFa', e.target.value)} /></label>
              <label>{t.dates}<input dir="ltr" value={draft.dates} onChange={(e) => setField('dates', e.target.value)} /></label>
              <label>{t.datesFa}<input dir="rtl" value={draft.datesFa} onChange={(e) => setField('datesFa', e.target.value)} /></label>
              <label>{t.hours}<input dir="ltr" value={draft.hours} onChange={(e) => setField('hours', e.target.value)} /></label>
              <label>{t.hoursFa}<input dir="rtl" value={draft.hoursFa} onChange={(e) => setField('hoursFa', e.target.value)} /></label>
              <label>{t.address}<input dir="ltr" value={draft.address} onChange={(e) => setField('address', e.target.value)} /></label>
              <label>{t.addressFa}<input dir="rtl" value={draft.addressFa} onChange={(e) => setField('addressFa', e.target.value)} /></label>
              <label className="span-2">{t.text}<textarea dir="ltr" value={draft.text} onChange={(e) => setField('text', e.target.value)} rows={4} /></label>
              <label className="span-2">{t.textFa}<textarea dir="rtl" value={draft.textFa} onChange={(e) => setField('textFa', e.target.value)} rows={4} /></label>
              <label className="span-2">{t.pdfUrl}<input dir="ltr" value={draft.pdfUrl ?? ''} placeholder="https://" onChange={(e) => setField('pdfUrl', e.target.value || null)} /></label>
            </div>
          </section>

          <section className="box" aria-labelledby="works-title">
            <div className="row between wrap gap">
              <h2 id="works-title">{t.worksTitle}</h2>
              <div className="row gap wrap">
                <button className="btn btn-outline small-btn" type="button" onClick={() => addWork(true)}>{t.addSample}</button>
                <button className="btn btn-quiet small-btn" type="button" onClick={() => addWork(false)}>{t.addWork}</button>
              </div>
            </div>
            <p className="muted small">{t.sampleRule}</p>
            {draft.works.length === 0 && <p className="muted">{t.noWorks}</p>}
            {draft.works.map((work, index) => {
              const priceId = `price-${work.id}`
              const badPrice = badPrices.has(work.id)
              return (
                <fieldset key={work.id} className="work-edit">
                  <legend>
                    <span className="work-index">{format.number(index + 1)}</span>
                    {work.title || t.workFallback}
                  </legend>
                  <div className="work-edit-body">
                    <ImageField
                      gallery={initialRecord.slug}
                      label={t.image}
                      value={work.image}
                      onChange={(url) => updateWork(work.id, { image: url })}
                      onError={setError}
                    />
                    <div className="editor-grid">
                      <label>{t.title}<input dir="ltr" value={work.title} onChange={(e) => updateWork(work.id, { title: e.target.value })} /></label>
                      <label>{t.titleFa}<input dir="rtl" value={work.titleFa ?? ''} onChange={(e) => updateWork(work.id, { titleFa: e.target.value })} /></label>
                      <label>{t.artist}<input dir="ltr" value={work.artist} onChange={(e) => updateWork(work.id, { artist: e.target.value })} /></label>
                      <label>{t.artistFa}<input dir="rtl" value={work.artistFa ?? ''} onChange={(e) => updateWork(work.id, { artistFa: e.target.value })} /></label>
                      <label>{t.medium}<input dir="ltr" value={work.medium} onChange={(e) => updateWork(work.id, { medium: e.target.value })} /></label>
                      <label>{t.mediumFa}<input dir="rtl" value={work.mediumFa ?? ''} onChange={(e) => updateWork(work.id, { mediumFa: e.target.value })} /></label>
                      <label>{t.size}<input dir="auto" value={work.size} onChange={(e) => updateWork(work.id, { size: e.target.value })} /></label>
                      <label>{t.year}<input dir="auto" value={work.year} onChange={(e) => updateWork(work.id, { year: e.target.value })} /></label>
                      <label htmlFor={priceId}>{t.price}
                        <input
                          id={priceId}
                          inputMode="numeric"
                          dir="ltr"
                          value={prices[work.id] ?? priceText(work.price)}
                          aria-invalid={badPrice || undefined}
                          aria-describedby={`${priceId}-hint`}
                          onChange={(e) => {
                            const raw = e.target.value
                            setPrices((current) => ({ ...current, [work.id]: raw }))
                            const parsed = parseToman(raw)
                            if (parsed !== 'invalid') updateWork(work.id, { price: parsed })
                          }}
                        />
                        <span id={`${priceId}-hint`} className={badPrice ? 'error tiny' : 'muted tiny'}>{t.priceHint}</span>
                      </label>
                      <label>{t.status}
                        <select value={work.status} onChange={(e) => updateWork(work.id, { status: e.target.value as PilotWork['status'] })}>
                          <option value="available">{t.available}</option>
                          <option value="reserved">{t.reserved}</option>
                          <option value="sold">{t.sold}</option>
                        </select>
                      </label>
                      <label className="check-line">
                        <input type="checkbox" checked={work.sample} onChange={(e) => updateWork(work.id, { sample: e.target.checked })} />
                        {t.sampleCheck}
                      </label>
                    </div>
                  </div>
                  <button className="btn-text" type="button" onClick={() => removeWork(work.id)}>{t.removeWork}</button>
                </fieldset>
              )
            })}
          </section>

          <section className="editor-publish" aria-labelledby="publish-title">
            <div className="publish-state">
              <h2 id="publish-title" className="sr-only">{t.publishTitle}</h2>
              {error ? (
                <p className="error" role="alert">{error}</p>
              ) : message && !dirty ? (
                <p role="status">{message}</p>
              ) : (
                <p className={dirty ? 'publish-dirty small' : 'muted small'}>{dirty ? t.unsaved : t.allSaved}</p>
              )}
              <p className="muted tiny">{t.publishNote}</p>
            </div>
            <button className={`btn btn-primary${publishing ? ' is-loading' : ''}`} type="submit" disabled={publishing} aria-busy={publishing || undefined}>
              {t.publish}
            </button>
          </section>
        </form>

        <aside className="editor-preview-col box" aria-labelledby="gallery-preview-title">
          <div className="row between wrap gap">
            <h2 id="gallery-preview-title">{t.preview}</h2>
            <div className="lang" role="group" aria-label={t.previewLanguage}>
              <button type="button" aria-pressed={previewLang === 'fa'} onClick={() => setPreviewLang('fa')} lang="fa">فا</button>
              <button type="button" aria-pressed={previewLang === 'en'} onClick={() => setPreviewLang('en')} lang="en">EN</button>
            </div>
          </div>
          <div className={`phone-preview ${previewLang === 'fa' ? 'fa' : ''}`} dir={previewLang === 'fa' ? 'rtl' : 'ltr'} lang={previewLang}>
            <OLandingPreview record={draft} lang={previewLang} />
          </div>
        </aside>
      </div>}
    </div>
  )
}
