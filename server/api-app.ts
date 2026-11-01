import express from 'express'
import type { ErrorRequestHandler, Express, Request } from 'express'
import { media } from '../database/schema'
import { processAndStoreImage } from './images'
import { beginUpload, clientIpFrom, runPilotRequest, runStaffRequest, writeApiResult } from './rate-limit'
import { readStaffSession } from './staff-session'
import type { ObjectStorage } from './storage'

// Drizzle handle: Postgres.js in production, PGlite in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export function clientKey(req: Request): string {
  if (process.env.NODE_ENV === 'test') {
    const named = req.get('x-test-client')
    if (named) return `test:${named}`
  }
  return clientIpFrom(req.get('cf-connecting-ip'), req.socket?.remoteAddress)
}

function sendJson(res: express.Response, status: number, body: unknown) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(status).json(body)
}

async function sessionGallery(db: Db, req: Request): Promise<string | null> {
  const session = await readStaffSession(db, req.get('cookie'))
  return session?.galleryId ?? null
}

const SERVER_ERROR = {
  error: 'The server could not complete the request.',
  errorFa: 'سرور نتوانست درخواست را انجام دهد.',
}

export function mountApi(app: Express, db: Db, storage: ObjectStorage) {
  app.get('/api/v1/health', (_req, res) => {
    sendJson(res, 200, { ok: true, service: 'inview-mvp' })
  })

  const pilot = async (req: Request, res: express.Response) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const sessionId = await sessionGallery(db, req)
      writeApiResult(
        res,
        await runPilotRequest(db, storage, req.method || 'GET', req.body, clientKey(req), undefined, undefined, sessionId),
      )
    } catch (error) {
      console.error(error)
      sendJson(res, 500, SERVER_ERROR)
    }
  }

  app.all('/api/v1/pilot', pilot)
  app.all('/api/pilot', (req, res) => {
    res.setHeader('Deprecation', 'true')
    res.setHeader('Link', '</api/v1/pilot>; rel="successor-version"')
    return pilot(req, res)
  })

  const staff = async (req: Request, res: express.Response) => {
    res.setHeader('Cache-Control', 'no-store')
    const verb = (req.method || 'GET').toUpperCase()
    if (verb !== 'GET' && verb !== 'HEAD') {
      sendJson(res, 405, { error: 'Method not allowed.' })
      return
    }
    try {
      const sessionId = await sessionGallery(db, req)
      writeApiResult(
        res,
        await runStaffRequest(db, req.get('x-access-code') || '', clientKey(req), undefined, undefined, sessionId),
      )
    } catch (error) {
      console.error(error)
      sendJson(res, 500, SERVER_ERROR)
    }
  }

  app.all('/api/v1/pilot/staff', staff)
  app.all('/api/pilot/staff', staff)

  app.post('/api/v1/uploads', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const { gallery, accessCode, contentType, dataBase64 } = req.body || {}
      const gate = await beginUpload(db, { gallery, accessCode, ip: clientKey(req), sessionGalleryId: await sessionGallery(db, req) })
      if (!gate.ok) {
        writeApiResult(res, gate.result)
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
          galleryId: gate.galleryId,
          s3Key: processed.key,
          width: processed.width,
          height: processed.height,
          variants: processed.variants,
        })
        .returning()
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

  const apiError: ErrorRequestHandler = (error, req, res, next) => {
    if (!req.path.startsWith('/api') || res.headersSent) return next(error)
    const type = (error as { type?: string }).type
    if (type === 'entity.parse.failed') {
      sendJson(res, 400, { error: 'The request body is not valid JSON.', errorFa: 'متن درخواست JSON معتبر نیست.' })
      return
    }
    if (type === 'entity.too.large') {
      sendJson(res, 413, { error: 'The request body is too large.', errorFa: 'حجم درخواست بیش از حد است.' })
      return
    }
    console.error(error)
    sendJson(res, 500, SERVER_ERROR)
  }
  app.use(apiError)
}

export function createApiApp(db: Db, storage: ObjectStorage) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '12mb' }))
  mountApi(app, db, storage)
  return app
}
