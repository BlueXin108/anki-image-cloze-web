import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BanIcon,
  CheckCheckIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ImageIcon,
  ImagesIcon,
  Layers3Icon,
  LinkIcon,
  PackageIcon,
  Settings2Icon,
  TagIcon,
  ZoomInIcon,
  XIcon,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Dialog as DialogPrimitive } from 'radix-ui'

import type { AnkiConnectionState, DraftListItem, ImageExportFormat, ImportCompressionFormat } from '@/types'
import { DeckPicker } from '@/components/workbench/deck-picker'
import { FocusEditorDialog } from '@/components/workbench/focus-editor-dialog'
import { InlineEmphasis } from '@/components/workbench/inline-emphasis'
import { ZoomableImagePreviewCard } from '@/components/workbench/zoomable-image-preview-card'
import { ImageEditor } from '@/components/editor/image-editor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogDescription, DialogHeader, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog'
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
  onExportToImageGroup: () => void
  onMasksCommit: (masks: DraftListItem['draft']['masks']) => Promise<void>
  onCropCommit: (bbox: [number, number, number, number]) => Promise<void>
  isRefreshingDecks: boolean
  isCreatingDeck: boolean
  isExportingAnki: boolean
  isExportingApkg: boolean
  isExportingImageGroup: boolean
  imageGroupFormat: ImageExportFormat
  imageGroupQuality: number
  onImageGroupFormatChange: (value: ImageExportFormat) => void
  onImageGroupQualityChange: (value: number) => void
  allowedImageGroupFormats: ImageExportFormat[]
  importCompressionEnabled: boolean
  importCompressionFormat: ImportCompressionFormat
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
  outputType = 'image/webp',
  compact = false,
}: {
  item: DraftListItem | null
  quality: number
  outputType?: 'image/webp' | 'image/jpeg' | 'image/png'
  compact?: boolean
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

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
        if (outputType === 'image/jpeg') {
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, canvas.width, canvas.height)
        }
        context.drawImage(image, 0, 0)

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (value) => {
              if (value) resolve(value)
              else reject(new Error('导出预览图生成失败。'))
            },
            outputType,
            outputType === 'image/png' ? undefined : Math.max(0.1, Math.min(1, quality / 100)),
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
  }, [item, outputType, quality])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  if (!item) return null

  return (
    <ZoomableImagePreviewCard
      previewUrl={previewUrl}
      previewAlt="导出质量预览"
      title="导出质量预览"
      description="这里显示当前导出设置下真正会生成的压缩图。"
      dialogTitle="导出质量大图预览"
      dialogDescription="这里展示当前导出设置下，最终生成图片的大图效果。"
      compact={compact}
    />
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
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const current = queue[currentIndex]
    if (!current) return
    const target = containerRef.current?.querySelector<HTMLButtonElement>(`[data-draft-id="${current.draft.id}"]`)
    target?.scrollIntoView({
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
          <div ref={containerRef} className={cn('flex gap-2', compact ? 'px-2.5 py-2' : 'px-3 py-2.5')}>
            {queue.map((item, index) => {
              const isCurrent = index === currentIndex
              const hasDraftDeck = !!item.draft.deck?.trim()
              const isDone = reviewed.has(item.draft.id) || (isCurrent ? !!currentDeckInput?.trim() : hasDraftDeck)
              return (
                <button
                  type="button"
                  key={item.draft.id}
                  data-draft-id={item.draft.id}
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
                        loading="lazy"
                        decoding="async"
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
  onExportToImageGroup,
  onMasksCommit,
  onCropCommit,
  isRefreshingDecks,
  isCreatingDeck,
  isExportingAnki,
  isExportingApkg,
  isExportingImageGroup,
  imageGroupFormat,
  imageGroupQuality,
  onImageGroupFormatChange,
  onImageGroupQualityChange,
  allowedImageGroupFormats,
  importCompressionEnabled,
  importCompressionFormat,
  allowDirectAnki,
  deckPickerMode,
  touchOptimized = false,
  onOpenAnkiHelp,
}: ExportFlowDialogProps) {
  const currentItem = queue[currentIndex] ?? null
  const reviewedCount = reviewedDraftIds.length
  const qualityPreviewItem = currentItem ?? queue[0] ?? null
  const [exportTarget, setExportTarget] = useState<'anki' | 'apkg' | 'image-group'>(allowDirectAnki ? 'anki' : 'apkg')
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

  const canDirectAnki = allowDirectAnki && ankiState.ok

  useEffect(() => {
    if (exportTarget === 'anki' && !canDirectAnki) {
      setExportTarget('apkg')
    }
  }, [canDirectAnki, exportTarget])

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
  const showReviewPreview = stage === 'review'
  const isExporting = isExportingAnki || isExportingApkg || isExportingImageGroup
  const activeExportTarget = allowDirectAnki ? (exportTarget === 'anki' && !canDirectAnki ? 'apkg' : exportTarget) : exportTarget === 'anki' ? 'apkg' : exportTarget
  const activeExportAction =
    activeExportTarget === 'anki'
      ? onExportToAnki
      : activeExportTarget === 'image-group'
        ? onExportToImageGroup
        : onExportToApkg
  const activeExportBusy =
    activeExportTarget === 'anki'
      ? isExportingAnki
      : activeExportTarget === 'image-group'
        ? isExportingImageGroup
        : isExportingApkg
  const imageGroupOutputType = imageGroupFormat === 'jpeg' ? 'image/jpeg' : imageGroupFormat === 'png' ? 'image/png' : 'image/webp'

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
              {stage === 'review' ? (
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
                        <div className="mx-auto w-full max-w-md"><StepRail stage={stage} reviewedCount={reviewedCount} compact={isMobileDialog} /></div>
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
                            autoSaveOnPick
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
                <div className={cn('flex h-auto w-full justify-center', isMobileDialog ? 'flex-col gap-3' : 'h-full flex-col gap-2')}>
                  <Card className={cn('flex w-full max-w-2xl mx-auto flex-col border-border/70 bg-background/94 shadow-none', !isMobileDialog && 'h-full')}>
                    <CardHeader className={cn('gap-3 pb-3', isMobileDialog && 'gap-2 px-4 pt-3 pb-0')}>
                      <div className="mx-auto w-full max-w-md"><StepRail stage={stage} reviewedCount={queue.length} compact={isMobileDialog} /></div>
                      <div className="flex flex-wrap justify-center gap-2">
                        <SummaryBadge label="图片" value={queue.length} compact={isMobileDialog} />
                        <SummaryBadge label="卡片" value={totalCards} compact={isMobileDialog} />
                        <SummaryBadge label="已备妥" value={readyCount} compact={isMobileDialog} />
                      </div>
                    </CardHeader>

                    {/* 移动端去除多余嵌套的 ScrollArea，让全局接管滚动 */}
                    <CardContent className={cn('flex flex-col', isMobileDialog ? 'gap-3 px-3 pb-3' : 'min-h-0 flex-1 px-5 pb-5')}>
                      <div className={cn('flex flex-col', isMobileDialog ? 'gap-3' : 'h-full gap-3')}>
                        <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-muted/10 p-3">
                          <div className="flex items-center gap-2 text-[13px] font-medium text-foreground/88">
                            <DownloadIcon className="size-4 text-muted-foreground" />
                            导出方式
                          </div>
                          <ToggleGroup
                            type="single"
                            value={activeExportTarget}
                            onValueChange={(value) => {
                              if (value === 'anki' && !allowDirectAnki) return
                              if (value === 'anki' || value === 'apkg' || value === 'image-group') setExportTarget(value)
                            }}
                            variant="outline"
                            spacing={1}
                            className={cn('w-full rounded-lg bg-background/70 p-1', allowDirectAnki ? 'grid grid-cols-3' : 'grid grid-cols-2')}
                          >
                              {allowDirectAnki ? (
                                <ToggleGroupItem value="anki" disabled={!canDirectAnki} className="justify-center gap-1.5 px-2 text-xs">
                                  <LinkIcon className="size-3.5" />
                                  AnkiConnect
                                </ToggleGroupItem>
                              ) : null}
                              <ToggleGroupItem value="apkg" className="justify-center gap-1.5 px-2 text-xs">
                                <PackageIcon className="size-3.5" />
                                APKG
                              </ToggleGroupItem>
                              <ToggleGroupItem value="image-group" className="justify-center gap-1.5 px-2 text-xs">
                                <ImagesIcon className="size-3.5" />
                                图像组
                              </ToggleGroupItem>
                            </ToggleGroup>
                            {!canDirectAnki && allowDirectAnki ? (
                              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground/80">
                                <BanIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
                                <span>Anki 当前未连接成功</span>
                              </div>
                            ) : null}
                            <div className={cn('text-[11.5px] mt-1 text-muted-foreground leading-relaxed pl-1', isMobileDialog && 'text-[10px]')}>
                              {allowDirectAnki ? (
                                <>桌面上可 <InlineEmphasis onClick={onOpenAnkiHelp}>直连 Anki写入</InlineEmphasis>，也可以下卡包。</>
                              ) : (
                                <>移动端建议优先生成 <InlineEmphasis hint={apkgHint} touchOptimized={isMobileDialog}>APKG</InlineEmphasis> 卡包导入。</>
                              )}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-muted/10 p-3">
                          <div className="flex items-center gap-2 text-[13px] font-medium text-foreground/88">
                            <Settings2Icon className="size-4 text-muted-foreground" />
                            质量调校
                          </div>
                            {activeExportTarget === 'image-group' ? (
                              <div className="flex flex-col gap-3">
                                <div className="flex flex-col gap-3">
                                    <Field>
                                      <FieldLabel className="text-[12px] font-medium">
                                        图像格式
                                      </FieldLabel>
                                      <FieldContent>
                                        <ToggleGroup
                                          type="single"
                                          value={imageGroupFormat}
                                          onValueChange={(value) => {
                                            if (value === 'webp' || value === 'jpeg' || value === 'png') {
                                              onImageGroupFormatChange(value)
                                            }
                                          }}
                                          variant="outline"
                                          spacing={1}
                                          className="w-full rounded-lg bg-background/70 p-1"
                                        >
                                          <ToggleGroupItem value="webp" disabled={!allowedImageGroupFormats.includes('webp')} className="flex-1 justify-center text-[11px]">WebP</ToggleGroupItem>
                                          <ToggleGroupItem value="jpeg" disabled={!allowedImageGroupFormats.includes('jpeg')} className="flex-1 justify-center text-[11px]">JPG</ToggleGroupItem>
                                          <ToggleGroupItem value="png" disabled={!allowedImageGroupFormats.includes('png')} className="flex-1 justify-center text-[11px]">PNG</ToggleGroupItem>
                                        </ToggleGroup>
                                        <FieldDescription className="text-[11px] mt-1">
                                          {importCompressionEnabled
                                            ? importCompressionFormat === 'webp' ? '当前导入已处理成 WebP，图像组优先沿用 WebP。' : '当前导入已处理成 JPG。'
                                            : '如需保留透明层请选 PNG / WebP。'}
                                        </FieldDescription>
                                      </FieldContent>
                                    </Field>

                                    <Field>
                                      <FieldLabel className="text-[12px] font-medium">质量压缩</FieldLabel>
                                      <FieldContent>
                                        <div className="flex flex-col gap-1.5">
                                          <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/55 px-2 py-1.5">
                                            <input
                                              type="range"
                                              min="1"
                                              max="100"
                                              value={imageGroupQuality}
                                              disabled={imageGroupFormat === 'png'}
                                              onChange={(event) => onImageGroupQualityChange(Number(event.target.value))}
                                              className="h-1.5 min-w-0 flex-1 appearance-none rounded-full bg-muted accent-foreground [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground"
                                            />
                                            <div className="flex w-7 shrink-0 justify-end text-[12px] font-medium tabular-nums text-foreground/90">
                                              {imageGroupQuality}%
                                            </div>
                                          </div>
                                          <FieldDescription className="text-[11px]">
                                            {imageGroupFormat === 'png' ? 'PNG 无损格式忽略此设定。' : '建议调整后在下方查看体积是否理想。'}
                                          </FieldDescription>
                                        </div>
                                      </FieldContent>
                                    </Field>
                                </div>
                                <div className="rounded-xl border border-border/50 bg-background/40 p-1">
                                  <ExportQualityPreview item={qualityPreviewItem} quality={imageGroupQuality} outputType={imageGroupOutputType} compact />
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2.5">
                                  <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/55 px-3 py-2">
                                    <span className="text-[12px] text-muted-foreground mr-1">压缩比</span>
                                    <input
                                      type="range"
                                      min="1"
                                      max="100"
                                      value={quality}
                                      onChange={(event) => onQualityChange(Number(event.target.value))}
                                      className="h-1.5 min-w-0 flex-1 appearance-none rounded-full bg-muted accent-foreground [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground"
                                    />
                                    <div className="flex w-8 shrink-0 justify-end text-[12px] font-medium tabular-nums text-foreground/90">
                                      {quality}%
                                    </div>
                                  </div>
                                  <div className="rounded-xl border border-border/50 bg-background/40 p-1">
                                    <ExportQualityPreview item={qualityPreviewItem} quality={quality} outputType="image/webp" compact />
                                  </div>
                              </div>
                            )}
                        </div>

                        {/* PC 端显示的底部导出按钮 */}
                        {!isMobileDialog && (
                          <div className="mt-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                             <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground/80">
                               <TagIcon className="mt-0.5 size-3.5 shrink-0" />
                               <span>
                                 {activeExportTarget === 'anki' ? '准备直连写入' : activeExportTarget === 'image-group' ? '准备生成组' : '准备导出'} {queue.length} 张图片
                               </span>
                             </div>
                             <div className="flex shrink-0 items-center justify-end gap-2">
                               <Button variant="outline" size="sm" className="trs-all-400 h-9 font-medium hover:-translate-y-0.5 active:scale-[0.98]" onClick={onBackToReview} disabled={isExporting}>
                                 <ChevronLeftIcon data-icon="inline-start" />
                                 返回上一步
                               </Button>
                               <Button size="sm" className="trs-all-400 h-9 px-4 font-medium hover:-translate-y-0.5 active:scale-[0.98]" onClick={activeExportAction} disabled={isExporting}>
                                 {activeExportBusy ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
                                 {activeExportTarget === 'anki' ? '写入 Anki' : activeExportTarget === 'image-group' ? '生成压缩包' : '生成 APKG'}
                               </Button>
                             </div>
                          </div>
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
                {stage === 'review' ? (
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
                      <Button variant="outline" className="trs-all-400 h-10 rounded-xl px-2 text-[12px] font-medium tracking-wide hover:-translate-y-0.5 active:scale-[0.98]" onClick={onPrevious} disabled={currentIndex === 0}>
                        上一张
                      </Button>
                      <Button variant="outline" className="trs-all-400 h-10 rounded-xl px-2 text-[12px] font-medium tracking-wide hover:-translate-y-0.5 active:scale-[0.98]" onClick={onNext} disabled={currentIndex >= queue.length - 1}>
                        下一张
                      </Button>
                      <Button className="trs-all-400 h-10 rounded-xl px-2 text-[12px] font-medium tracking-wide bg-foreground text-background hover:-translate-y-0.5 hover:bg-foreground/90 active:scale-[0.98]" onClick={onConfirmCurrent} disabled={!deckInput.trim()}>
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
                        {activeExportTarget === 'anki' ? '直连' : activeExportTarget === 'image-group' ? '图像组' : 'APKG'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" className="trs-all-400 h-10 rounded-xl px-3 text-[12px] font-medium tracking-wide hover:-translate-y-0.5 active:scale-[0.98]" onClick={onBackToReview} disabled={isExporting}>
                        <ChevronLeftIcon data-icon="inline-start" className="size-3.5" />
                        返回修改
                      </Button>
                      <Button className="trs-all-400 h-10 rounded-xl px-3 text-[12px] font-medium tracking-wide hover:-translate-y-0.5 active:scale-[0.98]" onClick={activeExportAction} disabled={isExporting}>
                        {activeExportBusy ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" className="size-3.5" />}
                        {activeExportBusy ? '处理中...' : (activeExportTarget === 'anki' ? '开始导入' : activeExportTarget === 'image-group' ? '生成图像组' : '生成 APKG')}
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
