import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCheckIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ImageIcon,
  Layers3Icon,
  RotateCcwIcon,
  Settings2Icon,
  TagIcon,
  ZoomOutIcon,
  ZoomInIcon,
  XIcon,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Dialog as DialogPrimitive } from 'radix-ui'

import type { AnkiConnectionState, DraftListItem } from '@/types'
import { DeckPicker } from '@/components/workbench/deck-picker'
import { FocusEditorDialog } from '@/components/workbench/focus-editor-dialog'
import { InlineEmphasis } from '@/components/workbench/inline-emphasis'
import { ImageEditor } from '@/components/editor/image-editor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { groupMasksByCard } from '@/lib/manual-preview'
import { cn } from '@/lib/utils'

type ExportFlowStage = 'review' | 'confirm'
const DIALOG_LAYOUT_TRANSITION = {
  duration: 0.45,
  ease: [0.16, 1, 0.3, 1] as const,
}

interface ExportFlowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stage: ExportFlowStage
  queue: DraftListItem[]
  currentIndex: number
  reviewedDraftIds: string[]
  deckInput: string
  tagsInput: string
  deckQuickPicks?: string[]
  onDeckInputChange: (value: string) => void
  onTagsInputChange: (value: string) => void
  deckOptions: string[]
  ankiState: AnkiConnectionState
  onRefreshDecks: () => void
  onCreateDeck: () => void
  onConfirmCurrent: () => void
  onPrevious: () => void
  onNext: () => void
  onSelectIndex: (index: number) => void
  onBackToReview: () => void
  quality: number
  onQualityChange: (value: number) => void
  onExportToAnki: () => void
  onExportToApkg: () => void
  onMasksCommit: (masks: DraftListItem['draft']['masks']) => Promise<void>
  onCropCommit: (bbox: [number, number, number, number]) => Promise<void>
  isRefreshingDecks: boolean
  isCreatingDeck: boolean
  isExportingAnki: boolean
  isExportingApkg: boolean
  allowDirectAnki: boolean
  deckPickerMode: 'anki' | 'local'
  touchOptimized?: boolean
  onOpenAnkiHelp?: () => void
}

function imageLabel(item: DraftListItem): string {
  return item.image.source_path.split(/[\\/]/).pop() || item.image.source_path
}

function StepRail({
  stage,
  reviewedCount,
  compact = false,
}: {
  stage: ExportFlowStage
  reviewedCount: number
  compact?: boolean
}) {
  const steps = [
    { id: 1, label: '选择牌组', active: stage === 'review', done: reviewedCount > 0 || stage === 'confirm' },
    { id: 2, label: '确认图片', active: stage === 'review', done: stage === 'confirm' },
    { id: 3, label: '最终导出', active: stage === 'confirm', done: false },
  ]

  return (
    <div className={cn('flex items-center', compact ? 'gap-1.5' : 'gap-2')}>
      {steps.map((step, index) => (
        <div key={step.id} className={cn('flex min-w-0 flex-1 items-center', compact ? 'gap-1.5' : 'gap-2')}>
          <div
            className={cn(
              'flex shrink-0 items-center justify-center rounded-full border font-semibold transition',
              compact ? 'size-6 text-[11px]' : 'size-8 text-sm',
              step.active && 'border-amber-400 bg-amber-100 text-amber-950',
              step.done && !step.active && 'border-amber-300 bg-amber-50 text-amber-900',
              !step.active && !step.done && 'border-border/70 bg-background text-muted-foreground',
            )}
          >
            {step.done && !step.active ? <CheckIcon className="size-4" /> : step.id}
          </div>
          <div className={cn('min-w-0 truncate text-muted-foreground', compact ? 'text-[11px]' : 'text-sm')}>{step.label}</div>
          {index < steps.length - 1 ? <div className="h-px flex-1 bg-border/70" /> : null}
        </div>
      ))}
    </div>
  )
}

function FlowProgressCard({
  stage,
  reviewedCount,
  total,
  compact = false,
}: {
  stage: ExportFlowStage
  reviewedCount: number
  total: number
  compact?: boolean
}) {
  const progress = stage === 'review' ? Math.max(10, Math.round((reviewedCount / Math.max(total, 1)) * 70)) : 100

  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col justify-center rounded-xl bg-muted/20',
        compact ? 'max-w-[12rem] gap-1.5 px-2.5 py-2 sm:min-w-[11rem]' : 'max-w-[16rem] gap-2 px-3 py-2 sm:min-w-[14rem]',
      )}
    >
      <div className={cn('flex items-center justify-between', compact ? 'text-[11px]' : 'text-xs')}>
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-foreground/90">
            {stage === 'review' ? '逐张确认中' : '准备最终导出'}
          </span>
          <span className="text-muted-foreground">({reviewedCount}/{total})</span>
        </div>
        <span className="font-medium text-black/60">{progress}%</span>
      </div>
      <Progress value={progress} className={cn('bg-muted/40', compact ? 'h-1' : 'h-1.5')} />
    </div>
  )
}

function SummaryBadge({
  label,
  value,
  compact = false,
}: {
  label: string
  value: number
  compact?: boolean
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full border-border/60 bg-muted/10 text-foreground',
        compact ? 'gap-1.5 px-2.5 py-1 text-[11px]' : 'gap-2 px-3 py-1.5 text-xs',
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </Badge>
  )
}

function ExportQualityPreview({
  item,
  quality,
  compact = false,
}: {
  item: DraftListItem | null
  quality: number
  compact?: boolean
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const previewViewportRef = useRef<HTMLDivElement | null>(null)
  const previewImageRef = useRef<HTMLImageElement | null>(null)
  const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)

  const clampPan = (nextPan: { x: number; y: number }, nextZoom: number) => {
    const viewport = previewViewportRef.current
    const image = previewImageRef.current
    if (!viewport || !image || nextZoom <= 1) {
      return { x: 0, y: 0 }
    }

    const scaledWidth = image.offsetWidth * nextZoom
    const scaledHeight = image.offsetHeight * nextZoom
    const maxX = Math.max(0, (scaledWidth - viewport.clientWidth) / 2)
    const maxY = Math.max(0, (scaledHeight - viewport.clientHeight) / 2)

    return {
      x: Math.max(-maxX, Math.min(maxX, nextPan.x)),
      y: Math.max(-maxY, Math.min(maxY, nextPan.y)),
    }
  }

  const updateZoom = (nextZoom: number, anchor?: { clientX: number; clientY: number }) => {
    const viewport = previewViewportRef.current
    const image = previewImageRef.current
    const clampedZoom = Math.max(1, Math.min(5, Number(nextZoom.toFixed(2))))

    if (!viewport || !image) {
      setZoom(clampedZoom)
      if (clampedZoom === 1) setPan({ x: 0, y: 0 })
      return
    }

    if (clampedZoom === 1) {
      setZoom(1)
      setPan({ x: 0, y: 0 })
      return
    }

    if (!anchor || zoom === clampedZoom) {
      setZoom(clampedZoom)
      setPan((current) => clampPan(current, clampedZoom))
      return
    }

    const viewportRect = viewport.getBoundingClientRect()
    const anchorX = anchor.clientX - viewportRect.left - viewport.clientWidth / 2
    const anchorY = anchor.clientY - viewportRect.top - viewport.clientHeight / 2
    const zoomRatio = clampedZoom / zoom
    const nextPan = clampPan(
      {
        x: (pan.x - anchorX) * zoomRatio + anchorX,
        y: (pan.y - anchorY) * zoomRatio + anchorY,
      },
      clampedZoom,
    )

    setZoom(clampedZoom)
    setPan(nextPan)
  }

  const resetPreviewTransform = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setDragging(false)
    dragStateRef.current = null
  }

  useEffect(() => {
    let cancelled = false
    let nextPreviewUrl: string | null = null

    const buildPreview = async () => {
      if (!item?.image_blob) {
        setPreviewUrl(null)
        return
      }

      const imageUrl = URL.createObjectURL(item.image_blob)
      try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const next = new Image()
          next.onload = () => resolve(next)
          next.onerror = () => reject(new Error('导出预览图加载失败。'))
          next.src = imageUrl
        })

        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('浏览器不支持导出预览画布。')
        context.drawImage(image, 0, 0)

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (value) => {
              if (value) resolve(value)
              else reject(new Error('导出预览图生成失败。'))
            },
            'image/webp',
            Math.max(0.1, Math.min(1, quality / 100)),
          )
        })

        nextPreviewUrl = URL.createObjectURL(blob)
        if (!cancelled) {
          setPreviewUrl(nextPreviewUrl)
        }
      } catch {
        if (!cancelled) {
          setPreviewUrl(null)
        }
      } finally {
        URL.revokeObjectURL(imageUrl)
      }
    }

    void buildPreview()

    return () => {
      cancelled = true
      if (nextPreviewUrl) {
        URL.revokeObjectURL(nextPreviewUrl)
      }
    }
  }, [item, quality])

  useEffect(() => {
    if (!previewOpen) {
      resetPreviewTransform()
    }
  }, [previewOpen, previewUrl])

  if (!item) return null

  return (
    <>
      <div className={cn('flex items-center gap-3 rounded-2xl border border-border/60 bg-background/80', compact ? 'p-2.5' : 'p-3')}>
        {previewUrl ? (
          <button
            type="button"
            className="group relative overflow-hidden rounded-xl border border-border/60 transition hover:border-border"
            onClick={() => setPreviewOpen(true)}
          >
            <img src={previewUrl} alt="导出质量预览" className={cn('object-cover', compact ? 'h-16 w-16' : 'h-20 w-20')} />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 text-white transition group-hover:bg-black/35">
              <ZoomInIcon className="size-4 opacity-0 transition group-hover:opacity-100" />
            </div>
          </button>
        ) : (
          <div className={cn('flex items-center justify-center rounded-xl border border-border/60 bg-muted/20 text-muted-foreground', compact ? 'h-16 w-16' : 'h-20 w-20')}>
            <ImageIcon className="size-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className={cn('font-medium', compact ? 'text-[12px]' : 'text-sm')}>导出质量预览</div>
            {previewUrl ? (
              <Button variant="ghost" size="sm" className={cn('rounded-lg px-2.5', compact ? 'h-7 text-[11px]' : 'h-8')} onClick={() => setPreviewOpen(true)}>
                <ZoomInIcon data-icon="inline-start" />
                放大
              </Button>
            ) : null}
          </div>
          <div className={cn('mt-1 text-muted-foreground', compact ? 'text-[11px]' : 'text-sm')}>这里显示当前质量下真正会送去 Anki 的压缩图。</div>
        </div>
      </div>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-[92vw] max-w-[92vw] sm:w-[64vw] sm:max-w-[64vw] md:w-[60vw] overflow-hidden rounded-[1.5rem] sm:rounded-[1.75rem] border-border/70 bg-background/95 p-0 shadow-2xl">
          <DialogHeader className="border-b border-border/60 p-4 sm:px-6 sm:py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle>导出质量大图预览</DialogTitle>
                <DialogDescription>这里展示当前压缩质量下，真正准备送去 Anki 的图片效果。</DialogDescription>
              </div>
              
              {/* --- 优化后的逻辑控制区 --- */}
              <div className="flex shrink-0 items-center gap-3">
                
                {/* 1. 缩放控制组：融合为一体的胶囊 UI */}
                <div className="flex h-8 items-center overflow-hidden rounded-lg border border-border/70 bg-muted/20 shadow-sm transition-colors hover:bg-muted/30">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-full w-9 rounded-none hover:bg-black/5 dark:hover:bg-white/10" 
                    onClick={() => updateZoom(zoom - 0.25)}
                    title="缩小"
                  >
                    <ZoomOutIcon className="size-4 text-muted-foreground" />
                  </Button>
                  
                  {/* 使用 tabular-nums 保证数字变化时宽度不抖动 */}
                  <div className="flex w-12 items-center justify-center border-x border-border/50 text-xs font-medium tabular-nums text-foreground/80">
                    {Math.round(zoom * 100)}%
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-full w-9 rounded-none hover:bg-black/5 dark:hover:bg-white/10" 
                    onClick={() => updateZoom(zoom + 0.25)}
                    title="放大"
                  >
                    <ZoomInIcon className="size-4 text-muted-foreground" />
                  </Button>
                </div>

                {/* 分割线：在视觉上隔开调整操作与重置操作 */}
                <div className="h-4 w-px bg-border/70" />

                {/* 2. 复位按钮独立 */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 rounded-lg px-3 shadow-sm" 
                  onClick={resetPreviewTransform}
                >
                  <RotateCcwIcon data-icon="inline-start" className="size-3.5 text-muted-foreground" />
                  复位
                </Button>
              </div>
              {/* --- 优化结束 --- */}
              
            </div>
          </DialogHeader>
          <div
            ref={previewViewportRef}
            className="flex max-h-[78vh] min-h-[50vh] items-center justify-center overflow-hidden bg-muted/15 p-4 md:p-6"
            onWheel={(event) => {
              event.preventDefault()
              updateZoom(zoom + (event.deltaY < 0 ? 0.2 : -0.2), {
                clientX: event.clientX,
                clientY: event.clientY,
              })
            }}
            onPointerMove={(event) => {
              const dragState = dragStateRef.current
              if (!dragState) return
              const nextPan = clampPan(
                {
                  x: dragState.originX + (event.clientX - dragState.startX),
                  y: dragState.originY + (event.clientY - dragState.startY),
                },
                zoom,
              )
              setPan(nextPan)
            }}
            onPointerUp={() => {
              dragStateRef.current = null
              setDragging(false)
            }}
            onPointerCancel={() => {
              dragStateRef.current = null
              setDragging(false)
            }}
          >
            {previewUrl ? (
              <img
                ref={previewImageRef}
                src={previewUrl}
                alt="导出质量大图预览"
                className={cn(
                  'max-h-[70vh] max-w-full rounded-2xl border border-border/60 bg-background object-contain shadow-sm select-none',
                  zoom > 1 ? 'cursor-grab' : 'cursor-zoom-in',
                  dragging && 'cursor-grabbing',
                )}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: dragging ? 'none' : 'transform 120ms ease-out',
                }}
                draggable={false}
                onDoubleClick={() => {
                  if (zoom > 1) {
                    resetPreviewTransform()
                  } else {
                    updateZoom(2)
                  }
                }}
                onPointerDown={(event) => {
                  if (zoom <= 1) return
                  event.preventDefault()
                  dragStateRef.current = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    originX: pan.x,
                    originY: pan.y,
                  }
                  setDragging(true)
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ThumbnailQueue({
  queue,
  currentIndex,
  reviewedDraftIds,
  onSelectIndex,
  compact = false,
  currentDeckInput = '',
}: {
  queue: DraftListItem[]
  currentIndex: number
  reviewedDraftIds: string[]
  onSelectIndex?: (index: number) => void
  compact?: boolean
  currentDeckInput?: string
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    const current = queue[currentIndex]
    if (!current) return
    refs.current[current.draft.id]?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: 'smooth',
    })
  }, [currentIndex, queue])

  const reviewed = new Set(reviewedDraftIds)

  return (
    <div className={cn('flex flex-col', compact ? 'gap-1.5' : 'gap-2')}>
      <div className={cn('flex items-center justify-between text-muted-foreground', compact ? 'text-[11px]' : 'text-xs')}>
        <span>图片进度</span>
        <span>{currentIndex + 1}/{queue.length}</span>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-muted/10">
        <div className="pointer-events-none absolute top-0 left-0 z-10 h-full w-8 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute top-0 right-0 z-10 h-full w-8 bg-gradient-to-l from-background to-transparent" />
        <ScrollArea className="w-full">
          <div className={cn('flex gap-2', compact ? 'px-2.5 py-2' : 'px-3 py-2.5')}>
            {queue.map((item, index) => {
              const isCurrent = index === currentIndex
              const hasDraftDeck = !!item.draft.deck?.trim()
              const isDone = reviewed.has(item.draft.id) || (isCurrent ? !!currentDeckInput?.trim() : hasDraftDeck)
              return (
                <button
                  type="button"
                  key={item.draft.id}
                  ref={(node) => {
                    refs.current[item.draft.id] = node
                  }}
                  onClick={() => onSelectIndex?.(index)}
                  aria-pressed={isCurrent}
                  className={cn(
                    'relative shrink-0 rounded-xl border p-1.5 text-left transition',
                    compact ? 'w-14' : 'w-16',
                    isCurrent
                      ? 'border-amber-400 bg-amber-50/60 shadow-sm'
                      : isDone
                        ? 'border-border/70 bg-background/90'
                        : 'border-border/60 bg-background/70 opacity-85',
                    onSelectIndex && 'cursor-pointer',
                  )}
                >
                  <div className="relative overflow-hidden rounded-xl border border-border/60 bg-background">
                    {item.image.source_url ? (
                      <img
                        src={item.image.source_url}
                        alt={imageLabel(item)}
                        className={cn('w-full object-cover', compact ? 'h-9' : 'h-10')}
                      />
                    ) : (
                      <div className={cn('flex items-center justify-center text-muted-foreground', compact ? 'h-9' : 'h-10')}>
                        <ImageIcon className="size-4" />
                      </div>
                    )}
                    {isDone ? (
                      <div className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-amber-500 text-white">
                        <CheckIcon className="size-3" />
                      </div>
                    ) : null}
                  </div>
                  <div className={cn('mt-1 line-clamp-2 text-muted-foreground', compact ? 'text-[9px]' : 'text-[10px]')}>
                    {index + 1}. {imageLabel(item)}
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

function ExportPreviewPane({
  item,
  onMasksCommit,
  onCropCommit,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext,
  touchOptimized = false,
  compact = false,
}: {
  item: DraftListItem | null
  onMasksCommit: (masks: DraftListItem['draft']['masks']) => Promise<void>
  onCropCommit: (bbox: [number, number, number, number]) => Promise<void>
  onPrevious: () => void
  onNext: () => void
  canGoPrevious: boolean
  canGoNext: boolean
  touchOptimized?: boolean
  compact?: boolean
}) {
  const [focusOpen, setFocusOpen] = useState(false)

  const groups = useMemo(() => (item ? groupMasksByCard(item.draft.masks) : []), [item])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'q') return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')) return
      event.preventDefault()
      setFocusOpen((current) => !current)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!item) return null

  if (compact) {
    return (
      <>
        <Card className="border-border/70 bg-background/92 shadow-none overflow-hidden">
          <CardHeader className="gap-2 px-3 py-2.5 bg-muted/5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-[13px] font-medium leading-relaxed tracking-wide text-foreground/90">{imageLabel(item)}</CardTitle>
                <CardDescription className="text-[10px] mt-0.5 leading-tight tracking-wider">
                  已做安全预览。详细修改请进入独立编辑层。
                </CardDescription>
              </div>
              <Button size="sm" className="h-8 rounded-xl px-3 text-[12px] font-medium shrink-0 bg-primary/95 text-primary-foreground shadow-sm hover:bg-primary" onClick={() => setFocusOpen(true)}>
                <ZoomInIcon data-icon="inline-start" className="size-3.5" />
                聚焦编辑
              </Button>
            </div>
          </CardHeader>
        </Card>
        <FocusEditorDialog
          open={focusOpen}
          onOpenChange={setFocusOpen}
          item={item}
          cardCount={groups.length}
          onMasksCommit={onMasksCommit}
          onCropCommit={onCropCommit}
          onPreviousItem={onPrevious}
          onNextItem={onNext}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          touchOptimized={touchOptimized}
          disableWheelResize={touchOptimized}
          title="聚焦编辑"
          description="这里会以独立悬浮层打开真正的聚焦编辑，不再只是在原位把图片放大。"
        />
      </>
    )
  }

  return (
    <>
      <Card className="flex h-full flex-col border-border/70 bg-background/90 shadow-none">
        <CardHeader className="gap-2 pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="truncate">{imageLabel(item)}</CardTitle>
              <CardDescription>左侧独立预览。按 <Kbd>Q</Kbd> 可直接打开聚焦编辑。</CardDescription>
            </div>
            <Button variant="default" size="sm" className="rounded-full shadow-sm" onClick={() => setFocusOpen(true)}>
              <ZoomInIcon data-icon="inline-start" />
              聚焦编辑（Q）
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          {/* <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{groups.length} 张待导出卡片</Badge>
            <Badge variant="outline">{item.image.width} × {item.image.height}</Badge>
          </div> */}

          <div className="min-h-0 flex-1 overflow-auto pr-1">
            <ImageEditor
              draft={item.draft}
              sourceImageUrl={item.image.source_url || ''}
              imageWidth={item.image.width}
              imageHeight={item.image.height}
              onMasksCommit={async () => {}}
              onCropCommit={async () => {}}
              showOcrTools={false}
              showCropSubmit={false}
              shortcutHintText={
                <>
                  <Kbd>Q</Kbd>
                  <span>聚焦编辑</span>
                </>
              }
              readOnly
              hideMetaBar
            />
          </div>
        </CardContent>
      </Card>
      <FocusEditorDialog
        open={focusOpen}
        onOpenChange={setFocusOpen}
        item={item}
        cardCount={groups.length}
        onMasksCommit={onMasksCommit}
        onCropCommit={onCropCommit}
        onPreviousItem={onPrevious}
        onNextItem={onNext}
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
        touchOptimized={touchOptimized}
        disableWheelResize={touchOptimized}
        title="聚焦编辑"
        description="这里会以独立悬浮层打开真正的聚焦编辑，不再只是在原位把图片放大。"
      />
    </>
  )
}

export function ExportFlowDialog({
  open,
  onOpenChange,
  stage,
  queue,
  currentIndex,
  reviewedDraftIds,
  deckInput,
  tagsInput,
  deckQuickPicks = [],
  onDeckInputChange,
  onTagsInputChange,
  deckOptions,
  ankiState,
  onRefreshDecks,
  onCreateDeck,
  onConfirmCurrent,
  onPrevious,
  onNext,
  onSelectIndex,
  onBackToReview,
  quality,
  onQualityChange,
  onExportToAnki,
  onExportToApkg,
  onMasksCommit,
  onCropCommit,
  isRefreshingDecks,
  isCreatingDeck,
  isExportingAnki,
  isExportingApkg,
  allowDirectAnki,
  deckPickerMode,
  touchOptimized = false,
  onOpenAnkiHelp,
}: ExportFlowDialogProps) {
  const currentItem = queue[currentIndex] ?? null
  const reviewedCount = reviewedDraftIds.length
  const qualityPreviewItem = currentItem ?? queue[0] ?? null
  const [contentStage, setContentStage] = useState<ExportFlowStage>(stage)
  const [exportTarget, setExportTarget] = useState<'anki' | 'apkg'>(allowDirectAnki ? 'anki' : 'apkg')
  const [keyboardPad, setKeyboardPad] = useState(false)
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }))

  useEffect(() => {
    if (!allowDirectAnki) {
      setExportTarget('apkg')
    }
  }, [allowDirectAnki])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const updateViewportSize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    updateViewportSize()
    window.addEventListener('resize', updateViewportSize)
    return () => window.removeEventListener('resize', updateViewportSize)
  }, [])

  useEffect(() => {
    if (stage === 'review') {
      startTransition(() => {
        setContentStage('review')
      })
      return
    }

    if (contentStage === 'confirm') return

    const timeoutId = window.setTimeout(() => {
      startTransition(() => {
        setContentStage('confirm')
      })
    }, 220)

    return () => window.clearTimeout(timeoutId)
  }, [contentStage, stage])

  const isMobileDialog = touchOptimized && viewportSize.width < 768
  const apkgHint = isMobileDialog
    ? '会生成 APKG 卡包。下载后可以交给 AnkiDroid 打开。'
    : '会生成 APKG 卡包。下载完成后，直接拖进桌面版 Anki 即可手动导入。'
  const totalCards = queue.reduce((sum, item) => sum + groupMasksByCard(item.draft.masks).length, 0)
  const readyCount = queue.filter((item) => item.draft.deck?.trim()).length

  const dialogShellSize =
    isMobileDialog
      ? {
          width: Math.max(320, Math.round(viewportSize.width * 0.985)),
          height: Math.max(540, Math.round(viewportSize.height * 0.96)),
        }
      : stage === 'review'
      ? {
          width: Math.max(360, Math.round(viewportSize.width * 0.96)),
          height: Math.max(560, Math.round(viewportSize.height * 0.94)),
        }
      : {
          width: Math.max(360, Math.min(Math.round(viewportSize.width * (viewportSize.width >= 640 ? 0.88 : 0.92)), 832)),
          height: Math.max(560, Math.round(viewportSize.height * 0.94)),
        }
  const showReviewPreview = stage === 'review' && contentStage === 'review'
  const isExporting = isExportingAnki || isExportingApkg
  const activeExportTarget = allowDirectAnki ? exportTarget : 'apkg'
  const activeExportAction = activeExportTarget === 'anki' ? onExportToAnki : onExportToApkg
  const activeExportBusy = activeExportTarget === 'anki' ? isExportingAnki : isExportingApkg

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content asChild>
          <motion.div
            initial={false}
            animate={{
              width: isMobileDialog ? '100%' : dialogShellSize.width,
              height: isMobileDialog ? '100dvh' : dialogShellSize.height,
            }}
            transition={DIALOG_LAYOUT_TRANSITION}
            className={cn(
              'fixed z-50 flex flex-col bg-background text-foreground outline-none',
              isMobileDialog 
                ? 'top-0 left-0 rounded-none text-[12px]' 
                : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl ring-1 ring-foreground/10 text-sm',
            )}
          >
            {/* 1. 固定头部：去掉包裹的冗余 div，直接渲染 Header */}
            <DialogHeader className={cn('shrink-0 border-b border-border/60 bg-popover', isMobileDialog ? 'px-4 py-3' : 'px-6 py-4')}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <DialogTitle className={cn(isMobileDialog && 'text-[15px] font-medium')}>导出当前项目</DialogTitle>
                  <DialogDescription className={cn(isMobileDialog && 'text-[10px] mt-0.5')}>
                    逐张确认后，再做最后导出。
                  </DialogDescription>
                </div>
                {/* 移动端隐藏顶部进度条，节省高度 */}
                {!isMobileDialog && (
                  <div className="w-full lg:w-auto lg:shrink-0">
                    <FlowProgressCard
                      stage={stage}
                      reviewedCount={stage === 'review' ? reviewedCount : queue.length}
                      total={queue.length}
                      compact={isMobileDialog}
                    />
                  </div>
                )}
              </div>
            </DialogHeader>

            {/* 2. 核心内容滚动区：min-h-0 flex-1 overflow-y-auto */}
            <div className={cn('min-h-0 flex-1 overflow-y-auto bg-muted/5', isMobileDialog ? 'p-3' : 'p-4 sm:p-6')}>
              {contentStage === 'review' ? (
                // --- 第一阶段：逐张确认 (Review) ---
                <div className={cn('flex h-auto w-full', isMobileDialog ? 'flex-col gap-3' : 'h-full flex-col gap-5')}>
                  <div
                    className={cn(
                      isMobileDialog
                        ? 'flex h-auto flex-col gap-3' // 移动端改为 h-auto 原生排布，彻底避免折叠
                        : 'grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(380px,0.82fr)]',
                    )}
                  >
                    {showReviewPreview && (
                      <ExportPreviewPane
                        item={currentItem}
                        onMasksCommit={onMasksCommit}
                        onCropCommit={onCropCommit}
                        onPrevious={onPrevious}
                        onNext={onNext}
                        canGoPrevious={currentIndex > 0}
                        canGoNext={currentIndex < queue.length - 1}
                        touchOptimized={touchOptimized}
                        compact={isMobileDialog}
                      />
                    )}

                    <Card
                      className={cn(
                        'flex h-auto flex-col overflow-visible border-border/70 bg-background/92 shadow-none',
                        !showReviewPreview && 'w-full max-w-[46rem]',
                        !isMobileDialog && 'h-full',
                      )}
                    >
                      <CardHeader className={cn('gap-4 pb-3', isMobileDialog && 'gap-3 px-3 py-3')}>
                        <StepRail stage={stage} reviewedCount={reviewedCount} compact={isMobileDialog} />
                      </CardHeader>
                      <CardContent className={cn('flex flex-col', isMobileDialog ? 'gap-4 px-3.5 pb-4' : 'flex-1 gap-5')}>
                        <ThumbnailQueue
                          queue={queue}
                          currentIndex={currentIndex}
                          reviewedDraftIds={reviewedDraftIds}
                          onSelectIndex={onSelectIndex}
                          compact={isMobileDialog}
                          currentDeckInput={deckInput}
                        />

                        <div className={cn('flex flex-col gap-4 rounded-2xl border border-border/60 bg-muted/10', isMobileDialog ? 'p-4.5' : 'p-4')}>
                        <DeckPicker
                          decks={deckOptions}
                          deckQuickPicks={deckQuickPicks}
                          value={deckInput}
                            onValueChange={onDeckInputChange}
                            onSave={onConfirmCurrent}
                            onRefreshDecks={onRefreshDecks}
                            onCreateDeck={onCreateDeck}
                            isRefreshing={isRefreshingDecks}
                            isCreating={isCreatingDeck}
                            ankiState={ankiState}
                            mode={deckPickerMode}
                            compact
                            hideSaveAction
                            embedded
                          />
                          <div className="h-px bg-border/60 -mx-1" />
                          <FieldGroup>
                            <Field>
                              <FieldLabel className="flex items-center gap-1.5"><TagIcon className="size-3.5 text-muted-foreground" />标签</FieldLabel>
                              <FieldContent>
                                <Input 
                                  value={tagsInput} 
                                  onChange={(event) => onTagsInputChange(event.target.value)} 
                                  placeholder="可选，逗号分隔" 
                                  className='text-xs'
                                  onFocus={(e) => {
                                    setKeyboardPad(true)
                                    const target = e.target as HTMLElement;
                                    const scrollBox = target.closest('.overflow-y-auto') as HTMLElement;
                                    if (scrollBox) {
                                      setTimeout(() => {
                                        scrollBox.scrollTo({ top: scrollBox.scrollHeight, behavior: 'smooth' });
                                      }, 150);
                                      setTimeout(() => {
                                        scrollBox.scrollTo({ top: scrollBox.scrollHeight, behavior: 'smooth' });
                                      }, 450);
                                    }
                                  }}
                                  onBlur={() => setKeyboardPad(false)}
                                />
                                {!isMobileDialog && <FieldDescription>可留空。</FieldDescription>}
                              </FieldContent>
                            </Field>
                          </FieldGroup>
                        </div>

                        {/* 额外占位空间，确保键盘出现时标签能被完整推到上方而不被底部固定栏遮挡 */}
                        {isMobileDialog && keyboardPad && <div className="h-40 shrink-0 pointer-events-none transition-all" />}

                        {/* PC 端显示的底部按钮（移动端隐藏） */}
                        {!isMobileDialog && (
                          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Layers3Icon className="size-4" />
                              <span>{currentItem ? imageLabel(currentItem) : '当前没有可确认图片'}</span>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button variant="outline" onClick={onPrevious} disabled={currentIndex === 0}>
                                <ChevronLeftIcon data-icon="inline-start" />
                                回到上一个卡片
                              </Button>
                              <Button variant="outline" onClick={onNext} disabled={currentIndex >= queue.length - 1}>
                                <ChevronRightIcon data-icon="inline-start" />
                                看下一张
                              </Button>
                              <Button onClick={onConfirmCurrent} disabled={!deckInput.trim()}>
                                <CheckCheckIcon data-icon="inline-start" />
                                确认当前卡片
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : (
                // --- 第二阶段：最终导出 (Confirm) ---
                <div className={cn('flex h-auto w-full justify-center', isMobileDialog ? 'flex-col gap-3' : 'h-full flex-col gap-5')}>
                  <Card className={cn('flex w-full flex-col border-border/70 bg-background/94 shadow-none', !isMobileDialog && 'h-full')}>
                    <CardHeader className={cn('gap-4 pb-3', isMobileDialog && 'gap-3 px-4 pt-3 pb-0')}>
                      <StepRail stage={stage} reviewedCount={queue.length} compact={isMobileDialog} />
                      <div className={cn("flex flex-wrap gap-2", isMobileDialog && "justify-center")}>
                        <SummaryBadge label="图片" value={queue.length} compact={isMobileDialog} />
                        <SummaryBadge label="卡片" value={totalCards} compact={isMobileDialog} />
                        <SummaryBadge label="已备妥" value={readyCount} compact={isMobileDialog} />
                      </div>
                    </CardHeader>

                    {/* 移动端去除多余嵌套的 ScrollArea，让全局接管滚动 */}
                    <CardContent className={cn('flex flex-col', isMobileDialog ? 'gap-3 px-3 pb-3' : 'min-h-0 flex-1 overflow-hidden')}>
                      <div className={cn('flex flex-col', isMobileDialog ? 'gap-3' : 'h-full gap-5 overflow-y-auto pr-3')}>
                        
                        {/* 减负关键：移动端在导出阶段不显示长长的横排缩略图 */}
                        {!isMobileDialog && (
                          <ThumbnailQueue
                            queue={queue}
                            currentIndex={currentIndex}
                            reviewedDraftIds={reviewedDraftIds}
                            onSelectIndex={onSelectIndex}
                            compact={isMobileDialog}
                          />
                        )}

                        {allowDirectAnki ? (
                          <Card className="border-border/60 bg-muted/15 shadow-none">
                            <CardHeader className={cn('gap-3 pb-3', isMobileDialog && 'gap-2 px-3 py-3')}>
                              <CardTitle className={cn('text-foreground/88', isMobileDialog ? 'text-[13px]' : 'text-base')}>导出方式</CardTitle>
                              <CardDescription className={cn(isMobileDialog && 'text-[10px]')}>
                                桌面端可以通过
                                <span className="mx-1 inline-flex">
                                  <InlineEmphasis onClick={onOpenAnkiHelp}>AnkiConnect</InlineEmphasis>
                                </span>
                                一键写入本机 Anki，也可以直接生成
                                <span className="mx-1 inline-flex">
                                  <InlineEmphasis hint={apkgHint} touchOptimized={isMobileDialog}>
                                    APKG
                                  </InlineEmphasis>
                                </span>
                                卡包。
                              </CardDescription>
                            </CardHeader>
                            <CardContent className={cn(isMobileDialog && 'px-3 pb-3 pt-0')}>
                              <ToggleGroup
                                type="single"
                                value={exportTarget}
                                onValueChange={(value) => {
                                  if (value === 'anki' || value === 'apkg') setExportTarget(value)
                                }}
                                variant="outline"
                                spacing={1}
                                className="w-full rounded-xl bg-background/70 p-1"
                              >
                                <ToggleGroupItem value="anki" className="flex-1 justify-center">
                                  直连 Anki
                                </ToggleGroupItem>
                                <ToggleGroupItem value="apkg" className="flex-1 justify-center">
                                  APKG 卡包
                                </ToggleGroupItem>
                              </ToggleGroup>
                            </CardContent>
                          </Card>
                        ) : (
                          <Card className="border-border/60 bg-muted/15 shadow-none">
                            <CardHeader className={cn(isMobileDialog && 'gap-2 px-3 py-3')}>
                              <CardTitle className={cn('flex items-center gap-2 text-foreground/88', isMobileDialog ? 'text-[13px]' : 'text-base')}>
                                <DownloadIcon className="size-4" />
                                移动端导出
                              </CardTitle>
                              <CardDescription className={cn(isMobileDialog && 'text-[10px]')}>
                                这里会直接生成
                                <span className="mx-1 inline-flex">
                                  <InlineEmphasis hint={apkgHint} touchOptimized={isMobileDialog}>
                                    APKG
                                  </InlineEmphasis>
                                </span>
                                卡包；如果设备支持分享，会优先弹出分享面板。
                              </CardDescription>
                            </CardHeader>
                          </Card>
                        )}

                        <Card className="border-border/60 bg-muted/15 shadow-none">
                          <CardHeader className={cn(isMobileDialog && 'gap-2 px-3 py-3')}>
                            <CardTitle className="flex items-center gap-2 text-[13px] sm:text-sm">
                              <Settings2Icon className="size-4" />
                              导出质量
                            </CardTitle>
                            <CardDescription className={cn(isMobileDialog && 'text-[10px]')}>
                              压缩质量参数：0-100 图片质量递增
                            </CardDescription>
                          </CardHeader>
                          <CardContent className={cn(isMobileDialog && 'px-3 pb-3 pt-0')}>
                            <div className="flex flex-col gap-3">
                              {isMobileDialog ? (
                                <div className="flex items-center gap-3 bg-background/50 p-2 rounded-xl border border-border/40">
                                  <input 
                                    type="range" 
                                    min="1" 
                                    max="100" 
                                    value={quality} 
                                    onChange={(e) => onQualityChange(Number(e.target.value))}
                                    className="flex-1 min-w-0 accent-foreground h-2 bg-muted rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:rounded-full"
                                  />
                                  <div className="flex w-9 shrink-0 justify-center font-medium tabular-nums text-foreground/90 text-sm">{quality}</div>
                                </div>
                              ) : (
                                <>
                                  <Input
                                    type="number"
                                    value={String(quality)}
                                    onChange={(event) => {
                                      const next = Number(event.target.value)
                                      onQualityChange(Number.isFinite(next) ? Math.max(1, Math.min(next, 100)) : quality)
                                    }}
                                  />
                                  <Progress value={quality} className="h-2" />
                                </>
                              )}
                              <ExportQualityPreview item={qualityPreviewItem} quality={quality} compact={isMobileDialog} />
                            </div>
                          </CardContent>
                        </Card>

                        {/* PC 端显示的底部导出按钮 */}
                        {!isMobileDialog && (
                          <Card className="border-border/60 bg-muted/15 shadow-none mt-auto">
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2 text-foreground/88 text-base">
                                <DownloadIcon className="size-4" />
                                导出栏
                              </CardTitle>
                              <CardDescription className="text-muted-foreground/80">
                                {activeExportTarget === 'anki' ? (
                                  <>
                                    确认完成后统一通过
                                    <span className="mx-1 inline-flex">
                                      <InlineEmphasis onClick={onOpenAnkiHelp}>AnkiConnect</InlineEmphasis>
                                    </span>
                                    写入本机 Anki。
                                  </>
                                ) : (
                                  <>
                                    确认完成后统一生成
                                    <span className="mx-1 inline-flex">
                                      <InlineEmphasis hint={apkgHint} touchOptimized={isMobileDialog}>
                                        APKG
                                      </InlineEmphasis>
                                    </span>
                                    卡包。
                                  </>
                                )}
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-row items-center justify-between gap-3">
                              <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground/75">
                                <TagIcon className="mt-0.5 size-3.5 shrink-0" />
                                <span className="break-all">
                                  {activeExportTarget === 'anki' ? '准备直连导出' : '准备生成卡包'} {queue.length} 张图片
                                </span>
                              </div>
                              <div className="flex flex-row flex-wrap gap-2">
                                <Button variant="outline" size="lg" className="h-11 px-5" onClick={onBackToReview} disabled={isExporting}>
                                  <ChevronLeftIcon data-icon="inline-start" />
                                  回到逐张确认
                                </Button>
                                <Button size="lg" className="h-11 px-5" onClick={activeExportAction} disabled={isExporting}>
                                  {activeExportBusy ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
                                  {activeExportTarget === 'anki' ? '开始导入到 Anki' : '生成 APKG 卡包'}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>

            {/* 3. 固定底部：移动端原生固定底栏（告别悬浮遮挡） */}
            {isMobileDialog && (
              <div className="shrink-0 border-t border-border/50 bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-sm z-10 transition-opacity">
                {contentStage === 'review' ? (
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Layers3Icon className="size-3.5 shrink-0 text-amber-500" />
                        <span className="truncate">先设置卡片信息，然后点击确认</span>
                      </div>
                      <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] bg-background">
                        {currentIndex + 1}/{queue.length}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Button variant="outline" className="h-10 rounded-xl px-2 text-[12px] font-medium tracking-wide" onClick={onPrevious} disabled={currentIndex === 0}>
                        上一张
                      </Button>
                      <Button variant="outline" className="h-10 rounded-xl px-2 text-[12px] font-medium tracking-wide" onClick={onNext} disabled={currentIndex >= queue.length - 1}>
                        下一张
                      </Button>
                      <Button className="h-10 rounded-xl px-2 text-[12px] font-medium tracking-wide bg-foreground text-background hover:bg-foreground/90" onClick={onConfirmCurrent} disabled={!deckInput.trim()}>
                        <CheckCheckIcon data-icon="inline-start" className="size-3.5" />
                        确认此图
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="truncate">下一步：直接生成这批卡片</span>
                      <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] bg-background">
                        {activeExportTarget === 'anki' ? '直连' : 'APKG'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" className="h-10 rounded-xl px-3 text-[12px] font-medium tracking-wide" onClick={onBackToReview} disabled={isExporting}>
                        <ChevronLeftIcon data-icon="inline-start" className="size-3.5" />
                        返回修改
                      </Button>
                      <Button className="h-10 rounded-xl px-3 text-[12px] font-medium tracking-wide" onClick={activeExportAction} disabled={isExporting}>
                        {activeExportBusy ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" className="size-3.5" />}
                        {activeExportBusy ? '处理中...' : (activeExportTarget === 'anki' ? '开始导入' : '生成 APKG')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PC端关闭按钮 */}
            {!isExporting ? (
              <DialogPrimitive.Close asChild>
                <Button
                  variant="ghost"
                  className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                  size="icon-sm"
                >
                  <XIcon />
                  <span className="sr-only">Close</span>
                </Button>
              </DialogPrimitive.Close>
            ) : null}
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
