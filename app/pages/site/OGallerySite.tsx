import { useEffect } from 'react'
import { Link } from 'react-router'
import { useT } from '../../lib/i18n'
import { oCopy, pick, type PilotRecord, type PilotWork } from '../../lib/pilot'

export default function OGallerySite({ record }: { record: PilotRecord }) {
  const { lang, dir } = useT()
  const copy = oCopy(lang)
  const name = pick(lang, record.name, record.nameFa)
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
      <header className="site-top">
        {record.logo
          ? <img className="o-site-logo" src={record.logo} alt={name} />
          : <span className="site-brand">{name}</span>}
        <nav aria-label="Website">
          <a href="#works">{copy.seeWorks}</a>
          <Link to="/g/o-gallery/prices">{copy.priceList}</Link>
        </nav>
      </header>
      <main>
        <section className="o-site-intro" id="current">
          <p className="muted">{copy.currentShow}{dates ? `, ${dates}` : ''}</p>
          <h1>{title || copy.catalogue}</h1>
          {title && real.length === 0 && <p className="site-lead">{copy.catalogue}</p>}
          {text && <p className="site-lead">{text}</p>}
          <div className="row gap wrap">
            <Link className="btn btn-primary" to="/g/o-gallery/works">{copy.seeWorks}</Link>
            <Link className="btn btn-outline" to="/g/o-gallery/prices">{copy.priceList}</Link>
            {record.pdfUrl && <a className="btn btn-outline" href={record.pdfUrl}>{copy.downloadPdf}</a>}
          </div>
        </section>
        <section className="site-section" id="works">
          {real.length === 0 && samples.length === 0 && <p>{copy.catalogue}</p>}
          {real.length > 0 && (
            <>
              <h2>{copy.worksTitle}</h2>
              <WorkGrid works={real} lang={lang} />
            </>
          )}
          {samples.length > 0 && (
            <>
              <h2>{copy.samplesTitle}</h2>
              <p className="sample-note">{copy.sampleBanner}</p>
              <WorkGrid works={samples} lang={lang} />
            </>
          )}
        </section>
      </main>
      <footer className="site-foot" id="visit">
        <div>
          <p className="site-brand light">{name}</p>
          {(address || hours) && <p>{[address, hours].filter(Boolean).join(' · ')}</p>}
        </div>
        <p className="site-made">/site/o-gallery · Website by Inview</p>
      </footer>
    </div>
  )
}

function WorkGrid({ works, lang }: { works: PilotWork[], lang: 'en' | 'fa' }) {
  const { n, t } = useT()
  const copy = oCopy(lang)
  return (
    <div className="site-grid">
      {works.map((work) => (
        <Link key={work.id} to={`/g/o-gallery/works/${work.id}`} className="site-card link">
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
