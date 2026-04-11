import { ChevronDownIcon, ChevronUpIcon, CropIcon, EyeIcon, EyeOffIcon, PlusIcon, Redo2Icon, RotateCcwIcon, Trash2Icon, Undo2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ImageEditorToolbarProps {
  touchOptimized: boolean
  focusLayout: boolean
  selectedCount: number
  canUndo: boolean
  canRedo: boolean
  showMaskOverlay: boolean
  showCropSubmit: boolean
  onAddMask: () => void
  onRemoveSelected: () => void
  onUndo: () => void
  onRedo: () => void
  onScrollUp: () => void
  onScrollDown: () => void
  onToggleMaskOverlay: () => void
  onSubmitCrop: () => void
  onReset: () => void
}

export function ImageEditorToolbar({
  touchOptimized,
  focusLayout,
  selectedCount,
  canUndo,
  canRedo,
  showMaskOverlay,
  showCropSubmit,
  onAddMask,
  onRemoveSelected,
  onUndo,
  onRedo,
  onScrollUp,
  onScrollDown,
  onToggleMaskOverlay,
  onSubmitCrop,
  onReset,
}: ImageEditorToolbarProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 p-1.5 shadow-neutral-900/5 border border-border/20 bg-background/0 backdrop-blur-xl trs-all-400 relative z-[60] w-full shadow-none border-0',
        touchOptimized ? 'rounded-[1.25rem] w-full max-w-sm mx-auto justify-center' : 'rounded-full justify-center',
        !touchOptimized && focusLayout && 'bg-background/85 absolute top-4 left-1/2 -translate-x-1/2 w-fit hover:shadow-none hover:scale-[1.01] hover:bg-background/20',
      )}
    >
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-9 rounded-full active:scale-[0.98] hover:bg-muted/80 text-foreground/80 focus-visible:ring-0 hover:rotate-90 trs-all-400" onClick={onAddMask} title="新建遮罩">
          <PlusIcon className="size-[1.125rem]" />
        </Button>
        <Button variant="ghost" size="icon" className="size-9 rounded-full active:scale-[0.98] hover:bg-muted/80 text-foreground/80 focus-visible:ring-0 disabled:opacity-30 disabled:pointer-events-none" onClick={onRemoveSelected} disabled={selectedCount === 0} title={selectedCount > 1 ? `删除选中（${selectedCount}）` : '删除遮罩'}>
          <Trash2Icon className="size-[1.125rem]" />
        </Button>
      </div>

      <div className="w-px h-4 mx-0.5 bg-border/60" />

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-9 rounded-full active:scale-[0.98] hover:bg-muted/80 text-foreground/80 focus-visible:ring-0 disabled:opacity-30 disabled:pointer-events-none hover:-translate-x-0.5" onClick={onUndo} disabled={!canUndo} title="撤销">
          <Undo2Icon className="size-[1.125rem]" />
        </Button>
        <Button variant="ghost" size="icon" className="size-9 rounded-full active:scale-[0.98] hover:bg-muted/80 text-foreground/80 focus-visible:ring-0 disabled:opacity-30 disabled:pointer-events-none hover:translate-x-0.5" onClick={onRedo} disabled={!canRedo} title="重做">
          <Redo2Icon className="size-[1.125rem]" />
        </Button>
      </div>

      <div className="w-px h-4 mx-0.5 bg-border/60" />

      {touchOptimized ? (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-9 rounded-full active:scale-[0.98] hover:bg-muted/80 text-foreground/80 focus-visible:ring-0" onClick={onScrollUp} title="向上滚动图片">
            <ChevronUpIcon className="size-[1.125rem]" />
          </Button>
          <Button variant="ghost" size="icon" className="size-9 rounded-full active:scale-[0.98] hover:bg-muted/80 text-foreground/80 focus-visible:ring-0" onClick={onScrollDown} title="向下滚动图片">
            <ChevronDownIcon className="size-[1.125rem]" />
          </Button>
          <div className="w-px h-4 mx-0.5 bg-border/60" />
        </div>
      ) : null}

      <div className="flex items-center gap-1">
        <Button
          variant={showMaskOverlay ? 'secondary' : 'ghost'}
          size="icon"
          className={cn('size-9 rounded-full active:scale-[0.98] focus-visible:ring-0 ', showMaskOverlay ? 'bg-amber-500/15 text-amber-600 hover:bg-amber-500/25' : 'hover:bg-muted/80 text-foreground/80')}
          onClick={onToggleMaskOverlay}
          title={showMaskOverlay ? '隐藏遮罩' : '显示遮罩'}
        >
          {showMaskOverlay ? <EyeIcon className="size-[1.125rem]" /> : <EyeOffIcon className="size-[1.125rem]" />}
        </Button>
        {showCropSubmit ? (
          <Button variant="ghost" size="icon" className="size-9 rounded-full active:scale-[0.98] hover:bg-muted/80 text-foreground/80 focus-visible:ring-0" onClick={onSubmitCrop} title="提交裁切">
            <CropIcon className="size-[1.125rem]" />
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" className="size-9 rounded-full active:scale-[0.98] hover:bg-muted/80 text-foreground/80 focus-visible:ring-0 hover:-rotate-360" onClick={onReset} title="重置内容">
          <RotateCcwIcon className="size-[1.125rem]" />
        </Button>
      </div>
    </div>
  )
}
