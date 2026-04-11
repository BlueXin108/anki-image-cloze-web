import { useEffect, useRef } from 'react'
import lottie from 'lottie-web'

import successLottie from '@/assets/lottie/success.json'
import { cn } from '@/lib/utils'

export function SuccessLottie({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const instance = lottie.loadAnimation({
      container: containerRef.current,
      renderer: 'svg',
      loop: false,
      autoplay: true,
      animationData: successLottie,
    })

    return () => {
      instance.destroy()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn('w-full [filter:grayscale(1)_contrast(1.08)_brightness(0.9)]', className)}
      aria-hidden="true"
    />
  )
}
