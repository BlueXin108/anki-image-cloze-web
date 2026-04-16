import path from 'node:path'
import type { Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { reactClickToComponent } from "vite-plugin-react-click-to-component";

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
function hashString(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0).toString(16)
}

function createServiceWorkerSource(precacheUrls: string[], version: string): string {
  return `const CACHE_VERSION = ${JSON.stringify(version)}
const PRECACHE_CACHE = 'anki-image-cloze-precache-' + CACHE_VERSION
const RUNTIME_CACHE = 'anki-image-cloze-runtime-' + CACHE_VERSION
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('anki-image-cloze-') && key !== PRECACHE_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

async function staleWhileRevalidateIndex(request) {
  const cache = await caches.open(PRECACHE_CACHE)
  const cached = await cache.match('/index.html')
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put('/index.html', response.clone())
      }
      return response
    })
    .catch(() => null)

  if (cached) {
    void networkPromise
    return cached
  }

  return (await networkPromise) || Response.error()
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(staleWhileRevalidateIndex(request))
    return
  }

  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request)),
    )
    return
  }

  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'image' ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const cloned = response.clone()
            void caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, cloned))
          }
          return response
        })
      }),
    )
  }
})`
}

function pwaServiceWorkerPlugin(): Plugin {
  return {
    name: 'anki-image-cloze-pwa-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const emittedFiles = Object.values(bundle)
        .map((chunk) => `/${chunk.fileName}`)
        .filter((fileName) => fileName !== '/sw.js' && !fileName.endsWith('.map'))
      const precacheUrls = [
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/favicon.svg',
        '/apple-touch-icon.png',
        '/pwa-192.png',
        '/pwa-512.png',
        ...emittedFiles,
      ].filter((value, index, array) => array.indexOf(value) === index)
      const version = hashString(precacheUrls.join('|'))
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: createServiceWorkerSource(precacheUrls, version),
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    pwaServiceWorkerPlugin(),
    reactClickToComponent(),
    cloudflare()
  ],
  optimizeDeps: {
    // Keep Radix out of the prebundle cache so our compose-refs alias is
    // always resolved from source instead of being frozen into .vite deps.
    exclude: ['radix-ui', '@radix-ui/react-compose-refs'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react') || id.includes('scheduler')) return 'react-vendor'
          if (id.includes('framer-motion')) return 'motion-vendor'
          if (id.includes('@radix-ui') || id.includes('/radix-ui/')) return 'radix-vendor'
          if (id.includes('lucide-react')) return 'icons-vendor'
          if (id.includes('sonner')) return 'feedback-vendor'
          if (id.includes('jszip') || id.includes('anki-apkg-generator')) return 'export-vendor'
          return 'vendor'
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    cors: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    cors: true,
    allowedHosts: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'use-sync-external-store/shim': path.resolve(__dirname, './src/lib/use-sync-external-store-shim-fix.ts'),
      // Patch: redirect compose-refs to our fixed version that stabilises
      // ref callbacks, preventing the React 19 "Maximum update depth" crash
      // caused by Radix ScrollArea / Dialog internally calling setState
      // inside ref callbacks during the commit phase.
      '@radix-ui/react-compose-refs': path.resolve(__dirname, './src/lib/compose-refs-fix.ts'),
    },
  },
})