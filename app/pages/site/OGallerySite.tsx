import { useEffect } from 'react'
import { Link } from 'react-router'
import { LangSwitch } from '../../components/LangSwitch'
import { useT } from '../../lib/i18n'
import { oCopy, pick, type PilotRecord, type PilotWork } from '../../lib/pilot'

export default function OGallerySite({ record }: { record: PilotRecord }) {
  const { t, lang, dir } = useT()
  const name = pick(lang, record.name, record.nameFa)
  const copy = oCopy(lang, name)
  const title = pick(lang, record.showTitle, record.showTitleFa)
  const dates = pick(lang, record.dates, record.datesFa)
  const text = pick(lang, record.text, record.textFa)
  const address = pick(lang, record.address, record.addressFa)
  const hours = pick(lang, record.hours, record.hoursFa)
  const real = record.works.filter((work) => !work.sample)
  const samples = record.works.filter((work) => work.sample)

  useEffect(() => {
    document.title = title ? `${name}: ${title}` : name
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [name, title, lang, dir])

  return (
    <div className={`site o-site ${lang === 'fa' ? 'fa' : ''}`} dir={dir}>
      {record.demo && <p className="demo-banner" role="note"><strong>{copy.demoLabel}</strong> {copy.demoNote}</p>}
      <header className="site-top">
        {record.logo
          ? <img className="o-site-logo" src={record.logo} alt={name} />
          : <span className="site-brand">{name}</span>}
        <div className="row gap wrap">
          <nav aria-label={t.siteNav}>
            <a href="#works">{copy.seeWorks}</a>
            <Link to={`/g/${record.slug}/prices`}>{copy.priceList}</Link>
          </nav>
          <LangSwitch />
        </div>
      </header>
      <main>
        <section className="o-site-intro" id="current">
          <p className="muted">{copy.currentShow}{dates ? `, ${dates}` : ''}</p>
          <h1>{title || name}</h1>
          {real.length === 0 && <p className="site-lead">{copy.emptyBody}</p>}
          {text && <p className="site-lead">{text}</p>}
          <div className="row gap wrap">
            <Link className="btn btn-primary" to={`/g/${record.slug}/works`}>{copy.seeWorks}</Link>
            <Link className="btn btn-outline" to={`/g/${record.slug}/prices`}>{copy.priceList}</Link>
            {record.pdfUrl && <a className="btn btn-outline" href={record.pdfUrl}>{copy.downloadPdf}</a>}
          </div>
        </section>
        <section className="site-section" id="works">
          {real.length > 0 && (
            <>
              <h2>{copy.worksTitle}</h2>
              <WorkGrid works={real} lang={lang} slug={record.slug} galleryName={name} />
            </>
          )}
          {samples.length > 0 && (
            <>
              <h2>{copy.samplesTitle}</h2>
              <p className="sample-note">{copy.sampleBanner}</p>
              <WorkGrid works={samples} lang={lang} slug={record.slug} galleryName={name} />
            </>
          )}
        </section>
      </main>
      <footer className="site-foot" id="visit">
        <div>
          <p className="site-brand light">{name}</p>
          {(address || hours) && <p>{[address, hours].filter(Boolean).join(' · ')}</p>}
        </div>
      </footer>
    </div>
  )
}

function WorkGrid({ works, lang, slug, galleryName }: { works: PilotWork[], lang: 'en' | 'fa', slug: string, galleryName: string }) {
  const { n, t } = useT()
  const copy = oCopy(lang, galleryName)
  return (
    <div className="site-grid">
      {works.map((work) => (
        <Link key={work.id} to={`/g/${slug}/works/${work.id}`} className="site-card link">
          {work.image && <img src={work.image} alt="" />}
          <h3>{work.title}</h3>
          <p className="muted small">{[work.artist, work.medium, work.size].filter(Boolean).join(' · ') || '—'}</p>
          {work.sample && <p className="sample-note">{copy.sampleBanner}</p>}
          <p className="small"><strong>{work.status === 'sold' ? t.sold : work.price == null ? t.priceOnRequest : `${n(work.price)} ${t.toman}`}</strong></p>
        </Link>
      ))}
    </div>
  )
}
