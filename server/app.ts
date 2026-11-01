import { createRequestHandler } from '@react-router/express'
import express from 'express'
import type { ErrorRequestHandler } from 'express'
import 'react-router'
import { closeDatabase, createDatabase } from '../database/client'
import { DatabaseContext } from '../database/context'
import { resolveOGalleryAccessCode, syncOGalleryAccessCode } from './gallery-record'
import { mountApi } from './api-app'
import { metricsText, recordStatus } from './metrics'
import { contentSecurityPolicy } from './csp'
import { pingDatabase, sendReady } from './ready'
import { createObjectStorage, localMediaMiddleware } from './storage'

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

mountApi(app, db, storage)

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
