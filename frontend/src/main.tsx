import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import App from './App.tsx'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { registerPwa } from '@/lib/pwa'

type BrowserProcessShim = {
  env: Record<string, string>
  argv: string[]
  versions: Record<string, string | undefined>
  type: string
  nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => void
}

if (typeof window !== 'undefined') {
  const globalWithProcess = globalThis as typeof globalThis & Record<string, unknown>
  const existingProcess = globalWithProcess.process as Partial<BrowserProcessShim> | undefined

  const processShim: BrowserProcessShim = {
    env: {
      APP_ENV: 'browser',
      ...(existingProcess?.env ?? {}),
    },
    argv: existingProcess?.argv ?? [],
    versions: {
      ...(existingProcess?.versions ?? {}),
    },
    type: existingProcess?.type ?? 'browser',
    nextTick:
      existingProcess?.nextTick ??
      ((callback, ...args) => {
        queueMicrotask(() => callback(...args))
      }),
  }

  ;(globalWithProcess as { process?: unknown }).process = processShim as unknown
  registerPwa()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
      <Analytics />
      <SpeedInsights />
      <Toaster closeButton expand position="top-right" />
    </TooltipProvider>
  </StrictMode>,
)
