import { useEffect, useRef } from 'react'
import lottie from 'lottie-web'

import loaderLottie from '@/assets/lottie/Loader.json'
import { cn } from '@/lib/utils'

export function LoaderLottie({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const instance = lottie.loadAnimation({
      container: containerRef.current,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: loaderLottie,
    })

    return () => {
      instance.destroy()
    }
  }, [])

  return <div ref={containerRef} className={cn('size-full', className)} aria-hidden="true" />
}
