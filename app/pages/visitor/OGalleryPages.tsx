import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { EmptyState } from '../../components/EmptyState'
import { useSignIn } from '../../components/VisitorShell'
import { useT } from '../../lib/i18n'
import { oCopy, pick, recordWorkView, reportLead, usePilotRecord, type PilotRecord, type PilotWork } from '../../lib/pilot'
import { useVisitor, visitor } from '../../lib/store'

function showTitle(record: PilotRecord, lang: 'en' | 'fa') {
  return pick(lang, record.showTitle, record.showTitleFa)
}

function OLanding({ record, preview = false, lang }: { record: PilotRecord, preview?: boolean, lang?: 'en' | 'fa' }) {
  const ui = useT()
  const language = lang ?? ui.lang
  const copy = oCopy(language)
  const title = showTitle(record, language)
  const dates = pick(language, record.dates, record.datesFa)
  const hours = pick(language, record.hours, record.hoursFa)
  const realWorks = record.works.filter((work) => !work.sample)
  const empty = !title && realWorks.length === 0

  const brand = pick(language, record.name, record.nameFa)
  const initial = (language === 'fa' ? (record.nameFa || record.name) : (record.name || record.nameFa)).trim().slice(0, 1) || 'O'

  return (
    <div className="welcome o-landing">
      <div className="pad intro reveal">
        <p className="eyebrow">{copy.currentShow}</p>
        {title ? (
          <>
            <h1 className="show-title">{title}</h1>
            <span className="ink-rule" aria-hidden />
            {realWorks.length === 0 && <p className="muted">{copy.catalogue}</p>}
          </>
        ) : (
          <>
            <h1 className="show-title">{brand}</h1>
            <span className="ink-rule" aria-hidden />
            <p className="show-kind">{copy.catalogue}</p>
          </>
        )}
        {(dates || hours) && <p className="muted small">{[dates, hours].filter(Boolean).join(' · ')}</p>}
        {empty && !preview && (
          <p className="muted small">{language === 'fa' ? 'به‌زودی فهرست آثار اینجا می‌آید.' : 'The catalogue will appear here soon.'}</p>
        )}
        <div className="o-actions">
          {preview ? (
            <>
              <span className="btn btn-primary wide">{copy.seeWorks}</span>
              <span className="btn btn-outline wide">{copy.priceList}</span>
              {record.pdfUrl && <span className="btn btn-outline wide">{copy.downloadPdf}</span>}
            </>
          ) : (
            <>
              <Link className="btn btn-primary wide" to="/g/o-gallery/works">{copy.seeWorks}</Link>
              <Link className="btn btn-outline wide" to="/g/o-gallery/prices">{copy.priceList}</Link>
              {record.pdfUrl && <a className="btn btn-outline wide" href={record.pdfUrl}>{copy.downloadPdf}</a>}
            </>
          )}
        </div>
      </div>
      {!preview && (
        <aside className="o-atmosphere" aria-hidden>
          <span className="o-atmosphere-mark">{initial}</span>
          <span className="o-atmosphere-label">{brand}</span>
        </aside>
      )}
    </div>
  )
}

export function OWelcome() {
  const { record } = usePilotRecord(true)
  return <OLanding record={record} />
}

export function OLandingPreview({ record, lang }: { record: PilotRecord, lang: 'en' | 'fa' }) {
  return <OLanding record={record} preview lang={lang} />
}

function WorkPrice({ work }: { work: PilotWork }) {
  const { t, n } = useT()
  if (work.status === 'sold') return t.sold
  if (work.price == null) return t.priceOnRequest
  return `${n(work.price)} ${t.toman}`
}

function WorkList({ works }: { works: PilotWork[] }) {
  const { lang } = useT()
  const copy = oCopy(lang)
  if (works.length === 0) return null
  return (
    <ol className="price-list">
      {works.map((work, index) => (
        <li key={work.id}>
          <Link to={`/g/o-gallery/works/${work.id}`} title={work.title}>
            <span className="pl-num" aria-hidden>{index + 1}</span>
            {work.image ? <img src={work.image} alt="" loading="lazy" /> : <span className="pl-fallback" aria-hidden />}
            <span className="pl-text">
              <strong>{work.title}</strong>
              <span className="muted small">{[work.artist, work.medium, work.size].filter(Boolean).join(' · ') || '—'}</span>
              {work.sample && <span className="sample-note">{copy.sampleBanner}</span>}
            </span>
            <span className="pl-price"><WorkPrice work={work} /></span>
          </Link>
        </li>
      ))}
    </ol>
  )
}

export function OWorks() {
  const { lang } = useT()
  const copy = oCopy(lang)
  const { record, ready } = usePilotRecord(true)
  const real = record.works.filter((work) => !work.sample)
  const samples = record.works.filter((work) => work.sample)
  const title = showTitle(record, lang)

  if (ready && real.length === 0 && samples.length === 0) {
    return (
      <EmptyState
        title={copy.catalogue}
        body={lang === 'fa' ? 'گالری هنوز اثری منتشر نکرده است.' : 'The gallery has not published works yet.'}
        action={<Link className="btn btn-outline" to="/g/o-gallery">{copy.currentShow}</Link>}
      />
    )
  }

  return (
    <div className="pad reveal">
      <p className="eyebrow">{copy.worksTitle}</p>
      <h1 className="page-title">{title || copy.worksTitle}</h1>
      <span className="ink-rule" aria-hidden />
      {real.length === 0 && <p className="muted">{copy.catalogue}</p>}
      <WorkList works={real} />
      {samples.length > 0 && (
        <section>
          <h2 className="section-title">{copy.samplesTitle}</h2>
          <WorkList works={samples} />
        </section>
      )}
    </div>
  )
}

export function OPrices() {
  const { t, lang } = useT()
  const copy = oCopy(lang)
  const { record, ready } = usePilotRecord(true)
  const title = showTitle(record, lang)
  const name = pick(lang, record.name, record.nameFa)

  if (ready && record.works.length === 0) {
    return (
      <EmptyState
        title={copy.catalogue}
        body={lang === 'fa' ? 'فهرست قیمت وقتی آثار بارگذاری شوند آماده است.' : 'The price list is ready when works are loaded.'}
        action={<Link className="btn btn-outline" to="/g/o-gallery/works">{copy.seeWorks}</Link>}
      />
    )
  }

  return (
    <div className="pad prices reveal">
      <p className="eyebrow">{name}</p>
      <h1 className="page-title">{t.priceList}</h1>
      <span className="ink-rule" aria-hidden />
      <p className="muted small">{title || copy.catalogue}</p>
      <WorkList works={record.works} />
      {record.pdfUrl && <a className="btn btn-outline wide pdf-action" href={record.pdfUrl}>{copy.downloadPdf}</a>}
    </div>
  )
}

export function OWork() {
  const { id } = useParams()
  const { t, lang } = useT()
  const copy = oCopy(lang)
  const { record } = usePilotRecord(true)
  const { saved, phone } = useVisitor()
  const { requireSignIn } = useSignIn()
  const [asked, setAsked] = useState(false)
  const work = record.works.find((item) => item.id === id)
  const workId = work?.id

  useEffect(() => {
    if (workId) recordWorkView(workId)
  }, [workId])

  if (!work) {
    return (
      <EmptyState
        title={copy.catalogue}
        action={<Link className="btn btn-outline" to="/g/o-gallery/works">{copy.seeWorks}</Link>}
      />
    )
  }

  const isSaved = saved.includes(work.id)
  return (
    <div className="work">
      <div className="pad row between">
        <Link className="btn-text inline" to="/g/o-gallery/works">{t.back}</Link>
      </div>
      {work.image && (
        <figure className="work-figure">
          <img src={work.image} alt={work.title} />
        </figure>
      )}
      <div className="pad wall-label reveal">
        {work.sample && <p className="sample-note">{copy.sampleBanner}</p>}
        {work.artist && (
          <>
            <h1 className="work-artist">{work.artist}</h1>
            <span className="ink-rule" aria-hidden />
          </>
        )}
        <p className="work-title">{work.title}{work.year ? `, ${work.year}` : ''}</p>
        {(work.medium || work.size) && <p className="muted">{[work.medium, work.size].filter(Boolean).join(', ')}</p>}
        <p className="work-price"><WorkPrice work={work} /></p>
      </div>
      <div className="pad actions">
        <button
          className={`btn ${isSaved ? 'btn-quiet' : 'btn-primary'}`}
          aria-pressed={isSaved}
          onClick={() => {
            if (isSaved) visitor.toggleSaved(work.id)
            else if (phone) { visitor.save(work.id); reportLead(phone, 'save', work.id) }
            else requireSignIn('save', () => visitor.save(work.id), work.title)
          }}>
          {isSaved ? t.saved : t.save}
        </button>
        {work.status !== 'sold' && (
          <button className="btn btn-outline" disabled={asked}
            onClick={() => {
              if (phone) { setAsked(true); reportLead(phone, 'ask', work.id) }
              else requireSignIn('ask', () => setAsked(true), work.title)
            }}>
            {asked ? t.asked : t.ask}
          </button>
        )}
      </div>
    </div>
  )
}

export function OAbout() {
  const { lang, t } = useT()
  const { record } = usePilotRecord(true)
  const copy = oCopy(lang)
  const text = pick(lang, record.text, record.textFa)
  const address = pick(lang, record.address, record.addressFa)
  const hours = pick(lang, record.hours, record.hoursFa)
  return (
    <div className="pad about reveal">
      <p className="eyebrow">{copy.currentShow}</p>
      <h1 className="page-title">{pick(lang, record.name, record.nameFa)}</h1>
      <span className="ink-rule" aria-hidden />
      {text ? <p className="reading">{text}</p> : <p className="muted">{copy.catalogue}</p>}
      {(address || hours) && (
        <section id="visit">
          <h2 className="section-title">{t.visit}</h2>
          {address && <p>{address}</p>}
          {hours && <p>{hours}</p>}
        </section>
      )}
    </div>
  )
}
