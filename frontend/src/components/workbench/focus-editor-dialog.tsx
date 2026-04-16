import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeftIcon, ChevronRightIcon, Settings2Icon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { DraftListItem, WorkbenchSettings } from '@/types'
import { ImageEditor } from '@/components/editor/image-editor'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog'
import { XIcon } from "lucide-react"
import { Kbd } from '@/components/ui/kbd'
import { WorkbenchSettingsDialog } from '@/components/workbench/workbench-settings-dialog'

interface FocusEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: DraftListItem | null
  cardCount: number
  onMasksCommit: (masks: DraftListItem['draft']['masks']) => Promise<void>
  onCropCommit: (bbox: [number, number, number, number]) => Promise<void>
  title?: string
  description?: string
  onPreviousItem?: () => void
  onNextItem?: () => void
  canGoPrevious?: boolean
  canGoNext?: boolean
  previousLabel?: string
  nextLabel?: string
  touchOptimized?: boolean
  disableWheelResize?: boolean
  overlayClassName?: string
  contentClassName?: string
  modernFloatingToolbar?: boolean
  workbenchSettings: WorkbenchSettings
  onWorkbenchSettingsChange: (settings: WorkbenchSettings) => void
}

const focusShortcuts = [
  { key: 'Q', label: '退出聚焦' },
  { key: 'A / D', label: '切换图片' },
  { key: 'Alt + 拖动', label: '新建遮罩' },
  { key: 'E', label: '删除选中遮罩' },
  { key: 'Ctrl + 点击', label: '多选' },
  { key: 'Ctrl + A', label: '全选' },
  { key: '1-9', label: '快速选中' },
  { key: 'Tab', label: '合并/拆分卡片' },
  { key: '中键', label: '拖线重排序号' },
  { key: 'Ctrl + Z/Y', label: '撤回重做' },
  { key: 'V', label: '显隐遮罩' },
  { key: 'R', label: '显隐 OCR' },
] as const

export function FocusEditorDialog({
  open,
  onOpenChange,
  item,
  cardCount,
  onMasksCommit,
  onCropCommit,
  title = '聚焦编辑',
  description = '使用光标或快捷键进行编辑',
  onPreviousItem,
  onNextItem,
  canGoPrevious = false,
  canGoNext = false,
  previousLabel = '',
  nextLabel = '',
  touchOptimized = false,
  disableWheelResize = false,
  overlayClassName,
  contentClassName,
  modernFloatingToolbar,
  workbenchSettings,
  onWorkbenchSettingsChange,
}: FocusEditorDialogProps) {
  const [mounted, setMounted] = useState(false)
  const [mobileSessionKey, setMobileSessionKey] = useState(0)
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!touchOptimized || !open) return
    setMobileSessionKey((current) => current + 1)
  }, [open, touchOptimized])

  if (!item) return null

  return (
   <Dialog open={open} onOpenChange={onOpenChange}>
      {/* --- 核心修改区：常驻底部的快捷键提示 --- */}
      {mounted && open && !touchOptimized
        ? createPortal(
            <div
              aria-hidden="true"
              className={cn(
                // 1. 定位：固定在屏幕底部，加高 paddingTop (pt-16) 让渐变过渡更自然
                'pointer-events-none fixed inset-x-0 bottom-0 z-[99999] flex flex-col items-center pb-4 pt-8',
                // 2. 渐变：从下往上 (to-t) 消散。使用 theme 变量自适应深浅色模式
                'bg-gradient-to-t from-background/100 via-background/95 to-transparent'
              )}
            >
              {/* 第一层：文字提示与轻柔的横线 */}
              <div className="mb-2 flex w-full max-w-2xl flex-col items-center px-4">
                <div className="text-[11px] font-medium tracking-wide text-muted-foreground">
                  使用快捷键进行编辑
                </div>
                <div className="mt-1 h-px w-full bg-border/60" />
              </div>

              {/* 第二层：快捷键列表 */}
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-6">
                {focusShortcuts.map((shortcut) => (
                  <span
                    key={shortcut.key}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-bold"
                  >
                    <Kbd>{shortcut.key}</Kbd>
                    <span className="font-medium text-foreground/80">{shortcut.label}</span>
                  </span>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
      {/* --- 核心修改区结束 --- */}
      <DialogContent 
        showCloseButton={false}
        overlayClassName={overlayClassName}
        data-telemetry-section="focus-editor"
        className={cn(
          "flex flex-col p-0 border-none bg-transparent shadow-none overflow-visible !ring-0",
          touchOptimized ? "h-fit max-h-[96dvh] w-[95vw] !max-w-[95vw]" : "h-[95vh] !w-[90vw] !max-w-[95vw]",
          contentClassName,
        )}>
        <motion.div
           layout
           transition={{ duration: 0.35, ease: [0, 0.43, 0, 0.99] }}
           className={cn(
             "flex h-full w-full flex-col gap-0 overflow-hidden border border-border/70 bg-background/95 shadow-2xl",
             touchOptimized ? "rounded-[2rem] pt-2" : "rounded-[2rem] py-2 pb-10"
           )}
           onContextMenu={(event) => {
             if (!touchOptimized) return
             event.preventDefault()
           }}
           style={touchOptimized ? { WebkitTouchCallout: 'none' } : undefined}
        >
        <DialogHeader className={cn("border-b border-border/60", touchOptimized ? "px-3 py-2.5" : "px-6 py-4")}>
          <div className="flex items-center gap-2.5 sm:gap-3 overflow-hidden">
            <DialogTitle className={cn("shrink-0", touchOptimized && "ml-2 text-[15px] mr-2")}>{title}</DialogTitle>
            
            <div className={cn("flex flex-1 items-center gap-1.5 sm:gap-2 text-muted-foreground overflow-hidden whitespace-nowrap", touchOptimized ? "text-[10px]" : "text-xs")}>
              {!touchOptimized && description && (
                <>
                  <DialogDescription className="shrink-0 truncate">{description}</DialogDescription>
                  <span className="shrink-0 opacity-50">|</span>
                </>
              )}
              <span className="shrink-0">{cardCount} 张卡片</span>
              <span className="shrink-0 opacity-50">|</span>
              {touchOptimized ? (
                <span className="text-primary/70 font-medium truncate">支持双指缩放编辑与两侧切图</span>
              ) : (canGoPrevious || canGoNext) ? (
                <span className="truncate">A / D 可快速切图</span>
              ) : null}
            </div>

            <div className="flex flex-shrink-0 items-center gap-0.5 sm:gap-1 pl-2 border-l">
              {touchOptimized ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full size-7"
                  onClick={() => setMobileSettingsOpen(true)}
                >
                  <Settings2Icon className="size-4" />
                  <span className="sr-only">编辑设置</span>
                </Button>
              ) : null}
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={cn("rounded-full", touchOptimized ? "size-7" : "size-8")}
                >
                  <XIcon className="size-4" />
                </Button>
              </DialogClose>
            </div>
          </div>
        </DialogHeader>
        <div className={cn("relative min-h-0 overflow-hidden flex flex-col flex-1", touchOptimized ? "px-2 py-2" : "px-4 py-3 md:px-5 md:py-4")}>
          {canGoPrevious ? (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className={cn(
                'absolute left-0 top-1/2 z-[60] -translate-y-1/2 rounded-r-lg rounded-l-none border-l-0 shadow-md bg-background/80 backdrop-blur-sm',
                touchOptimized ? 'h-16 w-8' : 'size-10 rounded-full',
              )}
              onClick={onPreviousItem}
            >
              <ChevronLeftIcon className={cn(touchOptimized && "size-5")} />
              <span className="sr-only">{previousLabel}</span>
            </Button>
          ) : null}

          {canGoNext ? (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className={cn(
                'absolute right-0 top-1/2 z-[60] -translate-y-1/2 rounded-l-lg rounded-r-none border-r-0 shadow-md bg-background/80 backdrop-blur-sm',
                touchOptimized ? 'h-16 w-8' : 'size-10 rounded-full',
              )}
              onClick={onNextItem}
            >
              <span className="sr-only">{nextLabel}</span>
              <ChevronRightIcon className={cn(touchOptimized && "size-5")} />
            </Button>
          ) : null}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              layoutId={item ? `editor-view-${item.draft.id}` : undefined}
              key={touchOptimized ? `focus-mobile-${mobileSessionKey}-${item.draft.id}` : `focus-${item.draft.id}`}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35, ease: [0, 0.43, 0, 0.99] }}
              className="w-full relative flex-1 flex flex-col min-h-0"
            >
              <ImageEditor
                draft={item.draft}
                sourceImageUrl={item.image.source_url || ''}
                imageWidth={item.image.width}
                imageHeight={item.image.height}
                onMasksCommit={onMasksCommit}
                onCropCommit={onCropCommit}
                showOcrTools={false}
                showCropSubmit={false}
                focusLayout
                hideMetaBar={!touchOptimized}
                disableWheelResize={disableWheelResize}
                touchOptimized={touchOptimized}
                onPreviousItem={onPreviousItem}
                onNextItem={onNextItem}
                canGoPrevious={canGoPrevious}
                canGoNext={canGoNext}
                allowLongPressDelete={workbenchSettings.mobileLongPressDeleteMask}
                modernFloatingToolbar={modernFloatingToolbar}
              />
            </motion.div>
          </AnimatePresence>
        </div>
        {touchOptimized && (
          <div className="border-t border-border/60 bg-muted/20 p-3 flex justify-center mt-auto">
            <Button className="w-full max-w-sm shadow-sm font-semibold rounded-xl" onClick={() => onOpenChange(false)}>
              处理完成
            </Button>
          </div>
        )}
        </motion.div>
      </DialogContent>
      {touchOptimized ? (
        <WorkbenchSettingsDialog
          open={mobileSettingsOpen}
          onOpenChange={setMobileSettingsOpen}
          settings={workbenchSettings}
          onSettingsChange={onWorkbenchSettingsChange}
          showTrigger={false}
          scope="focus-mobile"
        />
      ) : null}
    </Dialog>
  )
}
