import { useEffect, useRef } from 'react'
import lottie from 'lottie-web'

import successLottie from '@/assets/lottie/success.json'
import { cn } from '@/lib/utils'

export function SuccessLottie({ className, delayMs }: { className?: string; delayMs?: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const instance = lottie.loadAnimation({
      container: containerRef.current,
      renderer: 'svg',
      loop: false,
      autoplay: !delayMs,
      animationData: successLottie,
    })

    if (delayMs) {
      const timer = setTimeout(() => {
        instance.play()
      }, delayMs)
      return () => {
        clearTimeout(timer)
        instance.destroy()
      }
    }

    return () => {
      instance.destroy()
    }
  }, [delayMs])

  return (
    <div
      ref={containerRef}
      className={cn('w-full [filter:grayscale(1)_contrast(1.08)_brightness(0.9)]', className)}
      aria-hidden="true"
    />
  )
}
