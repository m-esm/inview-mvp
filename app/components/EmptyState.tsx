import type { ReactNode } from 'react'

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state reveal" role="status">
      <span className="ink-rule" aria-hidden />
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  )
}
