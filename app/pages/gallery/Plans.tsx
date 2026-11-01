import { plans } from '../../data/gallery'

export default function Plans() {
  return (
    <>
      <p id="plans-demo-note" className="pill warn" role="note">Demo: these plans and prices are examples. You cannot buy a plan yet.</p>
      <p className="muted no-m">Prices in Toman, excluding VAT. Annual plans cost 10 months and fix the price for 12 months.</p>
      <div className="plans">
        {plans.map((p) => (
          <section key={p.name} className="plan">
            <p className="plan-tag">{p.tag}</p>
            <h2>{p.name}</h2>
            <p className="plan-price">{p.monthly}{p.monthly !== 'Free' && <span> / month</span>}</p>
            <p className="muted small no-m">{p.annual === 'Free' ? 'Always free' : `${p.annual} a year`}</p>
            <p className="plan-addr">{p.address}</p>
            <ul role="list">{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
            <button className="btn btn-outline small-btn" disabled aria-describedby="plans-demo-note">Choose {p.name}</button>
          </section>
        ))}
      </div>
    </>
  )
}
