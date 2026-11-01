const HOST = /^[A-Za-z0-9.-]+$/

export function contentSecurityPolicy(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.S3_PUBLIC_HOST || 'inview-media.moshes.io'
  const host = HOST.test(raw) ? raw : 'inview-media.moshes.io'
  const media = `https://${host}`
  // React Router writes inline hydration scripts. The host list stays the app and the media host.
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' ${media} data: blob:`,
    "font-src 'self'",
    "connect-src 'self'",
    `media-src 'self' ${media}`,
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join('; ')
}
