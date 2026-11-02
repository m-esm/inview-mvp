import { useId, type ReactNode } from 'react'

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  action?: ReactNode
}) {
  const titleId = useId()
  return (
    <section className="empty-state reveal" aria-labelledby={titleId}>
      <span className="ink-rule" aria-hidden />
      <h2 id={titleId}>{title}</h2>
      {body ? <p>{body}</p> : null}
      {action}
    </section>
  )
}
