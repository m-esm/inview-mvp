import { artworks, report } from '../../data/gallery'
import { Link } from 'react-router'
import { Lock } from '../../components/Icons'

const fmt = (v: number) => v.toLocaleString('en-US')
const millions = (v: number) => `${fmt(Math.round(v / 1_000_000))}M`

export function Overview() {
  const top = report.funnel[0].value
  const signedIn = report.funnel[2].value
  const sold = artworks.filter((a) => a.status === 'sold')
  const reserved = artworks.filter((a) => a.status === 'reserved').length
  const salesValue = sold.reduce((s, a) => s + a.price, 0)
  const maxDay = Math.max(...report.scansPerDay.map((d) => d.value))
  const fridayShare = Math.round((report.scansPerDay.filter((d) => d.friday).reduce((s, d) => s + d.value, 0) / report.scansPerDay.reduce((s, d) => s + d.value, 0)) * 100)
  const hot = artworks.find((a) => a.signal === 'hot')!
  const kpis = [
    ['Signed in', fmt(signedIn), `${Math.round((signedIn / top) * 100)}% of scanners`],
    ['Works saved', fmt(report.saves), `by ${report.funnel[3].value} people`],
    ['Inquiries', fmt(report.funnel[4].value), 'people asked about a work'],
    ['Works sold', `${sold.length} / ${artworks.length}`, `${reserved} reserved`],
    ['Sales value', millions(salesValue), 'Toman so far this show'],
  ]
  return (
    <>
      <section className="kpi-lead" aria-label="Show summary">
        <div className="kpi-main"><span className="muted small">Unique visitors scanned</span><strong>{fmt(top)}</strong><span className="muted tiny">Day {report.dayOf} of {report.days}</span></div>
        <dl className="kpi-row">
          {kpis.map(([l, v, s]) => (<div key={l}><dt className="muted small">{l}</dt><dd><strong>{v}</strong><span className="muted tiny">{s}</span></dd></div>))}
        </dl>
      </section>
      <div className="two">
        <section className="box">
          <h2>Visitor funnel</h2>
          <ul className="bars" role="list">
            {report.funnel.map((f) => {
              const pct = (f.value / top) * 100
              return (
                <li key={f.label}>
                  <span className="bar-label">{f.label}</span>
                  <span className="bar-track"><span className="bar pine" style={{ width: `${Math.max(pct, 1.5)}%` }} /></span>
                  <span className="bar-value"><strong>{fmt(f.value)}</strong> <span className="muted">{pct < 10 ? pct.toFixed(1) : Math.round(pct)}%</span></span>
                </li>
              )
            })}
          </ul>
        </section>
        <section className="box">
          <h2>Scans per day</h2>
          <div className="cols" role="img" aria-label={`Scans per day: ${report.scansPerDay.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
            {report.scansPerDay.map((d) => (
              <span key={d.label} className="col-wrap">
                <span className="col-value" aria-hidden>{d.value}</span>
                <span className={`col ${d.friday ? 'copper' : ''}`} style={{ height: `${(d.value / maxDay) * 100}%` }} />
                <span className="col-label">{d.label}</span>
              </span>
            ))}
          </div>
          <p className="small">Fridays brought {fridayShare}% of all scans so far.</p>
        </section>
      </div>
      <div className="steps">
        <div className="step">
          <span className="muted-inv small">Suggested next step</span>
          <p>{hot.saves} people saved {hot.artist}’s {hot.size.replace(' cm', '')} canvas ({millions(hot.price)} Toman) and it is still unsold. Message them before the show closes.</p>
          <span className="row gap wrap"><button type="button" className="btn btn-light" disabled aria-describedby="step-demo">Draft message</button><span id="step-demo" className="demo-tag">Demo</span></span>
        </div>
        <div className="step">
          <span className="muted-inv small">Suggested next step</span>
          <p>{report.funnel[4].value} people asked about a work. {report.leads.length} of them are ranked in your leads.</p>
          <Link className="btn btn-light" to="/dashboard/audience">Open leads</Link>
        </div>
      </div>
    </>
  )
}

const signalClass = { sold: 'sig-sold', hot: 'sig-hot', quiet: 'sig-quiet', low: 'sig-low' }

export function ArtworkInterest() {
  const sorted = [...artworks].sort((a, b) => b.saves - a.saves)
  const hot = artworks.filter((a) => a.signal === 'hot')
  const most = sorted[0]
  const entrance = report.sources[0]
  const label = report.sources[1]
  return (
    <>
      <div className="kpis three">
        <div className="kpi"><span className="muted small">Most saved</span><strong className="kpi-name">{most.title ? `${most.title}, ` : ''}{most.artist}</strong><span className="muted tiny">{most.saves} saves, {most.signalText.toLowerCase()}</span></div>
        <div className="kpi warm"><span className="small">High interest, still unsold</span><strong>{hot.length} works</strong><span className="tiny">{hot.reduce((s, a) => s + a.saves, 0)} saves, {millions(hot.reduce((s, a) => s + a.price, 0))} Toman open value</span></div>
        <div className="kpi"><span className="muted small">Scans from label QR codes</span><strong>{label.share}%</strong><span className="muted tiny">vs {entrance.share}% from the entrance QR code</span></div>
      </div>
      <div className="box flush scroll-x" tabIndex={0} role="region" aria-label="Artwork interest table">
        <table>
          <thead><tr><th>Work</th><th className="num">Price (Toman)</th><th className="num">Views</th><th className="num">Avg. time</th><th className="num">Saves</th><th className="num">Inquiries</th><th>Status</th><th>Signal</th></tr></thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a.id}>
                <td><span className="work-cell"><img src={a.image} alt="" /><span><strong>{a.artist}</strong><span className="muted small">{a.title ? `${a.title}, ` : ''}{a.medium}, {a.size}</span></span></span></td>
                <td className="num">{fmt(a.price)}</td>
                <td className="num">{a.views}</td>
                <td className="num">{a.avgTime}</td>
                <td className="num"><strong>{a.saves}</strong></td>
                <td className="num">{a.inquiries}</td>
                <td className={`st-${a.status}`}>{a.status[0].toUpperCase() + a.status.slice(1)}</td>
                <td><span className={`sig ${signalClass[a.signal]}`}>{a.signalText}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function Audience() {
  return (
    <>
      <div className="two">
        <section className="box">
          <h2>Who came</h2>
          <ul className="bars" role="list">
            {report.personas.map((p) => (
              <li key={p.label}><span className="bar-label">{p.label}</span><span className="bar-track"><span className="bar copper" style={{ width: `${p.share}%` }} /></span><span className="bar-value"><strong>{p.share}%</strong></span></li>
            ))}
          </ul>
        </section>
        <section className="box">
          <h2>How they found the show</h2>
          <ul className="bars" role="list">
            {report.sources.map((p) => (
              <li key={p.label}><span className="bar-label">{p.label}</span><span className="bar-track"><span className="bar pine" style={{ width: `${p.share}%` }} /></span><span className="bar-value"><strong>{p.share}%</strong></span></li>
            ))}
          </ul>
          <div className="split"><div><strong>{report.newVisitors}%</strong><span className="muted small">New to your gallery</span></div><div><strong>{100 - report.newVisitors}%</strong><span className="muted small">Returning visitors</span></div></div>
        </section>
      </div>
      <section className="box flush scroll-x" tabIndex={0} role="region" aria-label="Audience table">
        <div className="row between box-head"><h2>Priority leads: who to contact this week</h2><span className="muted small">Only people who chose to share their contact with you. <span id="contact-demo">Demo: contact buttons are off.</span></span></div>
        <table>
          <thead><tr><th>Person</th><th>Profile</th><th>Score</th><th>Why now</th><th>Contact</th></tr></thead>
          <tbody>
            {report.leads.map((l) => (
              <tr key={l.name}>
                <td><span className="work-cell"><span className="avatar">{l.initials}</span><strong>{l.name}</strong></span></td>
                <td><span className="sig sig-quiet">{l.persona}</span></td>
                <td><span className="score"><span className="bar-track mini"><span className="bar copper" style={{ width: `${l.score}%` }} /></span><strong>{l.score}</strong></span></td>
                <td className="why">{l.why}</td>
                <td><button type="button" className="btn btn-outline small-btn" disabled aria-describedby="contact-demo">{l.contact}</button></td>
              </tr>
            ))}
            <tr className="locked"><td colSpan={4}><span className="row gap"><Lock />{report.lockedLeads} more leads ranked. The full list comes with the Growth plan.</span></td><td><Link className="btn btn-primary small-btn" to="/dashboard/plans">See plans</Link></td></tr>
          </tbody>
        </table>
      </section>
    </>
  )
}
