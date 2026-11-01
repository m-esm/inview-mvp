import express from 'express'
import type { ErrorRequestHandler, Express, Request } from 'express'
import { media } from '../database/schema'
import { leadsCsvForSession } from './gallery-record'
import { displayVariant, processAndStoreImage, UploadError } from './images'
import { beginUpload, clientIpFrom, runPilotRequest, runStaffRequest, writeApiResult } from './rate-limit'
import { readStaffSession } from './staff-session'
import type { ObjectStorage } from './storage'
import { isMultipart, readMultipart } from './upload-body'

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

export const JSON_LIMIT = '256kb'

const UPLOAD_MISSING = { error: 'Choose an image to upload.', errorFa: 'یک تصویر برای بارگذاری انتخاب کنید.' }
const UPLOAD_FAILED = { error: 'The upload did not complete. Try again.', errorFa: 'بارگذاری انجام نشد. دوباره تلاش کنید.' }
const BODY_TOO_LARGE = { error: 'The request is too large.', errorFa: 'درخواست بیش از حد بزرگ است.' }

async function readUpload(req: Request): Promise<{ gallery: unknown; accessCode: unknown; file: Buffer | null }> {
  if (isMultipart(req)) {
    const body = await readMultipart(req)
    return { gallery: body.fields.gallery, accessCode: body.fields.accessCode, file: body.file }
  }
  const { gallery, accessCode, dataBase64 } = req.body || {}
  return { gallery, accessCode, file: typeof dataBase64 === 'string' ? Buffer.from(dataBase64, 'base64') : null }
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
  app.all('/api/pilot', pilot)

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

  app.get('/api/v1/pilot/staff/leads.csv', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const sessionId = await sessionGallery(db, req)
      if (!sessionId) {
        sendJson(res, 401, { error: 'Sign in to download the leads.', errorFa: 'برای دریافت فهرست وارد شوید.' })
        return
      }
      const result = await leadsCsvForSession(db, sessionId)
      if (result.status !== 200) {
        sendJson(res, result.status, result.body)
        return
      }
      const day = new Date().toISOString().slice(0, 10)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="o-gallery-leads-${day}.csv"`)
      res.status(200).send(result.body)
    } catch (error) {
      console.error(error)
      sendJson(res, 500, SERVER_ERROR)
    }
  })

  app.post('/api/v1/uploads', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const upload = await readUpload(req)
      const gate = await beginUpload(db, {
        gallery: upload.gallery,
        accessCode: upload.accessCode,
        ip: clientKey(req),
        sessionGalleryId: await sessionGallery(db, req),
      })
      if (!gate.ok) {
        writeApiResult(res, gate.result)
        return
      }
      if (!upload.file || upload.file.byteLength === 0) {
        sendJson(res, 400, UPLOAD_MISSING)
        return
      }
      const processed = await processAndStoreImage(storage, 'o-gallery', upload.file)
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
        url: displayVariant(processed.variants, processed.primaryUrl),
        variants: processed.variants,
      })
    } catch (error) {
      if (error instanceof UploadError) {
        sendJson(res, error.code === 'size' ? 413 : 400, { error: error.message, errorFa: error.errorFa })
        return
      }
      console.error(error)
      sendJson(res, 400, UPLOAD_FAILED)
    }
  })

  app.use('/api', (_req, res) => {
    sendJson(res, 404, { error: 'Not found.' })
  })

  const bodyErrors: ErrorRequestHandler = (error, req, res, next) => {
    if (!req.path.startsWith('/api')) {
      next(error)
      return
    }
    const type = (error as { type?: string }).type
    if (type === 'entity.too.large') {
      sendJson(res, 413, BODY_TOO_LARGE)
      return
    }
    if (type === 'entity.parse.failed') {
      sendJson(res, 400, { error: 'The request body is not valid JSON.', errorFa: 'بدنه درخواست معتبر نیست.' })
      return
    }
    next(error)
  }
  app.use(bodyErrors)
}

export function createApiApp(db: Db, storage: ObjectStorage) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: JSON_LIMIT }))
  mountApi(app, db, storage)
  return app
}
