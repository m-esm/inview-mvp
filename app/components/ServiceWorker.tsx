import { useEffect } from 'react'

export function ServiceWorker() {
  useEffect(() => {
    if (import.meta.env.DEV || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  }, [])
  return null
}
