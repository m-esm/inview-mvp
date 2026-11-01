import { createRequestHandler } from '@react-router/express'
import express from 'express'
import 'react-router'
import { createDatabase } from '../database/client'
import { DatabaseContext } from '../database/context'
import { resolveOGalleryAccessCode, syncOGalleryAccessCode } from './gallery-record'
import { mountApi } from './api-app'
import { createObjectStorage, localMediaMiddleware } from './storage'

declare module 'react-router' {
  interface AppLoadContext {
    storage: ReturnType<typeof createObjectStorage>
  }
}

export const app = express()

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

resolveOGalleryAccessCode()

const db = createDatabase(databaseUrl)
const storage = createObjectStorage()

export const oGalleryReady = syncOGalleryAccessCode(db).then(() => undefined)

app.use(localMediaMiddleware())
app.use(express.json({ limit: '12mb' }))

app.use((_req, _res, next) => {
  DatabaseContext.run(db, () => next())
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
