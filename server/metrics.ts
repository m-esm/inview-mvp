const counts = new Map<string, number>()

export function recordStatus(status: number): void {
  const key = String(status)
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

export function metricsText(): string {
  const lines = ['# TYPE inview_http_responses_total counter']
  for (const [status, count] of counts) {
    lines.push(`inview_http_responses_total{service="inview",status="${status}"} ${count}`)
  }
  return `${lines.join('\n')}\n`
}
