import compression from 'compression'
import express from 'express'
import { installProcessLog, logEvent, requestLog, setStatusRecorder } from './server/http-log.js'
import { trustClusterProxy } from './server/proxy.js'

const BUILD_PATH = './build/server/index.js'
const DEVELOPMENT = process.env.NODE_ENV === 'development'
const PORT = Number.parseInt(process.env.PORT || '3000', 10)

installProcessLog()

const app = trustClusterProxy(express())
app.use(compression())
app.disable('x-powered-by')
app.use(requestLog())

let closeInner = async () => {}
let beginDrain = () => {}

/**
 * @param {{ beginDrain?: () => void, closeServer?: () => Promise<void>, recordStatus?: (status: number) => void }} source
 */
function remember(source) {
  beginDrain = () => {
    source.beginDrain?.()
  }
  closeInner = () => source.closeServer?.() ?? Promise.resolve()
  if (source.recordStatus) setStatusRecorder(source.recordStatus)
}

if (DEVELOPMENT) {
  logEvent('info', 'starting', { mode: 'development' })
  const viteDevServer = await import('vite').then((vite) =>
    vite.createServer({
      server: { middlewareMode: true },
    }),
  )
  app.use(viteDevServer.middlewares)
  app.use(async (req, res, next) => {
    try {
      const source = await viteDevServer.ssrLoadModule('./server/app.ts')
      remember(source)
      await source.oGalleryReady
      return await source.app(req, res, next)
    } catch (error) {
      if (typeof error === 'object' && error instanceof Error) {
        viteDevServer.ssrFixStacktrace(error)
      }
      next(error)
    }
  })
} else {
  logEvent('info', 'starting', { mode: 'production' })
  app.use(
    '/assets',
    express.static('build/client/assets', {
      immutable: true,
      maxAge: '1y',
      setHeaders(res) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      },
    }),
  )
  const REVALIDATE = new Set(['/sw.js', '/manifest.webmanifest', '/offline.html'])
  app.use(
    express.static('build/client', {
      maxAge: '1h',
      setHeaders(res, filePath) {
        const name = filePath.slice(filePath.lastIndexOf('/'))
        if (REVALIDATE.has(name) || name.startsWith('/workbox-')) res.setHeader('Cache-Control', 'no-cache')
        if (name === '/sw.js') res.setHeader('Service-Worker-Allowed', '/')
      },
    }),
  )
  try {
    const mod = await import(BUILD_PATH)
    remember(mod)
    await mod.oGalleryReady
    app.use(mod.app)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server failed to start.'
    console.error(message)
    process.exit(1)
  }
}

const server = app.listen(PORT, () => {
  logEvent('info', 'listening', { port: PORT })
})

const SHUTDOWN_MS = 20_000
let shuttingDown = false

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  beginDrain()
  if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections()
  const timer = setTimeout(() => process.exit(1), SHUTDOWN_MS)
  timer.unref()
  server.close(() => {
    closeInner().then(
      () => process.exit(0),
      () => process.exit(1),
    )
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
