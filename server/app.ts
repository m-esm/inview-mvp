import { createRequestHandler } from '@react-router/express'
import express from 'express'
import type { ErrorRequestHandler } from 'express'
import 'react-router'
import { closeDatabase, createDatabase } from '../database/client'
import { DatabaseContext } from '../database/context'
import { ensureOGalleryTenant, resolveOGalleryAccessCode, syncOGalleryAccessCode } from './gallery-record'
import { processAndStoreImage } from './images'
import { metricsText, recordStatus } from './metrics'
import { handlePilotApi, handleStaffApi } from './pilot-api'
import { contentSecurityPolicy } from './csp'
import { pingDatabase, sendReady } from './ready'
import { createObjectStorage, localMediaMiddleware } from './storage'
import { media } from '../database/schema'

declare module 'react-router' {
  interface AppLoadContext {
    storage: ReturnType<typeof createObjectStorage>
  }
}

export const app = express()
app.disable('x-powered-by')

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

resolveOGalleryAccessCode()

const db = createDatabase(databaseUrl)
const storage = createObjectStorage()
let draining = false

export function beginDrain() {
  draining = true
}

export async function closeServer() {
  draining = true
  await closeDatabase()
}

export { recordStatus }

export const oGalleryReady = syncOGalleryAccessCode(db).then(() => undefined)

if (process.env.NODE_ENV === 'production') {
  const policy = contentSecurityPolicy()
  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', policy)
    next()
  })
}

app.use(localMediaMiddleware())
app.use(express.json({ limit: '12mb' }))

app.use((_req, _res, next) => {
  DatabaseContext.run(db, () => next())
})

app.get('/api/v1/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json({ ok: true, service: 'inview-mvp' })
})

app.get('/api/v1/ready', async (_req, res) => {
  await sendReady(res, {
    draining,
    db: () => pingDatabase(db),
    storage: () => storage.probe(),
  })
})

app.get('/metrics', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.type('text/plain').send(metricsText())
})

app.all('/api/v1/pilot', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const result = await handlePilotApi(db, storage, req.method || 'GET', req.body)
    res.status(result.status).json(result.body)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'The server could not complete the request.' })
  }
})

// Keep the old pilot path for the SPA clients during the migration.
app.all('/api/pilot', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const result = await handlePilotApi(db, storage, req.method || 'GET', req.body)
    res.status(result.status).json(result.body)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'The server could not complete the request.' })
  }
})

async function sendStaffReport(req: express.Request, res: express.Response) {
  res.setHeader('Cache-Control', 'no-store')
  const verb = (req.method || 'GET').toUpperCase()
  if (verb !== 'GET' && verb !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }
  try {
    const result = await handleStaffApi(db, req.get('x-access-code') || '')
    res.status(result.status).json(result.body)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'The server could not complete the request.' })
  }
}

app.all('/api/v1/pilot/staff', sendStaffReport)
app.all('/api/pilot/staff', sendStaffReport)

app.post('/api/v1/uploads', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { gallery, accessCode, contentType, dataBase64 } = req.body || {}
    if (gallery !== 'o-gallery') {
      res.status(400).json({ error: 'Unknown gallery.' })
      return
    }
    const tenant = await ensureOGalleryTenant(db)
    const { verifySecret } = await import('./crypto')
    if (!verifySecret(String(accessCode || ''), tenant.gallery.accessCodeHash)) {
      res.status(401).json({ error: 'That access code does not match.' })
      return
    }
    if (typeof dataBase64 !== 'string' || typeof contentType !== 'string') {
      res.status(400).json({ error: 'Upload data is missing.' })
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
    res.status(201).json({
      id: row.id,
      url: processed.variants['w640.webp'] || processed.primaryUrl,
      variants: processed.variants,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed.'
    res.status(400).json({ error: message })
  }
})

app.use('/api', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.status(404).json({ error: 'Not found.' })
})

app.use(
  createRequestHandler({
    build: () => import('virtual:react-router/server-build'),
    getLoadContext() {
      return { storage }
    },
  }),
)

const reportError: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return
  const message = error instanceof Error ? error.message : ''
  res.setHeader('Cache-Control', 'no-store')
  if (message.startsWith('No route matches URL')) {
    res.status(404).type('text/plain').send('Not found.')
    return
  }
  res.status(500).json({ error: 'The server could not complete the request.' })
}
app.use(reportError)
