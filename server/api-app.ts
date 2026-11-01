import express from 'express'
import type { Express, Request } from 'express'
import { media } from '../database/schema'
import { clearAuthFailures, isAuthLimited, registerAuthFailure } from './auth-limit'
import { verifySecret } from './crypto'
import { ensureOGalleryTenant, loadStaffGallery } from './gallery-record'
import { processAndStoreImage } from './images'
import { handlePilotApi } from './pilot-api'
import type { ObjectStorage } from './storage'

// Drizzle handle: Postgres.js in production, PGlite in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const TOO_MANY = { error: 'Too many attempts. Try again later.' }

// Tests pass a private client name so parallel cases do not share one counter.
// Production counts failures by IP address.
export function clientKey(req: Request): string {
  if (process.env.NODE_ENV === 'test') {
    const named = req.get('x-test-client')
    if (named) return `test:${named}`
  }
  return req.ip || req.socket?.remoteAddress || 'local'
}

function sendJson(res: express.Response, status: number, body: unknown) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(status).json(body)
}

export function mountApi(app: Express, db: Db, storage: ObjectStorage) {
  app.get('/api/v1/health', (_req, res) => {
    sendJson(res, 200, { ok: true, service: 'inview-mvp' })
  })

  const pilot = async (req: Request, res: express.Response) => {
    const key = clientKey(req)
    if (isAuthLimited(key)) {
      sendJson(res, 429, TOO_MANY)
      return
    }
    try {
      const result = await handlePilotApi(db, storage, req.method || 'GET', req.body)
      if (result.status === 401) registerAuthFailure(key)
      if (result.status === 200 && (req.method || 'GET').toUpperCase() === 'PUT') clearAuthFailures(key)
      if (result.status === 401 && isAuthLimited(key)) {
        sendJson(res, 429, TOO_MANY)
        return
      }
      sendJson(res, result.status, result.body)
    } catch (error) {
      console.error(error)
      sendJson(res, 500, { error: 'The server could not complete the request.' })
    }
  }

  app.all('/api/v1/pilot', pilot)
  app.all('/api/pilot', pilot)

  const staff = async (req: Request, res: express.Response) => {
    const key = clientKey(req)
    if (isAuthLimited(key)) {
      sendJson(res, 429, TOO_MANY)
      return
    }
    try {
      const payload = (req.body || {}) as { accessCode?: string; password?: string }
      const code = payload.accessCode || payload.password || ''
      const result = await loadStaffGallery(db, code)
      if (result.status === 401) {
        registerAuthFailure(key)
        if (isAuthLimited(key)) {
          sendJson(res, 429, TOO_MANY)
          return
        }
      }
      if (result.status === 200) clearAuthFailures(key)
      sendJson(res, result.status, result.body)
    } catch (error) {
      console.error(error)
      sendJson(res, 500, { error: 'The server could not complete the request.' })
    }
  }

  app.post('/api/v1/pilot/staff', staff)
  app.post('/api/pilot/staff', staff)

  app.post('/api/v1/uploads', async (req, res) => {
    const key = clientKey(req)
    if (isAuthLimited(key)) {
      sendJson(res, 429, TOO_MANY)
      return
    }
    try {
      const { gallery, accessCode, contentType, dataBase64 } = req.body || {}
      if (gallery !== 'o-gallery') {
        sendJson(res, 400, { error: 'Unknown gallery.' })
        return
      }
      const tenant = await ensureOGalleryTenant(db)
      if (!verifySecret(String(accessCode || ''), tenant.gallery.accessCodeHash)) {
        registerAuthFailure(key)
        if (isAuthLimited(key)) {
          sendJson(res, 429, TOO_MANY)
          return
        }
        sendJson(res, 401, { error: 'That access code does not match.' })
        return
      }
      if (typeof dataBase64 !== 'string' || typeof contentType !== 'string') {
        sendJson(res, 400, { error: 'Upload data is missing.' })
        return
      }
      const buffer = Buffer.from(dataBase64, 'base64')
      const processed = await processAndStoreImage(storage, 'o-gallery', buffer, contentType)
      const [row] = await db
        .insert(media)
        .values({
          galleryId: tenant.gallery.id,
          s3Key: processed.key,
          width: processed.width,
          height: processed.height,
          variants: processed.variants,
        })
        .returning()
      clearAuthFailures(key)
      sendJson(res, 201, {
        id: row.id,
        url: processed.variants['w640.webp'] || processed.primaryUrl,
        variants: processed.variants,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed.'
      sendJson(res, 400, { error: message })
    }
  })

  app.use('/api', (_req, res) => {
    sendJson(res, 404, { error: 'Not found.' })
  })
}

export function createApiApp(db: Db, storage: ObjectStorage) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '12mb' }))
  mountApi(app, db, storage)
  return app
}
