import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCheckIcon,
  CheckIcon,
  ChevronLeftIcon,
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
import { ImageEditor } from '@/components/editor/image-editor'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
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
  onDeckInputChange: (value: string) => void
  onTagsInputChange: (value: string) => void
  deckOptions: string[]
  ankiState: AnkiConnectionState
  onRefreshDecks: () => void
  onCreateDeck: () => void
  onConfirmCurrent: () => void
  onPrevious: () => void
  onBackToReview: () => void
  quality: number
  onQualityChange: (value: number) => void
  onExportAll: () => void
  onMasksCommit: (masks: DraftListItem['draft']['masks']) => Promise<void>
  onCropCommit: (bbox: [number, number, number, number]) => Promise<void>
  isRefreshingDecks: boolean
  isCreatingDeck: boolean
  isExporting: boolean
}

function imageLabel(item: DraftListItem): string {
  return item.image.source_path.split(/[\\/]/).pop() || item.image.source_path
}

function StepRail({ stage, reviewedCount }: { stage: ExportFlowStage; reviewedCount: number }) {
  const steps = [
    { id: 1, label: '选择牌组', active: stage === 'review', done: reviewedCount > 0 || stage === 'confirm' },
    { id: 2, label: '确认图片', active: stage === 'review', done: stage === 'confirm' },
    { id: 3, label: '最终导出', active: stage === 'confirm', done: false },
  ]

  return (
    <div className="flex items-center gap-2">
      {steps.map((step, index) => (
        <div key={step.id} className="flex min-w-0 flex-1 items-center gap-2">
          <div
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition',
              step.active && 'border-amber-400 bg-amber-100 text-amber-950',
              step.done && !step.active && 'border-amber-300 bg-amber-50 text-amber-900',
              !step.active && !step.done && 'border-border/70 bg-background text-muted-foreground',
            )}
          >
            {step.done && !step.active ? <CheckIcon className="size-4" /> : step.id}
          </div>
          <div className="min-w-0 truncate text-sm text-muted-foreground">{step.label}</div>
          {index < steps.length - 1 ? <div className="h-px flex-1 bg-border/70" /> : null}
        </div>
      ))}
    </div>
  )
}

function FlowProgressCard({ stage, reviewedCount, total }: { stage: ExportFlowStage; reviewedCount: number; total: number }) {
  const progress = stage === 'review' ? Math.max(10, Math.round((reviewedCount / Math.max(total, 1)) * 70)) : 100

  return (
    <div className="flex w-full min-w-[14rem] max-w-[16rem] flex-col justify-center gap-2 rounded-xl pr-7 bg-muted/20 px-3">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-foreground/90">
            {stage === 'review' ? '逐张确认中' : '准备最终导出'}
          </span>
          <span className="text-muted-foreground">({reviewedCount}/{total})</span>
        </div>
        <span className=" font-medium text-black/60">{progress}%</span>
      </div>
      <Progress value={progress} className="h-1.5 bg-muted/40" />
    </div>
  )
}

function ExportQualityPreview({
  item,
  quality,
}: {
  item: DraftListItem | null
  quality: number
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
      <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/80 p-3">
        {previewUrl ? (
          <button
            type="button"
            className="group relative overflow-hidden rounded-xl border border-border/60 transition hover:border-border"
            onClick={() => setPreviewOpen(true)}
          >
            <img src={previewUrl} alt="导出质量预览" className="h-20 w-20 object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 text-white transition group-hover:bg-black/35">
              <ZoomInIcon className="size-4 opacity-0 transition group-hover:opacity-100" />
            </div>
          </button>
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-border/60 bg-muted/20 text-muted-foreground">
            <ImageIcon className="size-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">导出质量预览</div>
            {previewUrl ? (
              <Button variant="ghost" size="sm" className="h-8 rounded-lg px-2.5" onClick={() => setPreviewOpen(true)}>
                <ZoomInIcon data-icon="inline-start" />
                放大
              </Button>
            ) : null}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">这里显示当前质量下真正会送去 Anki 的压缩图。</div>
        </div>
      </div>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="!w-[60vw] !max-w-[92vw] overflow-hidden rounded-[1.75rem] border-border/70 bg-background/95 p-0 shadow-2xl">
         <DialogHeader className="border-b border-border/60 px-6 py-4 mt-4">
            <div className="flex items-center justify-between gap-3">
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
}: {
  queue: DraftListItem[]
  currentIndex: number
  reviewedDraftIds: string[]
}) {
  const refs = useRef<Record<string, HTMLDivElement | null>>({})

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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>图片进度</span>
        <span>{currentIndex + 1}/{queue.length}</span>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-muted/10">
        <div className="pointer-events-none absolute top-0 left-0 z-10 h-full w-8 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute top-0 right-0 z-10 h-full w-8 bg-gradient-to-l from-background to-transparent" />
        <ScrollArea className="w-full">
          <div className="flex gap-2 px-3 py-2.5">
            {queue.map((item, index) => {
              const isCurrent = index === currentIndex
              const isDone = reviewed.has(item.draft.id)
              return (
                <div
                  key={item.draft.id}
                  ref={(node) => {
                    refs.current[item.draft.id] = node
                  }}
                  className={cn(
                    'relative w-16 shrink-0 rounded-xl border p-1.5 transition',
                    isCurrent
                      ? 'border-amber-400 bg-amber-50/60 shadow-sm'
                      : isDone
                        ? 'border-border/70 bg-background/90'
                        : 'border-border/60 bg-background/70 opacity-85',
                  )}
                >
                  <div className="relative overflow-hidden rounded-xl border border-border/60 bg-background">
                    {item.image.source_url ? (
                      <img src={item.image.source_url} alt={imageLabel(item)} className="h-10 w-full object-cover" />
                    ) : (
                      <div className="flex h-10 items-center justify-center text-muted-foreground">
                        <ImageIcon className="size-4" />
                      </div>
                    )}
                    {isDone ? (
                      <div className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-amber-500 text-white">
                        <CheckIcon className="size-3" />
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-1 truncate text-[10px] text-muted-foreground">{index + 1}. {imageLabel(item)}</div>
                </div>
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
}: {
  item: DraftListItem | null
  onMasksCommit: (masks: DraftListItem['draft']['masks']) => Promise<void>
  onCropCommit: (bbox: [number, number, number, number]) => Promise<void>
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
  onDeckInputChange,
  onTagsInputChange,
  deckOptions,
  ankiState,
  onRefreshDecks,
  onCreateDeck,
  onConfirmCurrent,
  onPrevious,
  onBackToReview,
  quality,
  onQualityChange,
  onExportAll,
  onMasksCommit,
  onCropCommit,
  isRefreshingDecks,
  isCreatingDeck,
  isExporting,
}: ExportFlowDialogProps) {
  const currentItem = queue[currentIndex] ?? null
  const reviewedCount = reviewedDraftIds.length
  const qualityPreviewItem = currentItem ?? queue[0] ?? null
  const [contentStage, setContentStage] = useState<ExportFlowStage>(stage)
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }))

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

  const dialogShellSize =
    stage === 'review'
      ? {
          width: Math.max(360, Math.round(viewportSize.width * 0.96)),
          height: Math.max(560, Math.round(viewportSize.height * 0.94)),
        }
      : {
          width: Math.max(360, Math.min(Math.round(viewportSize.width * (viewportSize.width >= 640 ? 0.88 : 0.92)), 832)),
          height: Math.max(560, Math.round(viewportSize.height * 0.94)),
        }
  const showReviewPreview = stage === 'review' && contentStage === 'review'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content asChild>
          <motion.div
            initial={false}
            animate={{
              width: dialogShellSize.width,
              height: dialogShellSize.height,
            }}
            transition={DIALOG_LAYOUT_TRANSITION}
            className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10 outline-none"
          >
        <div className="flex h-full flex-col overflow-hidden py-2 px-2">
          <DialogHeader className="border-b border-border/60 px-6 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <DialogTitle>导出当前项目</DialogTitle>
                <DialogDescription>逐张确认后，再做最后导出。</DialogDescription>
              </div>
              <div className="w-full lg:w-auto lg:shrink-0">
                <FlowProgressCard
                  stage={stage}
                  reviewedCount={stage === 'review' ? reviewedCount : queue.length}
                  total={queue.length}
                />
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
            {contentStage === 'review' ? (
              <div className="flex h-full flex-col gap-5">
                <div
                  className={cn(
                    'min-h-0 flex-1 gap-5',
                    showReviewPreview
                      ? 'grid xl:grid-cols-[minmax(0,1.18fr)_minmax(380px,0.82fr)]'
                      : 'flex justify-center',
                  )}
                >
                  {showReviewPreview ? (
                    <ExportPreviewPane item={currentItem} onMasksCommit={onMasksCommit} onCropCommit={onCropCommit} />
                  ) : null}

                  <Card
                    className={cn(
                      'flex h-full flex-col overflow-visible border-border/70 bg-background/92 shadow-none',
                      !showReviewPreview && 'w-full max-w-[46rem]',
                    )}
                  >
                    <CardHeader className="gap-4 pb-3">
                      <StepRail stage={stage} reviewedCount={reviewedCount} />
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-5 overflow-visible">
                      <ThumbnailQueue queue={queue} currentIndex={currentIndex} reviewedDraftIds={reviewedDraftIds} />

                      <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
                        <DeckPicker
                          decks={deckOptions}
                          value={deckInput}
                          onValueChange={onDeckInputChange}
                          onSave={onConfirmCurrent}
                          onRefreshDecks={onRefreshDecks}
                          onCreateDeck={onCreateDeck}
                          isRefreshing={isRefreshingDecks}
                          isCreating={isCreatingDeck}
                          ankiState={ankiState}
                          compact
                          hideSaveAction
                          embedded
                        />
                      </div>

                      <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
                        <FieldGroup>
                          <Field>
                            <FieldLabel>标签</FieldLabel>
                            <FieldContent>
                              <Input value={tagsInput} onChange={(event) => onTagsInputChange(event.target.value)} placeholder="可选，用英文逗号分隔" />
                              <FieldDescription>可留空。</FieldDescription>
                            </FieldContent>
                          </Field>
                        </FieldGroup>
                      </div>

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
                          <Button onClick={onConfirmCurrent} disabled={!deckInput.trim()}>
                            <CheckCheckIcon data-icon="inline-start" />
                            确认当前卡片
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

              </div>
            ) : (
              <div className="flex h-full flex-col gap-5">
                <div className="flex min-h-0 flex-1 justify-center">
                  <Card className="flex h-full w-full flex-col border-border/70 bg-background/94 shadow-none">
                    <CardHeader className="gap-4 pb-3">
                      <StepRail stage={stage} reviewedCount={queue.length} />
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Images</div>
                          <div className="mt-2 text-2xl font-semibold">{queue.length}</div>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Cards</div>
                          <div className="mt-2 text-2xl font-semibold">{queue.reduce((sum, item) => sum + groupMasksByCard(item.draft.masks).length, 0)}</div>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Ready</div>
                          <div className="mt-2 text-2xl font-semibold">{queue.filter((item) => item.draft.deck?.trim()).length}</div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-5">
                      <Card className="border-border/60 bg-muted/15 shadow-none">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Settings2Icon className="size-4" />
                            导出质量
                          </CardTitle>
                          <CardDescription>压缩质量参数：0-100 图片质量递增</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-col gap-3">
                            <Input
                              type="number"
                              value={String(quality)}
                              onChange={(event) => {
                                const next = Number(event.target.value)
                                onQualityChange(Number.isFinite(next) ? Math.max(1, Math.min(next, 100)) : quality)
                              }}
                            />
                            <Progress value={quality} className="h-2" />
                            <ExportQualityPreview item={qualityPreviewItem} quality={quality} />
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-border/60 bg-muted/15 shadow-none">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base text-foreground/88">
                            <DownloadIcon className="size-4" />
                            导出栏
                          </CardTitle>
                          <CardDescription className="text-muted-foreground/80">确认完成后统一导出到本机 Anki。</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground/75">
                            <TagIcon className="size-3.5" />
                            <span>准备导出 {queue.length} 张图片</span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="lg" className="h-11 px-5" onClick={onBackToReview} disabled={isExporting}>
                              <ChevronLeftIcon data-icon="inline-start" />
                              回到逐张确认
                            </Button>
                            <Button size="lg" className="h-11 px-5" onClick={onExportAll} disabled={isExporting}>
                              {isExporting ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
                              开始导出
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </CardContent>
                  </Card>
                </div>

              </div>
            )}
          </div>
          {!isExporting ? (
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </Button>
            </DialogPrimitive.Close>
          ) : null}
        </div>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
