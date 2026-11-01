import { reactRouter } from '@react-router/dev/vite'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ isSsrBuild }) => ({
  build: {
    rollupOptions: isSsrBuild
      ? {
          input: './server/app.ts',
        }
      : undefined,
  },
  plugins: [
    reactRouter(),
    tsconfigPaths(),
    !isSsrBuild &&
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png', 'offline.html'],
        injectRegister: false,
        manifest: {
          id: '/g/o-gallery',
          name: 'Inview',
          short_name: 'Inview',
          lang: 'fa',
          dir: 'rtl',
          description: 'The show, the works and the prices, in your pocket.',
          theme_color: '#203F3B',
          background_color: '#E7E3D9',
          display: 'standalone',
          start_url: '/g/o-gallery',
          scope: '/',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: '/icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          globIgnores: ['artworks/**', '**/*latin-ext*', '**/*cyrillic*', '**/*vietnamese*'],
          navigateFallback: null,
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) =>
                request.mode === 'navigate' &&
                !url.pathname.startsWith('/dashboard') &&
                !url.pathname.startsWith('/ops') &&
                !url.pathname.startsWith('/staff') &&
                !url.pathname.startsWith('/api'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'pages',
                networkTimeoutSeconds: 3,
                expiration: { maxEntries: 64 },
                precacheFallback: { fallbackURL: '/offline.html' },
              },
            },
            {
              urlPattern: ({ request, url }) => request.destination === 'image' && !url.pathname.startsWith('/api'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'media',
                expiration: { maxEntries: 128 },
              },
            },
          ],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
      }),
  ].filter(Boolean),
}))
