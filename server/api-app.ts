import express from 'express'
import type { Express, Request } from 'express'
import { media } from '../database/schema'
import { clearAuthFailures, isAuthLimited, registerAuthFailure } from './auth-limit'
import { verifySecret } from './crypto'
import { ensureOGalleryTenant } from './gallery-record'
import { processAndStoreImage } from './images'
import { handlePilotApi, handleStaffApi } from './pilot-api'
import type { ObjectStorage } from './storage'

// Drizzle handle: Postgres.js in production, PGlite in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const TOO_MANY = { error: 'Too many attempts. Try again later.' }

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

function limited(key: string, status: number): number {
  if (status === 401) registerAuthFailure(key)
  if (status === 401 && isAuthLimited(key)) return 429
  return status
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
      const status = limited(key, result.status)
      if (status === 200 && (req.method || 'GET').toUpperCase() === 'PUT') clearAuthFailures(key)
      sendJson(res, status, status === 429 ? TOO_MANY : result.body)
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
    const verb = (req.method || 'GET').toUpperCase()
    if (verb !== 'GET' && verb !== 'HEAD') {
      sendJson(res, 405, { error: 'Method not allowed.' })
      return
    }
    try {
      const result = await handleStaffApi(db, req.get('x-access-code') || '')
      const status = limited(key, result.status)
      if (status === 200) clearAuthFailures(key)
      sendJson(res, status, status === 429 ? TOO_MANY : result.body)
    } catch (error) {
      console.error(error)
      sendJson(res, 500, { error: 'The server could not complete the request.' })
    }
  }

  app.all('/api/v1/pilot/staff', staff)
  app.all('/api/pilot/staff', staff)

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
        const status = limited(key, 401)
        sendJson(res, status, status === 429 ? TOO_MANY : { error: 'That access code does not match.' })
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
