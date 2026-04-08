import { memo, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2Icon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DraftListItem } from '@/types'

const EDGE_FADE_MASK_STYLE = {
  WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, black 14px, black calc(100% - 14px), transparent 100%)',
  maskImage: 'linear-gradient(to bottom, transparent 0, black 14px, black calc(100% - 14px), transparent 100%)',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskSize: '100% 100%',
  maskSize: '100% 100%',
} as const

interface ManualDraftListProps {
  items: DraftListItem[]
  selectedDraftId: string | null
  onSelect: (draftId: string) => void
  onRemoveItem?: (draftId: string) => void
  mobileLayout?: boolean
}

function imageName(sourcePath: string): string {
  return sourcePath.split(/[\\/]/).pop() || sourcePath
}

function truncateFileName(sourcePath: string, maxLength = 42): string {
  const name = imageName(sourcePath)
  if (name.length <= maxLength) return name
  const extensionIndex = name.lastIndexOf('.')
  const extension = extensionIndex > 0 ? name.slice(extensionIndex) : ''
  const baseName = extensionIndex > 0 ? name.slice(0, extensionIndex) : name
  const headLength = Math.max(10, Math.floor((maxLength - extension.length - 1) * 0.6))
  const tailLength = Math.max(6, maxLength - extension.length - headLength - 1)
  return `${baseName.slice(0, headLength)}…${baseName.slice(-tailLength)}${extension}`
}

function handleSelectKeyDown(event: KeyboardEvent<HTMLDivElement>, onSelect: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onSelect()
  }
}

export const ManualDraftList = memo(function ManualDraftList({ items, selectedDraftId, onSelect, onRemoveItem, mobileLayout = false }: ManualDraftListProps) {
  const activeItems = useMemo(() => items.filter((item) => !item.image.ignored), [items])
  const [loadedImageIds, setLoadedImageIds] = useState<Record<string, boolean>>({})
  const [pendingRemoveDraftId, setPendingRemoveDraftId] = useState<string | null>(null)
  const imageStateKey = activeItems.map((item) => `${item.image.id}:${item.image.source_url ?? ''}`).join('|')
  const pendingRemoveItem = useMemo(
    () => activeItems.find((item) => item.draft.id === pendingRemoveDraftId) ?? null,
    [activeItems, pendingRemoveDraftId],
  )

  const requestRemove = (item: DraftListItem) => {
    if (!onRemoveItem) return
    if (item.draft.masks.length > 0) {
      setPendingRemoveDraftId(item.draft.id)
      return
    }
    onRemoveItem(item.draft.id)
  }

  const confirmRemove = () => {
    if (!pendingRemoveItem || !onRemoveItem) return
    onRemoveItem(pendingRemoveItem.draft.id)
    setPendingRemoveDraftId(null)
  }

  useEffect(() => {
    setLoadedImageIds((current) => {
      const next: Record<string, boolean> = {}
      activeItems.forEach((item) => {
        if (current[item.image.id]) {
          next[item.image.id] = true
        }
      })
      const currentKeys = Object.keys(current)
      const nextKeys = Object.keys(next)
      if (
        currentKeys.length === nextKeys.length &&
        nextKeys.every((key) => current[key] === next[key])
      ) {
        return current
      }
      return next
    })
  }, [imageStateKey, activeItems])

  if (mobileLayout) {
    return (
      <>
      <Card data-telemetry-section="image-list" className="flex min-h-0 max-h-[18.5rem] overflow-hidden flex-col border-border/70 bg-background/90 shadow-none">
        <CardHeader className="gap-2 border-b border-border/70 px-4 py-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span>图片选择</span>
            <Badge variant="secondary" className="px-2 py-0 text-[10px]">
              {activeItems.length} 张
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            点一张图，就会在下方切到对应的编辑内容。
          </CardDescription>
        </CardHeader>

        <CardContent
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-2.5"
          style={EDGE_FADE_MASK_STYLE}
        >
          <div className="flex flex-col gap-2">
              <AnimatePresence initial={false} mode="popLayout">
                {activeItems.map((item) => {
                  const isSelected = item.draft.id === selectedDraftId
                  const maskCount = item.draft.masks.length
                  const hasMasks = maskCount > 0
                  const isPreparing = item.image.status === 'preparing'

                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      key={item.draft.id}
                      data-draft-id={item.draft.id}
                      data-telemetry-id="image-select-item"
                      role={isPreparing ? undefined : 'button'}
                      tabIndex={isPreparing ? -1 : 0}
                    className={cn(
                      'group relative flex h-auto w-full flex-row items-start justify-start rounded-xl border px-2.5 py-2.5 text-left trs-all-400',
                      isSelected
                        ? 'border-transparent'
                        : isPreparing
                          ? 'border-dashed border-border/60 bg-muted/20'
                          : 'border-border/60 bg-background/80 hover:border-border hover:bg-muted/30',
                    )}
                    onClick={() => {
                      if (!isPreparing) onSelect(item.draft.id)
                    }}
                    onKeyDown={(event) => {
                      if (!isPreparing) handleSelectKeyDown(event, () => onSelect(item.draft.id))
                    }}
                  >
                    {isSelected && (
                      <motion.div
                        layoutId="draft-list-active-pill"
                        className="absolute inset-0 z-0 rounded-xl border border-amber-300/90 bg-amber-50/80 ring-1 ring-amber-300/40"
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    )}
                    <div className="relative z-10 flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                      {!loadedImageIds[item.image.id] ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
                      {item.image.source_url ? (
                        <img
                          src={item.image.source_url}
                          alt={imageName(item.image.source_path)}
                          loading="lazy"
                          decoding="async"
                          className={cn('h-full w-full object-cover transition-opacity duration-200', loadedImageIds[item.image.id] ? 'opacity-100' : 'opacity-0')}
                          onLoad={() => setLoadedImageIds((current) => ({ ...current, [item.image.id]: true }))}
                          onError={() => setLoadedImageIds((current) => ({ ...current, [item.image.id]: true }))}
                        />
                      ) : (
                        <div className="text-[10px] text-muted-foreground">{isPreparing ? '待转换' : '无预览'}</div>
                      )}
                      {isPreparing ? (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-background/72 text-foreground/70 pointer-events-none">
                          <Loader2Icon className="size-4 animate-spin" />
                          <span className="text-[9px] font-medium leading-tight">转换中</span>
                        </div>
                      ) : hasMasks ? (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 text-white pointer-events-none">
                          <span className="text-lg font-bold leading-none drop-shadow-md">{maskCount}</span>
                          <span className="text-[9px] font-semibold leading-tight opacity-90 drop-shadow-md text-slate-100">MASK</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="ml-2.5 flex min-w-0 flex-1 flex-col justify-center space-y-1 py-0.5">
                      <div className="max-w-full truncate text-[13px] font-medium leading-tight text-foreground/90" title={item.image.source_path}>
                        {truncateFileName(item.image.source_path, 28)}
                      </div>
                      <div className="mt-0.5 max-w-full text-[11px] font-medium text-muted-foreground/80">
                        <span className="inline-block w-full truncate">
                          {isPreparing
                            ? 'HEIF 正在转换，通常会更久一些'
                            : item.draft.deck?.trim() || '未分牌组'}
                        </span>
                      </div>
                    </div>
                    {onRemoveItem && !isPreparing && (
                      <Button
                        data-telemetry-id="image-remove"
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'absolute left-1 top-1 z-20 h-5 w-5 rounded-full border shadow-sm backdrop-blur-sm trs-all-400',
                          hasMasks
                            ? 'border-white/25 bg-black/50 text-white hover:bg-black/70'
                            : 'border-black/10 bg-white/88 text-black hover:bg-white',
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          requestRemove(item)
                        }}
                      >
                        <XIcon className="size-3" />
                      </Button>
                    )}
                  </motion.div>
                )
              })}
              </AnimatePresence>
          </div>
        </CardContent>
      </Card>
      <AlertDialog open={Boolean(pendingRemoveItem)} onOpenChange={(open) => !open && setPendingRemoveDraftId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认移除这张已编辑图片？</AlertDialogTitle>
            <AlertDialogDescription>
              这张图已经画了 {pendingRemoveItem?.draft.masks.length ?? 0} 个遮罩。移除后，这张图的裁切、遮罩和牌组信息都会一起从当前项目里消失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>先保留</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>确认移除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
    )
  }

  return (
      <>
      <Card data-telemetry-section="image-list" className="flex h-full min-h-0 overflow-hidden flex-col border-0! ring-0 outline-0 border-none! bg-transparent shadow-none">
      <CardHeader className="gap-2 border-b border-border/70 px-5 py-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>图片选择</span>
          <Badge variant="secondary" className="text-[10px] px-2 py-0 bg-transparent">
            {activeItems.length} 张
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs line-clamp-2">
          这里会列出当前项目里的所有图片；点一张，就会在右侧切到对应的编辑和预览内容。
        </CardDescription>
      </CardHeader>
      
      <CardContent className="min-h-0 h-0 flex-1 overflow-hidden px-3 py-3">
        <ScrollArea className="h-full pr-3" style={EDGE_FADE_MASK_STYLE}> {/* pr-3 给滚动条留出足够的呼吸空间 */}
          <div className="flex flex-col gap-2"> {/* gap-3 缩小为 gap-2 */}
            <AnimatePresence initial={false} mode="popLayout">
            {activeItems.map((item) => {
              const isSelected = item.draft.id === selectedDraftId
              const maskCount = item.draft.masks.length
              const hasMasks = maskCount > 0
              const isPreparing = item.image.status === 'preparing'

              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  key={item.draft.id}
                  data-draft-id={item.draft.id}
                  data-telemetry-id="image-select-item"
                  role={isPreparing ? undefined : 'button'}
                  tabIndex={isPreparing ? -1 : 0}
                  className={cn(
                    'group relative h-auto w-full justify-start rounded-xl border px-2.5 py-2.5 text-left trs-all-400',
                    isSelected 
                      ? 'border-transparent ring-0' 
                      : isPreparing
                        ? 'border-dashed border-border/55 bg-muted/20'
                        : 'border-transparent bg-background/50 hover:border-border/60 hover:bg-muted/40',
                  )}
                  onClick={() => {
                    if (!isPreparing) onSelect(item.draft.id)
                  }}
                  onKeyDown={(event) => {
                    if (!isPreparing) handleSelectKeyDown(event, () => onSelect(item.draft.id))
                  }}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="draft-list-active-pill"
                      className="absolute inset-0 z-0 rounded-xl border border-amber-300/90 bg-amber-50/70 ring-1 ring-amber-300/40"
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                  <div className="relative z-10 flex w-full min-w-0 items-center gap-3">
                    <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30 shadow-sm">
                      {!loadedImageIds[item.image.id] ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
                      {item.image.source_url ? (
                        <img
                          src={item.image.source_url}
                          alt={imageName(item.image.source_path)}
                          loading="lazy"
                          decoding="async"
                          className={cn('h-full w-full object-cover transition-opacity duration-200', loadedImageIds[item.image.id] ? 'opacity-100' : 'opacity-0')}
                          onLoad={() => setLoadedImageIds((current) => ({ ...current, [item.image.id]: true }))}
                          onError={() => setLoadedImageIds((current) => ({ ...current, [item.image.id]: true }))}
                        />
                      ) : (
                        <div className="text-[10px] text-muted-foreground">{isPreparing ? '待转换' : '无预览'}</div>
                      )}
                      {isPreparing ? (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-background/72 text-foreground/70 pointer-events-none">
                          <Loader2Icon className="size-4 animate-spin" />
                          <span className="text-[9px] font-medium leading-tight">转换中</span>
                        </div>
                      ) : hasMasks ? (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 text-white pointer-events-none">
                          <span className="text-lg font-bold leading-none drop-shadow-md">{maskCount}</span>
                          <span className="text-[9px] font-semibold leading-tight opacity-90 drop-shadow-md text-slate-100">MASK</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col justify-center space-y-1">
                      <div className="max-w-full truncate text-sm font-medium leading-tight text-foreground/90" title={item.image.source_path}>
                        {truncateFileName(item.image.source_path, 38)}
                      </div>
                      <div className="mt-1 text-[11px] leading-4 text-muted-foreground/80 line-clamp-2">
                        {isPreparing
                          ? 'HEIF 正在转换，通常会更久一些'
                          : item.draft.deck?.trim() || '未分牌组'}
                      </div>
                    </div>
                    {onRemoveItem && !isPreparing && (
                      <Button
                        data-telemetry-id="image-remove"
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'absolute left-1 top-1 z-20 h-5 w-5 shrink-0 rounded-full border shadow-sm backdrop-blur-sm transition',
                          hasMasks
                            ? 'border-white/25 bg-black/50 text-white hover:bg-black/70'
                            : 'border-black/10 bg-white/88 text-black hover:bg-white',
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          requestRemove(item)
                        }}
                      >
                        <XIcon className="size-3" />
                      </Button>
                    )}
                  </div>
                </motion.div>
              )
            })}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
    <AlertDialog open={Boolean(pendingRemoveItem)} onOpenChange={(open) => !open && setPendingRemoveDraftId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认移除这张已编辑图片？</AlertDialogTitle>
          <AlertDialogDescription>
            这张图已经画了 {pendingRemoveItem?.draft.masks.length ?? 0} 个遮罩。移除后，这张图的裁切、遮罩和牌组信息都会一起从当前项目里消失。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>先保留</AlertDialogCancel>
          <AlertDialogAction onClick={confirmRemove}>确认移除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
})
