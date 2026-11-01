export function StaffSignIn({ error = '' }: { error?: string }) {
  return (
    <main className="gate">
      <aside className="gate-panel" aria-hidden>
        <h2>Edit the show. Keep the wall clear.</h2>
        <p>Open the O Gallery editor to update works, prices and the QR landing page.</p>
      </aside>
      <form method="post" className="gate-card">
        <p className="brand">Inview <span>for galleries</span></p>
        <span className="ink-rule" aria-hidden />
        <h1>O Gallery</h1>
        <label htmlFor="access-code">Gallery access code</label>
        <input
          id="access-code"
          name="accessCode"
          type="password"
          autoComplete="current-password"
          required
          aria-describedby="access-msg"
          aria-invalid={error ? true : undefined}
        />
        <p id="access-msg" className={error ? 'error' : 'muted small'} role={error ? 'alert' : undefined}>
          {error || 'The server checks this code. Then it opens a staff session.'}
        </p>
        <button className="btn btn-primary" type="submit">
          Open the editor
        </button>
      </form>
    </main>
  )
}
