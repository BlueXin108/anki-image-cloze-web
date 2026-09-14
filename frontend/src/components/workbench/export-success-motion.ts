import type { Transition, Variants } from 'framer-motion'

const contentEnter: Transition = { duration: 0.8, ease: [0.16, 1, 0.3, 1] }
const contentExit: Transition = { duration: 1.4, ease: [0.54, 0, 0, 0.99] }
const lightExit: Transition = { duration: 1.8, ease: [0.34, 0, 0, 0.99] }
const darkExit: Transition = { duration: 1.2, delay: 0.1, ease: [0.54, 0, 0, 0.99] }

export const successFullscreenVariants: Variants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.3, delay: 0.9 } },
}

export const successContentVariants: Variants = {
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.6 } },
  exit: { transition: { staggerChildren: 0.05, staggerDirection: -1 } },
}

function contentItem(y: number, scale?: number): Variants {
  return {
    hidden: { opacity: 0, y, ...(scale === undefined ? {} : { scale }) },
    visible: { opacity: 1, y: 0, ...(scale === undefined ? {} : { scale: 1 }), transition: contentEnter },
    exit: { opacity: 0, y: 800, ...(scale === undefined ? {} : { scale }), transition: contentExit },
  }
}

export const successIconVariants = contentItem(200, 0.5)
export const successTitleVariants = contentItem(150)
export const successDescriptionVariants = contentItem(120)
export const successStatsVariants = contentItem(100)
export const successActionsVariants = contentItem(80)

export const successLightDiscVariants: Variants = {
  hidden: { scale: 0 },
  visible: { scale: 1, transition: { duration: 1.95, ease: [0.29, 0, 0, 0.99] } },
  exit: { scale: 0, opacity: 0.5, transition: lightExit },
}

export const successDarkDiscVariants: Variants = {
  hidden: { scale: 0 },
  visible: { scale: 1, transition: { duration: 1.6, delay: 0.2, ease: [0.54, 0, 0, 0.99] } },
  exit: { scale: 0, transition: darkExit },
}

// 位移按全屏高度计算，与圆盘自身的缩放分开，仍收向屏幕的 50% / 125%
function wavePosition(transition: Transition): Variants {
  return {
    hidden: { y: '0%' },
    visible: { y: '0%' },
    exit: { y: '75%', transition },
  }
}

export const successLightPositionVariants = wavePosition(lightExit)
export const successDarkPositionVariants = wavePosition(darkExit)
