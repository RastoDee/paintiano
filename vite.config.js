import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable.png'],
      manifest: {
        name: 'Paintiano',
        short_name: 'Paintiano',
        description: 'Music → φ painting',
        theme_color: '#c9a84c',
        background_color: '#06060c',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'icon-192.png',      sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png',      sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Embedded base64 samples push the JSX bundle above the default 2 MB precache limit
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // Precache only the static front-end build — never anything under /api.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        globIgnores: ['**/api/**'],
        // Keep navigation fallback away from /api so SPA fallback can't swallow it.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // CRITICAL: force every /api/* request straight to the network.
            // NetworkOnly means the service worker never caches or short-circuits
            // these — POST /api/compose now reaches the Vercel function instead
            // of getting a 404 from the SW. This is the fix for the 404.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            method: 'POST'
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            method: 'GET'
          },
          {
            urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdfjs-cdn',
              expiration: { maxEntries: 6, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/tonejs\.github\.io\/audio\/salamander\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'salamander-piano',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000
  }
});
