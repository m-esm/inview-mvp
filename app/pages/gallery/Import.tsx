import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { artworks, gallery, importDemo } from '../../data/gallery'

// Demo only: the "AI" step is simulated with the sample results in gallery.ts.
// In the real product, uploaded files are sent to an AI model that extracts artwork records.
type Stage = 'empty' | 'reading' | 'review' | 'published'

export default function Import() {
  const [stage, setStage] = useState<Stage>('empty')
  const [files, setFiles] = useState<string[]>([])
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(importDemo.rows.map((r) => [r.id, r.ok])),
  )
  const input = useRef<HTMLInputElement>(null)
  const siteUrl = `/site/${gallery.slug}`

  function start(names: string[]) {
    setFiles(names.length ? names : importDemo.files.map((f) => f.name))
    setStage('reading')
    window.setTimeout(() => setStage('review'), 1600)
  }

  const approved = Object.values(checked).filter(Boolean).length
  const rest = importDemo.found.artworks - importDemo.rows.length

  return (
    <>
      <div className="row between wrap gap">
        <p className="muted small no-m">Your website and its content</p>
        <Link to={siteUrl} className="pill good" target="_blank" rel="noreferrer">● {gallery.subdomain}.inview.ir · Live</Link>
      </div>

      <div className="two">
        <section className="box">
          <h2>1. Drop in what you have</h2>
          <button className="dropzone" onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); start(Array.from(e.dataTransfer.files).map((f) => f.name)) }}>
            Excel files, PDF price lists, photos of wall labels,<br />Instagram captions or an export of your old website
            <span className="small">Click to choose files, or drag them here</span>
          </button>
          <input ref={input} type="file" multiple hidden onChange={(e) => start(Array.from(e.target.files ?? []).map((f) => f.name))} />
          {stage === 'empty' && <button className="btn-text" onClick={() => start([])}>Use the demo files</button>}
          {files.length > 0 && (
            <ul className="files" role="list">
              {files.map((f, i) => (
                <li key={f}><span>{f}</span><span className="ok small">{stage === 'reading' ? 'Reading…' : `Read${importDemo.files[i] ? `, ${importDemo.files[i].result}` : ''}`}</span></li>
              ))}
            </ul>
          )}
        </section>
        <section className="box dark">
          <h2>2. AI organizes it</h2>
          {stage === 'empty' && <p>Upload files and Inview finds every artwork, artist and past show, merges duplicates and fills in Persian and English.</p>}
          {stage === 'reading' && <p role="status">Reading your files…</p>}
          {(stage === 'review' || stage === 'published') && (
            <>
              <div className="found">
                <div><strong>{importDemo.found.artworks}</strong><span>artworks found</span></div>
                <div><strong>{importDemo.found.artists}</strong><span>artists</span></div>
                <div><strong>{importDemo.found.shows}</strong><span>past shows</span></div>
              </div>
              <p>Duplicates merged, names filled in, sizes and years standardized. <b className="warm">{importDemo.rows.filter((r) => !r.ok).length} items need your check</b> before publishing.</p>
            </>
          )}
          <h2 className="mt">3. You approve, it goes live</h2>
          <p>Approved works appear on your website and on the QR page of their show.</p>
        </section>
      </div>

      {(stage === 'review' || stage === 'published') && (
        <section className="box flush scroll-x" tabIndex={0} aria-label="Import preview table">
          <div className="row between box-head"><h2>Review before publishing</h2><span className="muted small">Showing {importDemo.rows.length} of {importDemo.found.artworks}</span></div>
          <table>
            <thead><tr><th>Work</th><th>Medium and size</th><th>Year</th><th className="num">Price (Toman)</th><th>Found in</th><th>AI note</th><th>Approve</th></tr></thead>
            <tbody>
              {importDemo.rows.map((r) => {
                const a = artworks.find((w) => w.id === r.artworkId)!
                return (
                  <tr key={r.id}>
                    <td><span className="work-cell"><img src={a.image} alt="" /><span><strong>{a.artist}</strong><span className="muted small">{a.artistFa ?? '—'}</span></span></span></td>
                    <td>{a.medium}, {a.size}</td>
                    <td>{a.year}</td>
                    <td className="num">{r.ok ? a.price.toLocaleString('en-US') : '—'}</td>
                    <td className="muted">{r.source}</td>
                    <td><span className={`sig ${r.ok ? 'sig-quiet' : 'sig-hot'}`}>{r.note}</span></td>
                    <td><input type="checkbox" className="check" aria-label={`Approve ${a.artist}`} checked={!!checked[r.id]} onChange={(e) => setChecked({ ...checked, [r.id]: e.target.checked })} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="row gap wrap actions-bar">
            <span className="muted small">{approved + rest} of {importDemo.found.artworks} approved</span>
            {stage === 'published'
              ? <Link className="btn btn-primary small-btn" to={siteUrl} target="_blank" rel="noreferrer">Published. View website</Link>
              : <button className="btn btn-primary small-btn" onClick={() => setStage('published')}>Publish to website</button>}
          </div>
        </section>
      )}
    </>
  )
}
