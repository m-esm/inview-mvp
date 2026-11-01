import compression from 'compression'
import express from 'express'
import morgan from 'morgan'

const BUILD_PATH = './build/server/index.js'
const DEVELOPMENT = process.env.NODE_ENV === 'development'
const PORT = Number.parseInt(process.env.PORT || '3000', 10)

const app = express()
app.use(compression())
app.disable('x-powered-by')

if (DEVELOPMENT) {
  console.log('Starting development server')
  const viteDevServer = await import('vite').then((vite) =>
    vite.createServer({
      server: { middlewareMode: true },
    }),
  )
  app.use(viteDevServer.middlewares)
  app.use(async (req, res, next) => {
    try {
      const source = await viteDevServer.ssrLoadModule('./server/app.ts')
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
  console.log('Starting production server')
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
  app.use(morgan('tiny'))
  app.use(express.static('build/client', { maxAge: '1h' }))
  try {
    const mod = await import(BUILD_PATH)
    await mod.oGalleryReady
    app.use(mod.app)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server failed to start.'
    console.error(message)
    process.exit(1)
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`)
})
