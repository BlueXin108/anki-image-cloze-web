import { useEffect, useState } from 'react'

export interface DeviceProfile {
  isTouchLike: boolean
  isMobileDevice: boolean
  isMobileLayout: boolean
  isTablet: boolean
  isPhone: boolean
  canDirectAnki: boolean
  canReliableCameraCapture: boolean
}

function detectDeviceProfile(): DeviceProfile {
  if (typeof window === 'undefined') {
    return {
      isTouchLike: false,
      isMobileDevice: false,
      isMobileLayout: false,
      isTablet: false,
      isPhone: false,
      canDirectAnki: true,
      canReliableCameraCapture: false,
    }
  }

  const width = window.innerWidth
  const userAgent = window.navigator.userAgent
  const maxTouchPoints = window.navigator.maxTouchPoints ?? 0
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const isIpadOs = maxTouchPoints > 2 && /MacIntel/.test(window.navigator.platform)
  const mobilePlatform = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(userAgent) || isIpadOs
  const isAndroid = /Android/i.test(userAgent)
  const chromeMatch = userAgent.match(/Chrome\/(\d+)/i)
  const chromeMajorVersion = chromeMatch ? Number.parseInt(chromeMatch[1] ?? '0', 10) : 0
  const isChromeLike = /Chrome\//i.test(userAgent)
  const isVia = /\bVia\b/i.test(userAgent)
  const canReliableCameraCapture =
    mobilePlatform &&
    isAndroid &&
    isChromeLike &&
    !isVia &&
    Number.isFinite(chromeMajorVersion) &&
    chromeMajorVersion >= 100

  const isTouchLike = coarsePointer || maxTouchPoints > 0

  const isIpad = /iPad/i.test(userAgent) || isIpadOs
  const isAndroidTablet = isAndroid && !/Mobile/i.test(userAgent)
  const isTablet = isIpad || isAndroidTablet || (mobilePlatform && Math.min(window.innerWidth, window.innerHeight) >= 600)
  const isPhone = mobilePlatform && !isTablet

  // PC uses normal layout. Tablets use PC layout (so `isMobileLayout` is false). Phones use Mobile layout.
  const isMobileLayout = isPhone || (!isTablet && width < 640)
  const isMobileDevice = mobilePlatform || (isTouchLike && width < 1180)

  return {
    isTouchLike,
    isMobileDevice,
    isMobileLayout,
    isTablet,
    isPhone,
    canDirectAnki: !isMobileDevice,
    canReliableCameraCapture,
  }
}

export function useDeviceProfile(): DeviceProfile {
  const [profile, setProfile] = useState<DeviceProfile>(() => detectDeviceProfile())

  useEffect(() => {
    if (typeof window === 'undefined') return

    const updateProfile = () => {
      setProfile(detectDeviceProfile())
    }

    updateProfile()
    window.addEventListener('resize', updateProfile)
    window.addEventListener('orientationchange', updateProfile)

    return () => {
      window.removeEventListener('resize', updateProfile)
      window.removeEventListener('orientationchange', updateProfile)
    }
  }, [])

  return profile
}
