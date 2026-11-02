import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '../../components/EmptyState'
import { useSignIn } from '../../components/VisitorShell'
import { useT } from '../../lib/i18n'
import { CONSENT_TEXT_VERSION } from '../../lib/consent'
import { formatDateRange, formatNumber, formatSize, formatToman, localDigits } from '../../lib/format'
import { oCopy, pick, recordWorkView, reportLead, type PilotRecord, type PilotStatus, type PilotWork } from '../../lib/pilot'
import { useVisitor, visitor } from '../../lib/store'

type Lang = 'en' | 'fa'
type Filter = 'all' | PilotStatus

const FILTERS: Filter[] = ['all', 'available', 'reserved', 'sold']

function showTitle(record: PilotRecord, lang: Lang) {
  return pick(lang, record.showTitle, record.showTitleFa)
}

export function showDates(record: PilotRecord, lang: Lang) {
  return formatDateRange(lang, record.startsOn, record.endsOn) || pick(lang, record.dates, record.datesFa)
}

export function workText(work: PilotWork, lang: Lang) {
  return {
    title: pick(lang, work.title, work.titleFa ?? ''),
    artist: pick(lang, work.artist, work.artistFa ?? ''),
    medium: pick(lang, work.medium, work.mediumFa ?? ''),
    size: localDigits(lang, work.size),
    year: localDigits(lang, work.year),
  }
}

function coverWork(record: PilotRecord): PilotWork | undefined {
  return record.works.find((work) => !work.sample && work.image) ?? record.works.find((work) => work.image)
}

export function WorkImage({
  work,
  alt,
  sizes,
  priority = false,
}: {
  work: PilotWork
  alt: string
  sizes: string
  priority?: boolean
}) {
  const set = work.imageSet
  const img = (
    <img
      src={work.image}
      srcSet={set?.jpeg || undefined}
      sizes={set?.jpeg ? sizes : undefined}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      {...(priority ? { fetchPriority: 'high' as const } : {})}
    />
  )
  if (!set?.webp) return img
  return (
    <picture>
      <source type="image/webp" srcSet={set.webp} sizes={sizes} />
      {img}
    </picture>
  )
}

function StatusLabel({ status }: { status: PilotStatus }) {
  const { t } = useT()
  return <span className={`status s-${status}`}>{t[status]}</span>
}

function OLanding({ record, preview = false, lang }: { record: PilotRecord, preview?: boolean, lang?: 'en' | 'fa' }) {
  const ui = useT()
  const language = lang ?? ui.lang
  const copy = oCopy(language)
  const title = showTitle(record, language)
  const dates = showDates(record, language)
  const hours = pick(language, record.hours, record.hoursFa)
  const realWorks = record.works.filter((work) => !work.sample)
  const empty = realWorks.length === 0

  const brand = pick(language, record.name, record.nameFa)
  const cover = preview ? undefined : coverWork(record)
  const ShowHeading = preview ? 'h2' : 'h1'
  const initial = (language === 'fa' ? (record.nameFa || record.name) : (record.name || record.nameFa)).trim().slice(0, 1) || 'O'

  return (
    <div className="welcome o-landing">
      <div className="pad intro reveal">
        <p className="eyebrow">{copy.currentShow}</p>
        {title ? (
          <>
            <ShowHeading className="show-title">{title}</ShowHeading>
            <span className="ink-rule" aria-hidden />
            {empty && <p className="muted">{copy.emptyBody}</p>}
          </>
        ) : (
          <>
            <ShowHeading className="show-title">{brand}</ShowHeading>
            <span className="ink-rule" aria-hidden />
            {empty && <p className="show-kind">{copy.emptyBody}</p>}
          </>
        )}
        {(dates || hours) && <p className="muted small">{[dates, hours].filter(Boolean).join(' · ')}</p>}
        <div className="o-actions">
          {preview ? (
            <>
              <span className="btn btn-primary wide">{copy.seeWorks}</span>
              <span className="btn btn-outline wide">{copy.priceList}</span>
              {record.pdfUrl && <span className="btn btn-outline wide">{copy.downloadPdf}</span>}
            </>
          ) : (
            <>
              <Link className="btn btn-primary wide" to={`/g/${record.slug}/works`}>{copy.seeWorks}</Link>
              <Link className="btn btn-outline wide" to={`/g/${record.slug}/prices`}>{copy.priceList}</Link>
              {record.pdfUrl && <a className="btn btn-outline wide" href={record.pdfUrl}>{copy.downloadPdf}</a>}
            </>
          )}
        </div>
      </div>
      {cover && (
        <figure className="o-cover">
          <WorkImage
            work={cover}
            alt={workText(cover, language).title}
            sizes="(min-width: 960px) 55vw, 100vw"
            priority
          />
          <figcaption>
            <span>{workText(cover, language).artist || brand}</span>
            <span className="o-cover-meta">{copy.worksCount(formatNumber(language, realWorks.length || record.works.length))}</span>
          </figcaption>
        </figure>
      )}
      {!preview && !cover && (
        <aside className="o-atmosphere" aria-hidden>
          <span className="o-atmosphere-mark">{initial}</span>
          <span className="o-atmosphere-label">{brand}</span>
        </aside>
      )}
    </div>
  )
}

export function OWelcome({ record }: { record: PilotRecord }) {
  return <OLanding record={record} />
}

export function OLandingPreview({ record, lang }: { record: PilotRecord, lang: 'en' | 'fa' }) {
  return <OLanding record={record} preview lang={lang} />
}

function WorkPrice({ work }: { work: PilotWork }) {
  const { t, lang } = useT()
  if (work.status === 'sold') return t.sold
  if (work.price == null) return t.priceOnRequest
  return formatToman(lang, work.price, t.toman)
}

function WorkList({ works, slug }: { works: PilotWork[]; slug: string }) {
  const { lang, t } = useT()
  if (works.length === 0) return null
  return (
    <ol className="price-list">
      {works.map((work) => {
        const text = workText(work, lang)
        return (
          <li key={work.id}>
            <Link to={`/g/${slug}/works/${work.id}`} title={text.title}>
              {work.image ? <WorkImage work={work} alt={text.title} sizes="(min-width: 960px) 64px, 72px" /> : <span className="pl-fallback" aria-hidden />}
              <span className="pl-text">
                <strong dir="auto" className="bidi-plain">{text.title}</strong>
                <span className="pl-artist" dir="auto">{text.artist}</span>
                <span className="pl-meta">
                  <bdi>{text.medium}</bdi>{text.medium && work.size ? ' · ' : ''}
                  <bdi dir="ltr">{formatSize(lang, work.size)}</bdi>{(text.medium || work.size) && text.year ? ' · ' : ''}
                  <bdi>{text.year}</bdi>
                </span>
              </span>
              <span className={`pl-price${work.status === 'sold' ? ' pl-sold' : ''}`}>
                <span className="pl-amount">{work.price == null ? (work.status === 'sold' ? t.sold : t.priceOnRequest) : formatNumber(lang, work.price)}</span>
                <StatusLabel status={work.status} />
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

function WorkWall({
  works,
  slug,
  galleryName,
  firstPriority = false,
}: {
  works: PilotWork[]
  slug: string
  galleryName: string
  firstPriority?: boolean
}) {
  const { lang } = useT()
  const copy = oCopy(lang, galleryName)
  if (works.length === 0) return null
  return (
    <div className="grid o-wall">
      {works.map((work, index) => {
        const text = workText(work, lang)
        const showTitleLine = text.title && text.title !== text.artist
        const meta = [showTitleLine ? text.title : '', text.medium, text.size].filter(Boolean)
        return (
          <article key={work.id} className="card">
            <Link to={`/g/${slug}/works/${work.id}`} className="card-img" title={text.title}>
              {work.image
                ? <WorkImage work={work} alt="" sizes="(min-width: 960px) 30vw, 50vw" priority={firstPriority && index === 0} />
                : <span className="pl-fallback wall-fallback" aria-hidden />}
            </Link>
            <Link to={`/g/${slug}/works/${work.id}`} className="label">
              <span className="label-artist" dir="auto">{text.artist || text.title}</span>
              <span className="label-meta">
                {meta.length === 0 ? '—' : meta.map((part, i) => (
                  <span key={i}>{i > 0 ? ' · ' : null}<bdi className="bidi-plain">{part}</bdi></span>
                ))}
              </span>
              <span className="label-row">
                {work.status !== 'sold' && <span className="label-price"><WorkPrice work={work} /></span>}
                <StatusLabel status={work.status} />
              </span>
              {work.sample && <span className="sample-note">{copy.sampleBanner}</span>}
            </Link>
          </article>
        )
      })}
    </div>
  )
}

export function OWorks({ record }: { record: PilotRecord }) {
  const { lang, t } = useT()
  const copy = oCopy(lang)
  const [filter, setFilter] = useState<Filter>('all')
  const matches = (work: PilotWork) => filter === 'all' || work.status === filter
  const allReal = record.works.filter((work) => !work.sample)
  const real = allReal.filter(matches)
  const samples = record.works.filter((work) => work.sample).filter(matches)
  const count = (value: Filter) =>
    value === 'all' ? allReal.length : allReal.filter((work) => work.status === value).length
  const title = showTitle(record, lang)
  const name = pick(lang, record.name, record.nameFa)

  if (record.works.length === 0) {
    return (
      <EmptyState
        title={name}
        body={copy.emptyBody}
        action={<Link className="btn btn-outline" to={`/g/${record.slug}`}>{copy.currentShow}</Link>}
      />
    )
  }

  return (
    <div className="reveal">
      <div className="pad">
        <p className="eyebrow">{copy.worksTitle}</p>
        <h1 className="page-title">{title || copy.worksTitle}</h1>
        <span className="ink-rule" aria-hidden />
        {allReal.length === 0 && <p className="muted">{copy.emptyBody}</p>}
      </div>
      {allReal.length > 0 && (
        <div className="chips" role="group" aria-label={copy.filterLabel}>
          {FILTERS.map((value) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {value === 'all' ? copy.filterAll : t[value]} <span className="chip-count">{formatNumber(lang, count(value))}</span>
            </button>
          ))}
        </div>
      )}
      {allReal.length > 0 && real.length === 0 && (
        <div className="pad o-no-match">
          <p className="muted" role="status">{copy.noMatch}</p>
          <button type="button" className="btn btn-outline" onClick={() => setFilter('all')}>{copy.showAll}</button>
        </div>
      )}
      <WorkWall works={real} slug={record.slug} galleryName={name} firstPriority />
      {samples.length > 0 && (
        <section>
          <div className="pad">
            <h2 className="section-title">{copy.samplesTitle}</h2>
          </div>
          <WorkWall works={samples} slug={record.slug} galleryName={name} />
        </section>
      )}
    </div>
  )
}

export function OPrices({ record }: { record: PilotRecord }) {
  const { t, lang } = useT()
  const copy = oCopy(lang)
  const title = showTitle(record, lang)
  const name = pick(lang, record.name, record.nameFa)

  if (record.works.length === 0) {
    return (
      <EmptyState
        title={name}
        body={copy.emptyBody}
        action={<Link className="btn btn-outline" to={`/g/${record.slug}/works`}>{copy.seeWorks}</Link>}
      />
    )
  }

  return (
    <div className="pad prices reveal">
      {(record.demo || record.works.some((work) => work.sample)) && (
        <p className="demo-banner" role="note">{record.demo ? copy.demoNote : t.samplePricesNote}</p>
      )}
      <p className="eyebrow">{name}</p>
      <h1 className="page-title">{t.priceList}</h1>
      <span className="ink-rule" aria-hidden />
      {title ? <p className="prices-subtitle">{title}</p> : null}
      <p className="small">{t.allPricesToman}</p>
      <WorkList works={record.works} slug={record.slug} />
      {record.pdfUrl && (
        <a className="btn btn-outline pdf-action" href={record.pdfUrl} download>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></svg>
          {copy.downloadPdf}
        </a>
      )}
    </div>
  )
}

export function OWork({ work, record }: { work: PilotWork; record: PilotRecord }) {
  const { t, lang } = useT()
  const copy = oCopy(lang, pick(lang, record.name, record.nameFa))
  const slug = record.slug
  const { saved, phone, consentVersion } = useVisitor()
  const { requireSignIn } = useSignIn()
  const [asked, setAsked] = useState(false)
  const workId = work.id

  useEffect(() => {
    recordWorkView(slug, workId)
  }, [slug, workId])

  const isSaved = saved.includes(work.id)
  const text = workText(work, lang)
  return (
    <div className="work">
      <div className="pad row between">
        <Link className="btn-text inline" to={`/g/${slug}/works`}>{t.back}</Link>
      </div>
      {work.image && (
        <figure className="work-figure">
          <WorkImage work={work} alt={text.title} sizes="(min-width: 960px) 60vw, 100vw" priority />
        </figure>
      )}
      <div className="pad wall-label reveal">
        {work.sample && <p className="sample-note">{copy.sampleBanner}</p>}
        {text.artist ? (
          <>
            <h1 className="work-artist" dir="auto">{text.artist}</h1>
            <span className="ink-rule" aria-hidden />
            <p className="work-title">
              <bdi className="bidi-plain">{text.title}</bdi>
              {text.year ? <>, <bdi className="bidi-plain">{text.year}</bdi></> : null}
            </p>
          </>
        ) : (
          <>
            <h1 className="work-artist" dir="auto">
              <bdi className="bidi-plain">{text.title}</bdi>
            </h1>
            <span className="ink-rule" aria-hidden />
            {text.year ? <p className="work-title"><bdi className="bidi-plain">{text.year}</bdi></p> : null}
          </>
        )}
        {(text.medium || text.size) && (
          <p className="muted">
            {text.medium ? <bdi className="bidi-plain">{text.medium}</bdi> : null}
            {text.medium && text.size ? ', ' : null}
            {text.size ? <bdi className="bidi-plain">{text.size}</bdi> : null}
          </p>
        )}
        <div className="row between price-row">
          {work.status !== 'sold' && <span className="work-price"><WorkPrice work={work} /></span>}
          <StatusLabel status={work.status} />
        </div>
      </div>
      <div className="pad actions">
        <button
          className={`btn ${isSaved ? 'btn-quiet' : 'btn-primary'}`}
          aria-pressed={isSaved}
          onClick={() => {
            if (isSaved) visitor.toggleSaved(work.id)
            else if (phone && consentVersion === CONSENT_TEXT_VERSION) { visitor.save(work.id); reportLead(slug, phone, 'save', work.id) }
            else requireSignIn('save', () => visitor.save(work.id), text.title, work.id)
          }}>
          {isSaved ? t.saved : t.save}
        </button>
        {work.status !== 'sold' && (
          <button className="btn btn-outline" disabled={asked}
            onClick={() => {
              if (phone && consentVersion === CONSENT_TEXT_VERSION) { setAsked(true); reportLead(slug, phone, 'ask', work.id) }
              else requireSignIn('ask', () => setAsked(true), text.title, work.id)
            }}>
            {asked ? t.asked : t.ask}
          </button>
        )}
      </div>
    </div>
  )
}

export function OAbout({ record }: { record: PilotRecord }) {
  const { lang, t } = useT()
  const copy = oCopy(lang)
  const text = pick(lang, record.text, record.textFa)
  const address = pick(lang, record.address, record.addressFa)
  const hours = pick(lang, record.hours, record.hoursFa)
  const artists = artistCounts(record.works.filter((work) => !work.sample), lang)
  return (
    <div className="pad about reveal">
      <p className="eyebrow" style={record.slug === 'sample' ? { color: '#C9C2B4' } : undefined}>{copy.currentShow}</p>
      <h1 className="page-title">{pick(lang, record.name, record.nameFa)}</h1>
      <span className="ink-rule" aria-hidden />
      {text ? <p className="reading">{text}</p> : <p className="muted">{copy.emptyNote}</p>}
      {artists.length > 0 && (
        <section id="artists" aria-labelledby="artists-title">
          <h2 className="section-title" id="artists-title">{copy.artistsTitle}</h2>
          <ul className="artist-list">
            {artists.map((artist) => (
              <li key={artist.name}>
                <bdi className="bidi-plain">{artist.name}</bdi>
                <span className="muted small">{copy.worksCount(formatNumber(lang, artist.count))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
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

export function artistCounts(works: PilotWork[], lang: Lang): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const work of works) {
    const name = workText(work, lang).artist.trim()
    if (!name) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, lang === 'fa' ? 'fa' : 'en'))
}
