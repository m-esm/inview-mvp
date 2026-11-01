export const TRUSTED_PROXIES = 'loopback, linklocal, uniquelocal'

/** @param {import('express').Express} app */
export function trustClusterProxy(app) {
  app.set('trust proxy', TRUSTED_PROXIES)
  return app
}
