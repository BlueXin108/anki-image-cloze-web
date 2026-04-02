import { useEffect, useState } from 'react'

export interface DeviceProfile {
  isTouchLike: boolean
  isMobileDevice: boolean
  isMobileLayout: boolean
  canDirectAnki: boolean
}

function detectDeviceProfile(): DeviceProfile {
  if (typeof window === 'undefined') {
    return {
      isTouchLike: false,
      isMobileDevice: false,
      isMobileLayout: false,
      canDirectAnki: true,
    }
  }

  const width = window.innerWidth
  const userAgent = window.navigator.userAgent
  const maxTouchPoints = window.navigator.maxTouchPoints ?? 0
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const mobilePlatform = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(userAgent)
  const isTouchLike = coarsePointer || maxTouchPoints > 0
  const isMobileLayout = width < 960
  const isMobileDevice = mobilePlatform || (isTouchLike && width < 1180)

  return {
    isTouchLike,
    isMobileDevice,
    isMobileLayout,
    canDirectAnki: !isMobileDevice,
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
