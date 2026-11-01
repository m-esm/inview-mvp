import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { artworks, gallery, importDemo } from '../../data/gallery'

// Demo only: the import step returns the sample results from gallery.ts.
type Stage = 'empty' | 'reading' | 'review' | 'published'

export default function Import() {
  const [stage, setStage] = useState<Stage>('empty')
  const [files, setFiles] = useState<string[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(importDemo.rows.map((r) => [r.id, r.ok])),
  )
  const input = useRef<HTMLInputElement>(null)
  const siteUrl = `/site/${gallery.slug}`

  function start(names: string[]) {
    if (names.length === 0) {
      setError('No file was added. Choose a file, or use the demo files.')
      return
    }
    setError('')
    setFiles(names)
    setStage('reading')
    window.setTimeout(() => setStage('review'), 1600)
  }

  const approved = Object.values(checked).filter(Boolean).length
  const rest = importDemo.found.artworks - importDemo.rows.length

  return (
    <>
      <div className="row between wrap gap">
        <p className="muted small no-m">Your website and its content</p>
        <p className="pill warn" role="note">Demo: this import is a simulation. No file leaves your device.</p>
        <Link to={siteUrl} className="pill good" target="_blank" rel="noreferrer">{gallery.subdomain}.inview.ir · Live</Link>
      </div>

      <div className="two">
        <section className="box">
          <h2>1. Drop in what you have</h2>
          <button type="button" className="dropzone" aria-describedby={error ? 'import-error' : undefined} onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); start(Array.from(e.dataTransfer.files).map((f) => f.name)) }}>
            Excel files, PDF price lists, photos of wall labels,<br />Instagram captions or an export of your old website
            <span className="small">Click to choose files, or drag them here</span>
          </button>
          <input ref={input} type="file" multiple hidden aria-label="Choose files to import" onChange={(e) => start(Array.from(e.target.files ?? []).map((f) => f.name))} />
          {error && <p id="import-error" className="error small" role="alert">{error}</p>}
          {stage === 'empty' && <button type="button" className="btn-text" onClick={() => start(importDemo.files.map((f) => f.name))}>Use the demo files</button>}
          {files.length > 0 && (
            <ul className="files" role="list">
              {files.map((f, i) => (
                <li key={f}><span>{f}</span><span className="ok small">{stage === 'reading' ? 'Reading…' : `Read${importDemo.files[i] ? `, ${importDemo.files[i].result}` : ''}`}</span></li>
              ))}
            </ul>
          )}
        </section>
        <section className="box dark">
          <h2>2. Inview sorts it</h2>
          {stage === 'empty' && <p>Upload files. Inview lists the artworks, artists and past shows it finds, merges duplicates and suggests Persian and English names.</p>}
          {stage === 'reading' && <p role="status">Reading your files…</p>}
          {(stage === 'review' || stage === 'published') && (
            <>
              <div className="found">
                <div><strong>{importDemo.found.artworks}</strong><span>artworks found</span></div>
                <div><strong>{importDemo.found.artists}</strong><span>artists</span></div>
                <div><strong>{importDemo.found.shows}</strong><span>past shows</span></div>
              </div>
              <p>Inview merged duplicates, filled in names and standardized sizes and years. <b className="warm">{importDemo.rows.filter((r) => !r.ok).length} items need your check</b> before publishing.</p>
            </>
          )}
          <h2 className="mt">3. You approve, then publish</h2>
          <p>Inview puts each approved work on your website and on the QR page of its show.</p>
        </section>
      </div>

      {(stage === 'review' || stage === 'published') && (
        <section className="box flush scroll-x" tabIndex={0} role="region" aria-label="Import preview table">
          <div className="row between box-head"><h2>Review before publishing</h2><span className="muted small">Showing {importDemo.rows.length} of {importDemo.found.artworks}</span></div>
          <table>
            <thead><tr><th>Work</th><th>Medium and size</th><th>Year</th><th className="num">Price (Toman)</th><th>Found in</th><th>Note</th><th>Approve</th></tr></thead>
            <tbody>
              {importDemo.rows.map((r) => {
                const a = artworks.find((w) => w.id === r.artworkId)!
                return (
                  <tr key={r.id}>
                    <td><span className="work-cell"><img src={a.image} alt="" /><span><strong>{a.artist}</strong><span className="muted small">{a.artistFa ?? 'No Persian name'}</span></span></span></td>
                    <td>{a.medium}, {a.size}</td>
                    <td>{a.year}</td>
                    <td className="num">{r.ok ? a.price.toLocaleString('en-US') : 'Unclear'}</td>
                    <td className="muted">{r.source}</td>
                    <td><span className={`sig ${r.ok ? 'sig-quiet' : 'sig-hot'}`}>{r.note}</span></td>
                    <td><label className="check-hit"><input type="checkbox" className="check" aria-label={`Approve ${a.artist}`} checked={!!checked[r.id]} onChange={(e) => setChecked({ ...checked, [r.id]: e.target.checked })} /></label></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="row gap wrap actions-bar">
            <span className="muted small">{approved + rest} of {importDemo.found.artworks} approved</span>
            {stage === 'published'
              ? <Link className="btn btn-primary small-btn" to={siteUrl} target="_blank" rel="noreferrer">Published. View website</Link>
              : <button type="button" className="btn btn-primary small-btn" onClick={() => setStage('published')}>Publish to website</button>}
          </div>
        </section>
      )}
    </>
  )
}
