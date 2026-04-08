import { motion, HTMLMotionProps } from 'framer-motion'
import { ReactNode } from 'react'

/**
 * 页面切换动画变体定义
 * 遵循“绝对禁止内联魔法值”原则
 */
const pageVariants = {
  initial: {
    opacity: 0,
    scale: 0.98,
    filter: 'blur(10px)',
  },
  animate: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1], // cb-out 曲线
      staggerChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    scale: 1.02,
    filter: 'blur(10px)',
    transition: {
      duration: 0.4,
      ease: [0.7, 0, 0.84, 0], // easeIn 曲线
    },
  },
}

interface PageTransitionProps extends HTMLMotionProps<'div'> {
  children: ReactNode
}

/**
 * 页面级过渡包装器
 * 用于 LandingPage 与 Workbench 之间的平滑切换
 */
export function PageTransition({ children, className, ...props }: PageTransitionProps) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}
