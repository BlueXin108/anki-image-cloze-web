import { motion, useSpring, useTransform, useMotionValue } from 'framer-motion'
import { MousePointer2Icon } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'

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
}

export function LandingBackground() {
  const [particles, setParticles] = useState<Particle[]>([])
  
  // 陀螺仪与鼠标状态
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const gyroX = useSpring(0, { stiffness: 60, damping: 25 })
  const gyroY = useSpring(0, { stiffness: 60, damping: 25 })

  useEffect(() => {
    const mobile = window.innerWidth < 768
    const count = mobile ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_PC
    
    const nextParticles: Particle[] = Array.from({ length: count }).map((_, i) => ({
      id: i,
      type: Math.random() > 0.4 ? 'mask' : 'cursor',
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: (mobile ? 50 : 70) + Math.random() * 130,
      baseRotation: Math.random() * 360,
      duration: 25 + Math.random() * 35,
    }))
    setParticles(nextParticles)

    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX)
      mouseY.set(e.clientY)
    }

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta !== null && e.gamma !== null) {
        gyroX.set(Math.max(-20, Math.min(20, e.beta / 3)))
        gyroY.set(Math.max(-20, Math.min(20, e.gamma / 3)))
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
  }, [gyroX, gyroY, mouseX, mouseY])

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-background pointer-events-none w-screen h-screen">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(var(--primary-rgb),0.06),transparent_80%)]" />
      
      {particles.map((p) => (
        <ParticleItem 
          key={p.id} 
          p={p} 
          mouseX={mouseX} 
          mouseY={mouseY} 
          gyroX={gyroX} 
          gyroY={gyroY} 
        />
      ))}
      
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-background to-transparent opacity-90" />
      <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-background to-transparent opacity-90" />
    </div>
  )
}

function ParticleItem({ p, mouseX, mouseY, gyroX, gyroY }: { 
  p: Particle, 
  mouseX: any, 
  mouseY: any, 
  gyroX: any, 
  gyroY: any 
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
      
      // 计算到鼠标的角度
      const deltaX = mouseX.get() - centerX
      const deltaY = mouseY.get() - centerY
      const rad = Math.atan2(deltaY, deltaX)
      const deg = (rad * 180) / Math.PI + 90 // 修正 Lucide 图标初始向上
      
      angle.set(deg)
    })
    return () => unsubscribe()
  }, [angle, mouseX, mouseY, p.type])

  const gX = useTransform(gyroY, (v: any) => v * 1.5)
  const gY = useTransform(gyroX, (v: any) => v * 1.5)
  const gRotate = useTransform([gyroX, gyroY], ([x, y]: any) => (x + y) * 0.8)

  return (
    <motion.div
      ref={ref}
      initial={{ x: `${p.x}vw`, y: `${p.y}vh`, rotate: p.baseRotation, opacity: 0 }}
      animate={{
        x: [`${p.x}vw`, `${(p.x + 8) % 100}vw`, `${p.x}vw`],
        y: [`${p.y}vh`, `${(p.y + 12) % 100}vh`, `${p.y}vh`],
        opacity: [0.2, 0.35, 0.2],
        scale: [1, 1.08, 1],
      }}
      transition={{
        x: { duration: p.duration, repeat: Infinity, ease: "linear" },
        y: { duration: p.duration * 1.3, repeat: Infinity, ease: "linear" },
        opacity: { duration: 4, repeat: Infinity, ease: "easeInOut" },
        scale: { duration: 5, repeat: Infinity, ease: "easeInOut" },
      }}
      className="absolute flex items-center justify-center text-primary/50"
      style={{
        rotate: p.type === 'cursor' ? angle : gRotate,
        translateX: gX,
        translateY: gY,
        width: p.size,
        height: p.size,
        left: 0,
        top: 0,
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
