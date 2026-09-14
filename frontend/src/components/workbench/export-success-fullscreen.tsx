import { motion } from 'framer-motion'

import { Button } from '@/components/ui/button'
import { DialogPortal } from '@/components/ui/dialog'
import { SuccessLottie } from '@/components/ui/success-lottie'
import {
  successActionsVariants,
  successContentVariants,
  successDarkDiscVariants,
  successDarkPositionVariants,
  successDescriptionVariants,
  successFullscreenVariants,
  successIconVariants,
  successLightDiscVariants,
  successLightPositionVariants,
  successStatsVariants,
  successTitleVariants,
} from './export-success-motion'
import './export-success-fullscreen.css'

interface ExportSuccessFullscreenProps {
  exportedCount: number
  lastExportDestination?: 'anki' | 'apkg' | 'image-group'
  onKeepExportedItems?: () => void
  onClearExportedItems?: () => void
  successDescription: string
}

export function ExportSuccessFullscreen({
  exportedCount,
  lastExportDestination,
  onKeepExportedItems,
  onClearExportedItems,
  successDescription,
}: ExportSuccessFullscreenProps) {
  return (
    <DialogPortal forceMount>
      <motion.div
        className="export-success-fullscreen"
        variants={successFullscreenVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <div className="export-success-wave z-0" aria-hidden="true">
          <motion.div className="export-success-wave-position" variants={successLightPositionVariants}>
            <motion.div className="export-success-ink-disc bg-background" variants={successLightDiscVariants} />
          </motion.div>
        </div>
        <div className="export-success-wave z-[1]" aria-hidden="true">
          <motion.div className="export-success-wave-position" variants={successDarkPositionVariants}>
            <motion.div className="export-success-ink-disc bg-foreground/90" variants={successDarkDiscVariants} />
          </motion.div>
        </div>

        <motion.div
          variants={successContentVariants}
          className="relative z-10 flex w-full max-w-xl flex-col items-center p-6 text-background text-center"
        >
          <motion.div variants={successIconVariants} className="relative mb-8">
            <div className="absolute inset-0 p-4 rounded-full bg-background/5 blur-md pointer-events-none">
              <SuccessLottie delayMs={650} className="w-40 sm:w-44 [filter:grayscale(1)_contrast(1.08)_brightness(1.7)]" />
            </div>
            <div className="relative z-10 p-4 rounded-full bg-background/5">
              <SuccessLottie delayMs={650} className="w-40 sm:w-44 [filter:grayscale(1)_contrast(1.08)_brightness(1.7)]" />
            </div>
          </motion.div>

          <motion.h2 variants={successTitleVariants} className="mb-4 text-2xl font-bold tracking-tight text-background">
            导出成功
          </motion.h2>
          <motion.p variants={successDescriptionVariants} className="mb-8 text-xs leading-relaxed text-background/80 max-w-md mx-auto">
            {successDescription}
          </motion.p>
          <motion.div variants={successStatsVariants} className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-[14px] text-background/60 mb-10">
            <div className="flex items-center gap-2">
              <span>已导出图片</span>
              <span className="font-semibold text-background/90 text-[15px]">{exportedCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <span>方式</span>
              <span className="font-semibold text-background/90 text-[15px]">
                {lastExportDestination === 'anki' ? 'AnkiConnect' : lastExportDestination === 'image-group' ? '图像组' : 'APKG'}
              </span>
            </div>
          </motion.div>
          <motion.div variants={successActionsVariants} className="w-full max-w-md grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-12 w-full rounded-xl text-[15px] font-medium border-background/20 bg-transparent text-background hover:bg-background/10 hover:text-background"
              onClick={onKeepExportedItems}
            >
              保留已编辑项目
            </Button>
            <Button
              className="h-12 w-full rounded-xl text-[15px] font-medium bg-background text-foreground hover:bg-background/90"
              onClick={onClearExportedItems}
            >
              清空已编辑项目
            </Button>
          </motion.div>
        </motion.div>
      </motion.div>
    </DialogPortal>
  )
}
