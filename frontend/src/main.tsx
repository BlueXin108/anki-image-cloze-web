import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { registerPwa } from '@/lib/pwa'

if (typeof window !== 'undefined') {
  registerPwa()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
      <Analytics />
      <Toaster closeButton expand position="top-right" />
    </TooltipProvider>
  </StrictMode>,
)
