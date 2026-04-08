import { motion, type HTMLMotionProps } from 'framer-motion'
import type { ReactNode } from 'react'

const pageEase = [0.54, 0, 0, 0.99] as const

/**
 * 页面切换动画变体定义
 * 遵循“绝对禁止内联魔法值”原则
 */
const pageVariants = {
  initial: {
    opacity: 0,
    y: 18,
  },
  animate: {
    opacity: 1,
    y: 0,
      transition: {
        duration: 1.5,
        ease: pageEase, // cb-inout
      },
  },
  exit: {
    opacity: 0,
    y: -12,
    transition: {
      duration: 0.28,
      ease: pageEase,
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
