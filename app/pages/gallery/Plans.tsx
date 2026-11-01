import { plans } from '../../data/gallery'

export default function Plans() {
  return (
    <>
      <p className="muted no-m">Prices in Toman, excluding VAT. Annual plans cost 10 months and fix the price for 12 months.</p>
      <div className="plans">
        {plans.map((p) => (
          <section key={p.name} className={`plan ${p.highlight ? 'hl' : ''}`}>
            <p className="plan-tag">{p.tag}</p>
            <h2>{p.name}</h2>
            <p className="plan-price">{p.monthly}{p.monthly !== 'Free' && <span> / month</span>}</p>
            <p className="muted small no-m">{p.annual === 'Free' ? 'Always free' : `${p.annual} a year`}</p>
            <p className="plan-addr">{p.address}</p>
            <ul role="list">{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
            <button className={`btn ${p.highlight ? 'btn-quiet' : 'btn-outline'} small-btn`} disabled={p.name === 'Growth'}>{p.name === 'Growth' ? 'Current plan' : `Choose ${p.name}`}</button>
          </section>
        ))}
      </div>
      <section className="box">
        <h2>Compared with building a website yourself</h2>
        <div className="scroll-x" tabIndex={0} role="region" aria-label="Plan comparison">
          <table className="compare">
            <thead><tr><th>Option</th><th className="num">Year 1</th><th className="num">3 years</th><th>What you get</th></tr></thead>
            <tbody>
              <tr><td>WordPress site, no support</td><td className="num">~30M</td><td className="num">~65M</td><td>A site that goes out of date; no show pages or visitor data</td></tr>
              <tr><td>WordPress site with a support freelancer</td><td className="num">~78M</td><td className="num">~185M</td><td>An up-to-date site; still no show pages or visitor data</td></tr>
              <tr><td><strong>Inview Website</strong> (annual)</td><td className="num">25M</td><td className="num">75M</td><td>Website, QR pages, archive, AI import, visitor funnel, support</td></tr>
              <tr><td><strong>Inview Growth</strong> (annual)</td><td className="num">60M</td><td className="num">180M</td><td>All of the above, plus own domain, leads, campaigns, show uploads</td></tr>
            </tbody>
          </table>
        </div>
        <p className="muted small">WordPress costs are estimates: build 20–30M, hosting about 5M a year, support about 4M a month.</p>
      </section>
    </>
  )
}
