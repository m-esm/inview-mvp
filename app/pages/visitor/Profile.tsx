import { Link } from 'react-router'
import { artworks, gallery, passportGoal, passportHistory } from '../../data/gallery'
import { useT } from '../../lib/i18n'
import { useVisitor, visitor } from '../../lib/store'
import { useSignIn } from '../../components/VisitorShell'
import { Calendar } from '../../components/Icons'

const faStamps: Record<string, string> = {
  H: 'ه',
  S: 'س',
  '0': '۰',
  B: 'ب',
  V: 'و',
  O: 'ا',
  A: 'آ',
  K: 'ک',
  N: 'ن',
  R: 'ر',
}

function stampMark(mark: string, lang: 'en' | 'fa') {
  if (lang !== 'fa') return mark
  return faStamps[mark] ?? 'م'
}

export default function Profile() {
  const { t, n, artist, status, lang } = useT()
  const { phone, saved, follows, stamps } = useVisitor()
  const { requireSignIn } = useSignIn()

  if (!phone) {
    return (
      <div className="pad empty">
        <h1 className="page-title">{t.profile}</h1>
        <p className="muted">{t.signInPrompt}</p>
        <button className="btn btn-primary" onClick={() => requireSignIn('save', () => undefined)}>{t.signIn}</button>
      </div>
    )
  }

  const marks = [...passportHistory, ...stamps.map(() => 'R')]
  const filled = Math.min(marks.length, passportGoal)
  const savedWorks = artworks.filter((a) => saved.includes(a.id))

  return (
    <div className="profile">
      <div className="pad row gap">
        <span className="avatar" aria-hidden>{phone.slice(-2)}</span>
        <div>
          <h1 className="page-title no-m">{t.profile}</h1>
          <p className="muted small" dir="ltr">{phone.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3')}</p>
        </div>
      </div>
      <div className="stats pad">
        <div><strong>{n(filled)}</strong><span>{t.galleriesVisited}</span></div>
        <div><strong>{n(saved.length)}</strong><span>{t.savedWorks}</span></div>
        <div><strong>{n(follows.length)}</strong><span>{t.artistsFollowed}</span></div>
      </div>
      <section className="panel">
        <div className="row between"><h2 className="panel-title">{t.passport}</h2><span className="muted small">{n(filled)} / {n(passportGoal)}</span></div>
        <div className="progress" role="progressbar" aria-label={t.passport} aria-valuenow={filled} aria-valuemin={0} aria-valuemax={passportGoal}>
          <span style={{ width: `${(filled / passportGoal) * 100}%` }} />
        </div>
        <ul className="stamps" role="list">
          {Array.from({ length: passportGoal }, (_, i) => (
            <li key={i} className={i < filled ? (marks[i] === 'R' ? 'stamp here' : i % 3 === 0 ? 'stamp copper' : 'stamp') : 'stamp open'}>
              {i < filled ? stampMark(marks[i], lang) : ''}
            </li>
          ))}
        </ul>
        <p className="muted small">{t.passportLeft(Math.max(passportGoal - filled, 0))}</p>
      </section>
      <section className="pad">
        <h2 className="panel-title">{t.savedWorks}</h2>
        {savedWorks.length === 0 ? (
          <p className="muted">{t.noSaved} <Link to={`/g/${gallery.slug}/works`}>{t.artworks}</Link></p>
        ) : (
          <ul className="saved" role="list">
            {savedWorks.map((a) => (
              <li key={a.id}>
                <Link to={`/g/${gallery.slug}/works/${a.id}`}>
                  <img src={a.image} alt="" />
                  <strong>{artist(a)}</strong>
                  <span className={`status s-${a.status}`}>{status(a.status)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel row gap">
        <span className="mark pine" aria-hidden><Calendar /></span>
        <div><strong>{t.thisFriday}</strong><p className="muted small no-m">{t.thisFridaySub}</p></div>
      </section>
      <div className="pad row gap wrap">
        <button className="btn-text" onClick={visitor.signOut}>{t.signOut}</button>
        <button className="btn-text" onClick={visitor.reset}>{t.resetDemo}</button>
      </div>
    </div>
  )
}
