import { motion, useSpring, useTransform, useMotionValue } from 'framer-motion'
import { MousePointer2Icon } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'

const PARTICLE_COUNT_PC = 16
const PARTICLE_COUNT_MOBILE = 6

type Particle = {
  id: number
  type: 'mask' | 'cursor'
  x: number // vw
  y: number // vh
  size: number
  baseRotation: number
  duration: number
  driftX: number
  driftY: number
  delay: number
  depth: number
}

export function LandingBackground() {
  // 陀螺仪与鼠标状态
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const sceneX = useMotionValue(0)
  const sceneY = useMotionValue(0)
  const gyroX = useSpring(0, { stiffness: 42, damping: 28, mass: 1.3 })
  const gyroY = useSpring(0, { stiffness: 42, damping: 28, mass: 1.3 })
  const sceneSpringX = useSpring(sceneX, { stiffness: 28, damping: 26, mass: 1.55 })
  const sceneSpringY = useSpring(sceneY, { stiffness: 28, damping: 26, mass: 1.55 })
  const sceneRotateY = useTransform(sceneSpringX, (v) => v * 8.8)
  const sceneRotateX = useTransform(sceneSpringY, (v) => v * -6.6)
  const sceneShiftX = useTransform(sceneSpringX, (v) => v * 22)
  const sceneShiftY = useTransform(sceneSpringY, (v) => v * 15)

  const particles = useMemo<Particle[]>(() => {
    if (typeof window === 'undefined') return []
    const mobile = window.innerWidth < 768
    const count = mobile ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_PC

    return Array.from({ length: count }).map((_, i) => ({
      id: i,
      type: Math.random() > 0.4 ? 'mask' : 'cursor',
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: (mobile ? 50 : 70) + Math.random() * 130,
      baseRotation: Math.random() * 360,
      duration: 13 + Math.random() * 15,
      driftX: (Math.random() - 0.5) * (mobile ? 30 : 56),
      driftY: (Math.random() - 0.5) * (mobile ? 34 : 62),
      delay: Math.random() * 0.8,
      depth: 0.35 + Math.random() * 1.25,
    }))
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX)
      mouseY.set(e.clientY)
      const normalizedX = (e.clientX / window.innerWidth - 0.5) * 2
      const normalizedY = (e.clientY / window.innerHeight - 0.5) * 2
      sceneX.set(Math.max(-1, Math.min(1, normalizedX)))
      sceneY.set(Math.max(-1, Math.min(1, normalizedY)))
    }

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta !== null && e.gamma !== null) {
        gyroX.set(Math.max(-20, Math.min(20, e.beta / 3)))
        gyroY.set(Math.max(-20, Math.min(20, e.gamma / 3)))
        sceneX.set(Math.max(-1, Math.min(1, e.gamma / 18)))
        sceneY.set(Math.max(-1, Math.min(1, e.beta / 24)))
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleOrientation)
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('deviceorientation', handleOrientation)
    }
  }, [gyroX, gyroY, mouseX, mouseY, sceneX, sceneY])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.2, ease: [0, 0.43, 0, 0.99] }}
      className="absolute inset-0 z-0 overflow-hidden bg-background pointer-events-none opacity-0 will-change-[opacity]"
    >
      <motion.div
        style={{
          rotateX: sceneRotateX,
          rotateY: sceneRotateY,
          x: sceneShiftX,
          y: sceneShiftY,
          transformPerspective: 1400,
          transformStyle: 'preserve-3d',
        }}
        className="absolute inset-0 will-change-transform"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, ease: [0, 0.43, 0, 0.99], delay: 0.08 }}
          className="absolute inset-0 opacity-0 will-change-[opacity] bg-[radial-gradient(circle_at_50%_50%,rgba(var(--primary-rgb),0.06),transparent_80%)]"
        />
        
        {particles.map((p) => (
          <ParticleItem 
            key={p.id} 
            p={p} 
            mouseX={mouseX} 
            mouseY={mouseY} 
            gyroX={gyroX} 
            gyroY={gyroY}
            sceneSpringX={sceneSpringX}
            sceneSpringY={sceneSpringY}
          />
        ))}
      </motion.div>
      
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.9 }}
        transition={{ duration: 1.2, ease: [0, 0.43, 0, 0.99], delay: 0.14 }}
        className="absolute top-0 left-0 right-0 h-64 opacity-0 will-change-[opacity] bg-gradient-to-b from-background to-transparent"
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.9 }}
        transition={{ duration: 1.2, ease: [0, 0.43, 0, 0.99], delay: 0.2 }}
        className="absolute bottom-0 left-0 right-0 h-64 opacity-0 will-change-[opacity] bg-gradient-to-t from-background to-transparent"
      />
    </motion.div>
  )
}

function ParticleItem({ p, mouseX, mouseY, gyroX, gyroY, sceneSpringX, sceneSpringY }: { 
  p: Particle, 
  mouseX: any, 
  mouseY: any, 
  gyroX: any, 
  gyroY: any,
  sceneSpringX: any,
  sceneSpringY: any,
}) {
  const ref = useRef<HTMLDivElement>(null)
  const angle = useSpring(p.baseRotation, { stiffness: 40, damping: 20 })

  useEffect(() => {
    if (p.type !== 'cursor') return

    const unsubscribe = mouseX.on('change', () => {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      
      const deltaX = mouseX.get() - centerX
      const deltaY = mouseY.get() - centerY
      const rad = Math.atan2(deltaY, deltaX)
      const deg = (rad * 180) / Math.PI + 90
      
      angle.set(deg)
    })
    return () => unsubscribe()
  }, [angle, mouseX, mouseY, p.type])

  const gX = useTransform(gyroY, (v: any) => v * 1.1 * p.depth)
  const gY = useTransform(gyroX, (v: any) => v * 1.1 * p.depth)
  const sceneParallaxX = useTransform(sceneSpringX, (v: any) => v * 36 * p.depth)
  const sceneParallaxY = useTransform(sceneSpringY, (v: any) => v * 28 * p.depth)
  const sceneScale = useTransform(sceneSpringY, (v: any) => 1 + Math.abs(v) * 0.028 * p.depth)
  const depthTranslate = p.depth * 84
  const combinedX = useTransform([gX, sceneParallaxX], (values) => Number(values[0] ?? 0) + Number(values[1] ?? 0))
  const combinedY = useTransform([gY, sceneParallaxY], (values) => Number(values[0] ?? 0) + Number(values[1] ?? 0))
  const baseOpacity = 0.14 + p.depth * 0.04
  const peakOpacity = 0.26 + p.depth * 0.05

  return (
    <motion.div
      ref={ref}
      initial={{ 
        left: `${p.x}vw`, 
        top: `${p.y}vh`, 
        rotate: p.baseRotation, 
        opacity: 0,
        scale: 0.8 
      }}
      animate={{
        x: [0, p.driftX, 0],
        y: [0, p.driftY, 0],
        opacity: [baseOpacity, peakOpacity, baseOpacity],
        scale: [1, 1.045 + p.depth * 0.02, 1],
      }}
      transition={{
        x: { duration: p.duration, repeat: Infinity, repeatType: 'mirror', ease: [0.54, 0, 0, 0.99], delay: p.delay },
        y: { duration: p.duration * 1.18, repeat: Infinity, repeatType: 'mirror', ease: [0.54, 0, 0, 0.99], delay: p.delay / 2 },
        opacity: { duration: 8, repeat: Infinity, ease: [0.54, 0, 0, 0.99], delay: p.delay },
        scale: { duration: 8.8, repeat: Infinity, ease: [0.54, 0, 0, 0.99], delay: p.delay / 1.4 },
      }}
      className="absolute flex items-center justify-center text-primary/40"
      style={{
        rotate: p.type === 'cursor' ? angle : p.baseRotation,
        x: combinedX,
        y: combinedY,
        scale: sceneScale,
        z: depthTranslate,
        translateZ: depthTranslate,
        width: p.size,
        height: p.size,
      }}
    >
      {p.type === 'mask' ? (
        <div 
          className="w-full h-full border-[2.5px] border-dashed border-current rounded-2xl shadow-[inset_0_0_30px_rgba(var(--primary-rgb),0.05)] backdrop-blur-[3px]"
          style={{ borderRadius: p.size * 0.18 }}
        />
      ) : (
        <div className="filter drop-shadow-2xl opacity-90">
          <MousePointer2Icon 
            strokeWidth={1.4} 
            style={{ width: p.size * 0.5, height: p.size * 0.5 }} 
          />
        </div>
      )}
    </motion.div>
  )
}
