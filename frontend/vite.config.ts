import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
      // Patch: redirect compose-refs to our fixed version that stabilises
      // ref callbacks, preventing the React 19 "Maximum update depth" crash
      // caused by Radix ScrollArea / Dialog internally calling setState
      // inside ref callbacks during the commit phase.
      '@radix-ui/react-compose-refs': path.resolve(__dirname, './src/lib/compose-refs-fix.ts'),
    },
  },
})
