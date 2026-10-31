import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { handlePilot } from './server/pilot-store.mjs'

function pilotApi(): Plugin {
  const attach = (server: { middlewares: { use: (fn: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: () => void) => void) => void } }) => {
    server.middlewares.use(async (req, res, next) => {
      const url = req.url?.split('?')[0]
      if (url !== '/api/pilot') return next()
      try {
        let body = null
        if (req.method === 'POST' || req.method === 'PUT') {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          const raw = Buffer.concat(chunks).toString('utf8')
          body = raw ? JSON.parse(raw) : null
        }
        const result = await handlePilot(req.method, body)
        res.statusCode = result.status
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(result.body))
      } catch {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Invalid JSON.' }))
      }
    })
  }
  return {
    name: 'pilot-api',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}

export default defineConfig({
  plugins: [
    pilotApi(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Inview',
        short_name: 'Inview',
        description: 'The show, the works and the prices, in your pocket.',
        theme_color: '#203F3B',
        background_color: '#E7E3D9',
        display: 'standalone',
        start_url: '/g/rooz-gallery',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2}'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
      }
    })
  ]
})
