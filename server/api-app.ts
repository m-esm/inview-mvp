import express from 'express'
import type { ErrorRequestHandler, Express, Request } from 'express'
import { media } from '../database/schema'
import { leadsCsvForSession } from './gallery-record'
import { displayVariant, processAndStoreImage, UploadError } from './images'
import { beginUpload, clientIpFrom, runPilotRequest, runStaffRequest, writeApiResult } from './rate-limit'
import { readStaffSession, requestIsSecure } from './staff-session'
import type { ObjectStorage } from './storage'
import { isMultipart, readMultipart } from './upload-body'
import { AccountInputError, signIn, signOut } from './accounts'
import { principalFor } from './authz'
import { acceptInvite, InvalidInviteError, readInvite } from './invitations'
import { originCheck } from './origin-check'

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
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  app.post('/api/v1/auth/sign-in', async (req, res) => {
    const { identifier, password } = req.body ?? {}
    if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 320 || typeof password !== 'string') {
      sendJson(res, 400, { error: 'Enter your email or phone number and password.' })
      return
    }
    try {
      const result = await signIn(db, {
        identifier,
        password,
        ip: clientKey(req),
        secure: requestIsSecure((name) => req.get(name), `${req.protocol}://${req.get('host')}`),
      })
      if (!result.ok) {
        writeApiResult(res, result.result)
        return
      }
      res.setHeader('Set-Cookie', result.cookie)
      sendJson(res, 200, { user: result.user })
    } catch {
      sendJson(res, 500, SERVER_ERROR)
    }
  })

  app.post('/api/v1/auth/sign-out', async (req, res) => {
    try {
      const secure = requestIsSecure((name) => req.get(name), `${req.protocol}://${req.get('host')}`)
      res.setHeader('Set-Cookie', await signOut(db, req.get('cookie'), secure))
      sendJson(res, 200, { ok: true })
    } catch {
      sendJson(res, 500, SERVER_ERROR)
    }
  })

  app.get('/api/v1/auth/me', async (req, res) => {
    try {
      const principal = await principalFor(db, req.get('cookie'))
      sendJson(res, principal ? 200 : 401, principal ? { principal } : { error: 'Sign in to continue.' })
    } catch {
      sendJson(res, 500, SERVER_ERROR)
    }
  })

  app.get('/api/v1/invites/:token', async (req, res) => {
    try {
      const invite = await readInvite(db, String(req.params.token))
      sendJson(res, invite ? 200 : 404, invite ?? { error: 'This invite is not valid.' })
    } catch {
      sendJson(res, 500, SERVER_ERROR)
    }
  })

  app.post('/api/v1/invites/:token/accept', async (req, res) => {
    const { name, password } = req.body ?? {}
    if (typeof name !== 'string' || typeof password !== 'string') {
      sendJson(res, 400, { error: 'Enter your name and password.' })
      return
    }
    try {
      const secure = requestIsSecure((key) => req.get(key), `${req.protocol}://${req.get('host')}`)
      const accepted = await acceptInvite(db, String(req.params.token), name, password, secure)
      res.setHeader('Set-Cookie', accepted.cookie)
      sendJson(res, 200, { user: accepted.user })
    } catch (error) {
      if (error instanceof InvalidInviteError || error instanceof AccountInputError) {
        sendJson(res, error instanceof InvalidInviteError ? 404 : 400, { error: error.message })
        return
      }
      sendJson(res, 500, SERVER_ERROR)
    }
  })

  app.get('/api/v1/health', (_req, res) => {
    sendJson(res, 200, { ok: true, service: 'inview-mvp' })
  })

  const pilot = async (req: Request, res: express.Response) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const sessionId = await sessionGallery(db, req)
      const verb = (req.method || 'GET').toUpperCase()
      const body = verb === 'GET' || verb === 'HEAD' ? { gallery: req.query.gallery } : req.body
      writeApiResult(
        res,
        await runPilotRequest(db, storage, verb, body, clientKey(req), undefined, undefined, sessionId),
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
    if (!req.path.startsWith('/api') || res.headersSent) {
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
    console.error(error)
    sendJson(res, 500, SERVER_ERROR)
  }
  app.use(bodyErrors)
}

export function createApiApp(db: Db, storage: ObjectStorage) {
  const app = express()
  app.disable('x-powered-by')
  app.use(originCheck)
  app.use(express.json({ limit: JSON_LIMIT }))
  mountApi(app, db, storage)
  return app
}
