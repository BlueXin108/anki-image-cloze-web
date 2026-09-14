import { ArrowUpDownIcon, CheckSquareIcon, CropIcon, EyeIcon, EyeOffIcon, PlusIcon, Redo2Icon, RotateCcwIcon, Trash2Icon, Undo2Icon } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ImageEditorToolbarProps {
  touchOptimized: boolean
  focusLayout: boolean
  mobileInteractionMode: 'navigate' | 'crop' | 'select' | 'sort'
  selectedCount: number
  canUndo: boolean
  canRedo: boolean
  showMaskOverlay: boolean
  showCropSubmit: boolean
  onAddMask: () => void
  onRemoveSelected: () => void
  onUndo: () => void
  onRedo: () => void
  onSetMobileInteractionMode: (mode: 'navigate' | 'crop' | 'select' | 'sort') => void
  onToggleMaskOverlay: () => void
  onSubmitCrop: () => void
  onReset: () => void
}

export function ImageEditorToolbar({
  touchOptimized,
  focusLayout,
  mobileInteractionMode,
  selectedCount,
  canUndo,
  canRedo,
  showMaskOverlay,
  showCropSubmit,
  onAddMask,
  onRemoveSelected,
  onUndo,
  onRedo,
  onSetMobileInteractionMode,
  onToggleMaskOverlay,
  onSubmitCrop,
  onReset,
}: ImageEditorToolbarProps) {
  const [activeHint, setActiveHint] = useState<{ label: string; left: number; top: number } | null>(null)
  const [portalReady, setPortalReady] = useState(false)

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    if (!activeHint) return
    const timer = window.setTimeout(() => setActiveHint(null), 2000)
    return () => window.clearTimeout(timer)
  }, [activeHint])

  const showHint = (label: string, target: HTMLElement) => {
    if (!touchOptimized) return
    const rect = target.getBoundingClientRect()
    setActiveHint({
      label,
      left: rect.left + rect.width / 2,
      top: rect.bottom -8,
    })
  }

  const handleWithHint = (label: string, action: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
    showHint(label, event.currentTarget)
    action()
  }

  return (
    <div
      className={cn(
        'relative z-[80] flex w-full items-center overflow-visible border-0 border-border/20 bg-background/0 p-1.5 shadow-none shadow-neutral-900/5 backdrop-blur-xl trs-all-400 isolate',
        touchOptimized ? 'rounded-[1.25rem] w-full max-w-[98%] mx-auto justify-center gap-0.5 px-1' : 'rounded-full justify-center gap-1.5',
        !touchOptimized && focusLayout && 'bg-background/85 absolute top-4 left-1/2 -translate-x-1/2 w-fit hover:shadow-none hover:scale-[1.01] hover:bg-background/20',
      )}
    >
      <div className={cn("flex items-center", touchOptimized ? "gap-0" : "gap-1")}>
        <div className="relative">
          <Button variant="ghost" size="icon" className={cn("rounded-full active:scale-[0.98] hover:bg-muted/80 text-foreground/80 focus-visible:ring-0 hover:rotate-90 trs-all-400", touchOptimized ? "size-[2.15rem]" : "size-9")} onClick={handleWithHint('新建遮罩', onAddMask)} title="新建遮罩">
            <PlusIcon className="size-[1.125rem]" />
          </Button>
        </div>
        <div className="relative">
          <Button variant="ghost" size="icon" className={cn("rounded-full active:scale-[0.98] hover:bg-muted/80 text-foreground/80 focus-visible:ring-0 disabled:opacity-30 disabled:pointer-events-none", touchOptimized ? "size-[2.15rem]" : "size-9")} onClick={handleWithHint('删除遮罩', onRemoveSelected)} disabled={selectedCount === 0} title={selectedCount > 1 ? `删除选中（${selectedCount}）` : '删除遮罩'}>
            <Trash2Icon className="size-[1.125rem]" />
          </Button>
        </div>
      </div>

      <div className="w-px h-4 mx-0.5 bg-border/60" />

      <div className={cn("flex items-center", touchOptimized ? "gap-0" : "gap-1")}>
        <div className="relative">
          <Button variant="ghost" size="icon" className={cn("rounded-full active:scale-[0.98] hover:bg-muted/80 text-foreground/80 focus-visible:ring-0 disabled:opacity-30 disabled:pointer-events-none hover:-translate-x-0.5", touchOptimized ? "size-[2.15rem]" : "size-9")} onClick={handleWithHint('撤销', onUndo)} disabled={!canUndo} title="撤销">
            <Undo2Icon className="size-[1.125rem]" />
          </Button>
        </div>
        <div className="relative">
          <Button variant="ghost" size="icon" className={cn("rounded-full active:scale-[0.98] hover:bg-muted/80 text-foreground/80 focus-visible:ring-0 disabled:opacity-30 disabled:pointer-events-none hover:translate-x-0.5", touchOptimized ? "size-[2.15rem]" : "size-9")} onClick={handleWithHint('重做', onRedo)} disabled={!canRedo} title="重做">
            <Redo2Icon className="size-[1.125rem]" />
          </Button>
        </div>
      </div>

      <div className="w-px h-4 mx-0.5 bg-border/60" />

      {touchOptimized ? (
        <div className={cn("flex items-center", touchOptimized ? "gap-0" : "gap-1")}>
          <div className="relative">
            <Button
            variant={mobileInteractionMode === 'crop' ? 'secondary' : 'ghost'}
            size="icon"
            className={cn(
              'rounded-full active:scale-[0.98] focus-visible:ring-0',
              touchOptimized ? "size-[2.15rem]" : "size-9",
              mobileInteractionMode === 'crop'
                ? 'bg-amber-500/15 text-amber-600 hover:bg-amber-500/25'
                : 'hover:bg-muted/80 text-foreground/80',
            )}
            onClick={handleWithHint('裁切模式', () => onSetMobileInteractionMode(mobileInteractionMode === 'crop' ? 'navigate' : 'crop'))}
            title="裁切模式"
          >
            <CropIcon className="size-[1.125rem]" />
            </Button>
          </div>
          <div className="relative">
            <Button
            variant={mobileInteractionMode === 'select' ? 'secondary' : 'ghost'}
            size="icon"
            className={cn(
              'rounded-full active:scale-[0.98] focus-visible:ring-0',
              touchOptimized ? "size-[2.15rem]" : "size-9",
              mobileInteractionMode === 'select'
                ? 'bg-amber-500/15 text-amber-600 hover:bg-amber-500/25'
                : 'hover:bg-muted/80 text-foreground/80',
            )}
            onClick={handleWithHint('多选模式', () => onSetMobileInteractionMode(mobileInteractionMode === 'select' ? 'navigate' : 'select'))}
            title="多选模式"
          >
            <CheckSquareIcon className="size-[1.125rem]" />
            </Button>
          </div>
          <div className="relative">
            <Button
            variant={mobileInteractionMode === 'sort' ? 'secondary' : 'ghost'}
            size="icon"
            className={cn(
              'rounded-full active:scale-[0.98] focus-visible:ring-0',
              touchOptimized ? "size-[2.15rem]" : "size-9",
              mobileInteractionMode === 'sort'
                ? 'bg-amber-500/15 text-amber-600 hover:bg-amber-500/25'
                : 'hover:bg-muted/80 text-foreground/80',
            )}
            onClick={handleWithHint('排序模式', () => onSetMobileInteractionMode(mobileInteractionMode === 'sort' ? 'navigate' : 'sort'))}
            title="排序模式"
          >
            <ArrowUpDownIcon className="size-[1.125rem]" />
            </Button>
          </div>
          <div className="w-px h-4 mx-0.5 bg-border/60" />
        </div>
      ) : null}

      <div className={cn("flex items-center", touchOptimized ? "gap-0" : "gap-1")}>
        <div className="relative">
          <Button
          variant={showMaskOverlay ? 'secondary' : 'ghost'}
          size="icon"
          className={cn('rounded-full active:scale-[0.98] focus-visible:ring-0 ', touchOptimized ? "size-[2.15rem]" : "size-9", showMaskOverlay ? 'bg-amber-500/15 text-amber-600 hover:bg-amber-500/25' : 'hover:bg-muted/80 text-foreground/80')}
          onClick={handleWithHint(showMaskOverlay ? '隐藏遮罩' : '显示遮罩', onToggleMaskOverlay)}
          title={showMaskOverlay ? '隐藏遮罩' : '显示遮罩'}
        >
          {showMaskOverlay ? <EyeIcon className="size-[1.125rem]" /> : <EyeOffIcon className="size-[1.125rem]" />}
          </Button>
        </div>
        {showCropSubmit ? (
          <div className="relative">
            <Button variant="ghost" size="icon" className={cn("rounded-full active:scale-[0.98] hover:bg-muted/80 text-foreground/80 focus-visible:ring-0", touchOptimized ? "size-[2.15rem]" : "size-9")} onClick={handleWithHint('提交裁切', onSubmitCrop)} title="提交裁切">
              <CropIcon className="size-[1.125rem]" />
            </Button>
          </div>
        ) : null}
        <div className="relative">
          <Button variant="ghost" size="icon" className={cn("rounded-full active:scale-[0.98] hover:bg-muted/80 text-foreground/80 focus-visible:ring-0 hover:-rotate-360", touchOptimized ? "size-[2.15rem]" : "size-9")} onClick={handleWithHint('重置内容', onReset)} title="重置内容">
            <RotateCcwIcon className="size-[1.125rem]" />
          </Button>
        </div>
      </div>
      {portalReady && typeof document !== 'undefined'
        ? createPortal(
            <AnimatePresence>
              {touchOptimized && activeHint ? (
                <motion.div
                  key={activeHint.label}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-none fixed z-[9999] -translate-x-1/2"
                  style={{ left: activeHint.left, top: activeHint.top }}
                >
                  <span className="whitespace-nowrap px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
                    {activeHint.label}
                  </span>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  )
}
