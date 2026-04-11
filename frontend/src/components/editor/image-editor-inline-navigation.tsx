import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import { Button } from '@/components/ui/button'

interface ImageEditorInlineNavigationProps {
  visible: boolean
  canGoPrevious: boolean
  canGoNext: boolean
  onPreviousItem?: () => void
  onNextItem?: () => void
}

export function ImageEditorInlineNavigation({
  visible,
  canGoPrevious,
  canGoNext,
  onPreviousItem,
  onNextItem,
}: ImageEditorInlineNavigationProps) {
  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <>
          {canGoPrevious ? (
            <motion.div
              key="inline-nav-prev"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="absolute left-3 top-1/2 z-30 -translate-y-1/2"
            >
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-10 rounded-full border border-border/70 bg-background/88 shadow-lg backdrop-blur-sm"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  onPreviousItem?.()
                }}
              >
                <ChevronLeftIcon className="size-5" />
                <span className="sr-only">上一张图片</span>
              </Button>
            </motion.div>
          ) : null}

          {canGoNext ? (
            <motion.div
              key="inline-nav-next"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="absolute right-3 top-1/2 z-30 -translate-y-1/2"
            >
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-10 rounded-full border border-border/70 bg-background/88 shadow-lg backdrop-blur-sm"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  onNextItem?.()
                }}
              >
                <ChevronRightIcon className="size-5" />
                <span className="sr-only">下一张图片</span>
              </Button>
            </motion.div>
          ) : null}
        </>
      ) : null}
    </AnimatePresence>
  )
}
