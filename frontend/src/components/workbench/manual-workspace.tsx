import { memo, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ZoomInIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import { ImageEditor } from '@/components/editor/image-editor'
import { FocusEditorDialog } from '@/components/workbench/focus-editor-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Kbd } from '@/components/ui/kbd'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { groupMasksByCard, renderDraftPreviewSet } from '@/lib/manual-preview'
import { cn } from '@/lib/utils'
import type { CardDraft, DraftListItem, ManualPreviewSet } from '@/types'

interface ManualWorkspaceProps {
  selectedItem: DraftListItem | null
  onMasksCommit: (masks: CardDraft['masks']) => Promise<void>
  onCropCommit: (bbox: [number, number, number, number]) => Promise<void>
  focusShortcutEnabled?: boolean
  onEditorHoverChange?: (hovered: boolean) => void
  readOnlyInWorkspace?: boolean
  touchOptimized?: boolean
  onPreviousItem?: () => void
  onNextItem?: () => void
  canGoPrevious?: boolean
  canGoNext?: boolean
}

// 提取你提供的完整快捷键清单
const EDITOR_SHORTCUTS = [
  { key: 'Alt + 拖动', action: '新建遮罩' },
  { key: 'Ctrl + 点击', action: '多选' },
  { key: 'Ctrl + A', action: '全选' },
  { key: '1-9', action: '快速选中' },
  { key: 'Tab', action: '合并/拆分卡片' },
  { key: '中键', action: '拖线重排序号' },
  { key: 'Ctrl + Z/Y', action: '撤回重做' },
  { key: 'V', action: '显隐遮罩' },
  { key: 'R', action: '显隐 OCR' },
  { key: 'Del', action: '删除选中' },
]

export const ManualWorkspace = memo(function ManualWorkspace({
  selectedItem,
  onMasksCommit,
  onCropCommit,
  focusShortcutEnabled = true,
  onEditorHoverChange,
  readOnlyInWorkspace = false,
  touchOptimized = false,
  onPreviousItem,
  onNextItem,
  canGoPrevious = false,
  canGoNext = false,
}: ManualWorkspaceProps) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewDescription, setPreviewDescription] = useState('')
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [focusMode, setFocusMode] = useState(false)
  const [previewGroupId, setPreviewGroupId] = useState<string | null>(null)
  const [previewSet, setPreviewSet] = useState<ManualPreviewSet>({ frontUrl: null, backUrl: null })
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewImageLoaded, setPreviewImageLoaded] = useState({ front: false, back: false })
  
  // Hover 状态控制与 Portal 挂载状态
  const [isEditorHovered, setIsEditorHovered] = useState(false)
  const [mounted, setMounted] = useState(false)

  // 确保 Portal 仅在客户端渲染挂载
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    onEditorHoverChange?.(!touchOptimized && isEditorHovered && !focusMode)
  }, [focusMode, isEditorHovered, onEditorHoverChange, touchOptimized])

  const groupedCardMasks = useMemo(
    () => (selectedItem ? groupMasksByCard(selectedItem.draft.masks) : []),
    [selectedItem],
  )

  useEffect(() => {
    if (!focusShortcutEnabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'q') return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')) {
        return
      }
      event.preventDefault()
      setFocusMode((current) => !current)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusShortcutEnabled])

  useEffect(() => {
    if (!selectedItem) {
      setPreviewGroupId(null)
      setPreviewSet({ frontUrl: null, backUrl: null })
      return
    }

    const firstGroupId = groupMasksByCard(selectedItem.draft.masks)[0]?.groupId ?? null
    setPreviewGroupId((current) => {
      if (current && groupedCardMasks.some((group) => group.groupId === current)) {
        return current
      }
      return firstGroupId
    })
  }, [groupedCardMasks, selectedItem])

  useEffect(() => {
    setPreviewImageLoaded({ front: false, back: false })
  }, [previewSet.frontUrl, previewSet.backUrl, selectedItem?.draft.id, previewGroupId])

  useEffect(() => {
    let cancelled = false
    if (!selectedItem?.image.source_url) {
      setPreviewSet({ frontUrl: null, backUrl: null })
      return
    }

    setPreviewLoading(true)
    void renderDraftPreviewSet({
      draft: selectedItem.draft,
      sourceUrl: selectedItem.image.source_url,
      imageWidth: selectedItem.image.width,
      imageHeight: selectedItem.image.height,
      selectedGroupId: previewGroupId,
    })
      .then((next) => {
        if (!cancelled) {
          setPreviewSet(next)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewSet({ frontUrl: null, backUrl: null })
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [previewGroupId, selectedItem])

  if (!selectedItem) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Empty className="max-w-xl border-border bg-muted/20">
          <EmptyHeader>
            <EmptyTitle>等待导入图片</EmptyTitle>
            <EmptyDescription>{touchOptimized ? '先从顶部上传图片或导入文件夹，然后在上方图片区选一张图继续。' : '先从顶部上传图片或导入文件夹，然后在左侧选一张图开始编辑。'}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const expectedCardCount = groupedCardMasks.length

  const openPreview = (title: string, description: string, imageUrl: string | null) => {
    if (!imageUrl) return
    setPreviewTitle(title)
    setPreviewDescription(description)
    setPreviewImageUrl(imageUrl)
    setPreviewOpen(true)
  }

  const renderEditor = (mode: 'normal' | 'focus') => (
    <div
      className={cn(
        'relative w-full transition-[transform,box-shadow,filter] duration-300 brightness-95',
        !touchOptimized && isEditorHovered && !focusMode && 'z-10 brightness-100  drop-shadow-[10px_0px_2px_rgba(24,18,8,0.04)]',
      )}
      onMouseEnter={() => {
        if (!touchOptimized) setIsEditorHovered(true)
      }}
      onMouseLeave={() => {
        if (!touchOptimized) setIsEditorHovered(false)
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
           key={`manual-${mode}-${selectedItem.draft.id}`}
           initial={{ opacity: 0, scale: 0.98 }}
           animate={{ opacity: 1, scale: 1 }}
           exit={{ opacity: 0, scale: 0.98 }}
           transition={{ duration: 0.25, ease: [0, 0.43, 0, 0.99] }}
           className="w-full"
        >
          <ImageEditor
            draft={selectedItem.draft}
            sourceImageUrl={selectedItem.image.source_url || ''}
            imageWidth={selectedItem.image.width}
            imageHeight={selectedItem.image.height}
            onMasksCommit={onMasksCommit}
            onCropCommit={onCropCommit}
            showOcrTools={false}
            showCropSubmit={false}
            imageClassName={mode === 'focus' ? 'max-h-[calc(90vh-9rem)] max-w-full' : undefined}
            focusLayout={false}
            hideMetaBar
            readOnly={readOnlyInWorkspace && mode === 'normal'}
            disableWheelResize={touchOptimized}
            touchOptimized={touchOptimized && mode === 'focus'}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  )

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", touchOptimized ? "p-2" : "p-4")}>
      
     
     {/* 核心修复：利用 createPortal 将元素直接注入 document.body。
        彻底规避 ScrollArea 中的 transform 属性造成的 fixed 失效问题。
      */}

     {mounted && !touchOptimized && createPortal(
        <div
          className={cn(
            // 1. 定位与整体布局：固定在屏幕左侧，占满高度，改为顶对齐 (items-start)
            // px-6 控制整体左侧间距，pt-10 控制顶部间距
            'pointer-events-none fixed inset-y-0 left-0 z-[99999] flex flex-col items-start  pt-20 px-15 transition-all duration-300',
            // 2. 渐变背景：从左到右 (to-r)，由白变透明。
            // pr-24 控制白色渐变背景的宽度，确保其涵盖最长的文字
            'bg-gradient-to-r from-white/100 via-white/98 pr-50 to-transparent',
            // 3. 动画状态：改为横向位移 (translate-x)
            isEditorHovered && !focusMode ? 'translate-x-0 opacity-100' : '-translate-x-6 opacity-0'
          )}
        >
          {/* 1. 第一层：文字提示与横线（移到上方作为列表标题） */}
          <div className="flex w-full flex-col items-start mb-4">
            <div className="text-[12px] font-semibold tracking-wide text-zinc-800">
              编辑快捷键
            </div>
            {/* max-w-[80px] 限制横线宽度，在左侧更精致 */}
            <div className="mt-1.5 h-px w-full max-w-[80px] bg-zinc-200" />
          </div>

          {/* 2. 第二层：快捷键列表（独立的纵向 Flex 容器） */}
          {/* gap-y-3 控制列表项之间的行距 */}
          <div className="flex flex-col items-start gap-y-3">
            {EDITOR_SHORTCUTS.map((sc, idx) => (
              <div
                key={idx}
                // py-0.5 增加微小的点击/视觉区域
                className="flex items-center gap-2.5 text-xs font-bold py-0.5"
              >
                {/* 统一 Kbd 的外层容器，保证 Kbd 宽度不齐时文字依然对齐 */}
                <div className="flex w-20 justify-end">
                  <Kbd>{sc.key}</Kbd>
                </div>
                <span className="text-zinc-700 font-medium">{sc.action}</span>
              </div>
            ))}
          </div>

          <div className='mt-8 text-xs text-gray-400/90'>鼠标移出编辑区域以关闭侧栏</div>
        </div>,
        document.body
      )}

      {!focusMode ? (
        <ScrollArea className="h-full pr-3">
          <div className="flex flex-col gap-4 px-2">
            <Card className="border-border/70 bg-background/80 ring-0">
              <CardHeader className={cn('gap-3 transition-[opacity,filter] duration-200 border-b-[0.8px] border-border/70', !touchOptimized && isEditorHovered && 'opacity-60 saturate-75')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 flex-1 min-w-0">
                    <CardTitle className={cn(touchOptimized && "text-[15px]")}>手动图像编辑</CardTitle>
                    {!touchOptimized && (
                      <CardDescription>
                        {readOnlyInWorkspace
                          ? '当前页先只做预览，进入聚焦编辑后再拖动遮罩，能更稳地避开移动端误触。'
                          : '这里只保留裁剪、遮罩、分组与制卡需要的核心动作，彻底脱离后端工作流。'}
                      </CardDescription>
                    )}
                  </div>
                  <Button 
                    variant={touchOptimized ? "default" : "outline"} 
                    size={touchOptimized ? "default" : "sm"} 
                    className={cn(touchOptimized && "w-full shadow-md")}
                    onClick={() => setFocusMode(true)}
                  >
                    <ZoomInIcon data-icon="inline-start" />
                    {readOnlyInWorkspace ? '进入聚焦编辑' : '聚焦编辑（Q）'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className={cn("flex flex-col pt-2", touchOptimized ? "gap-2" : "gap-3")}>
                {readOnlyInWorkspace ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground pb-0.5">
                    常规页仅供预览全图，请进入上方聚焦编辑层操作。
                  </div>
                ) : null}
                {renderEditor('normal')}
              </CardContent>
            </Card>

            {/* 以下保持原有的预览布局 */}
            <Card className={cn('border-border/70 bg-background/80 transition-[opacity,filter] duration-200', !touchOptimized && isEditorHovered && 'opacity-45 saturate-75')}>
              <CardHeader>
                <CardTitle className={cn(touchOptimized && "text-[14px]")}>预览当前卡片分组</CardTitle>
                <CardDescription className={cn(touchOptimized && "text-[11px]")}>点下面的小色块，切换问题和答案的预览。</CardDescription>
              </CardHeader>
              <CardContent>
                {groupedCardMasks.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {groupedCardMasks.map((group, index) => {
                      const isCombined = group.masks.length > 1;
                      return (
                        <button
                          key={group.groupId}
                          type="button"
                          onClick={() => setPreviewGroupId(group.groupId)}
                          className={cn(
                            "relative flex flex-col items-center justify-center min-w-[4.5rem] rounded-xl border px-3 py-2 transition shadow-sm",
                            group.groupId === previewGroupId
                              ? 'border-amber-300/90 bg-amber-100/60 ring-1 ring-amber-300/30'
                              : 'border-border/60 bg-muted/20 hover:border-primary/40'
                          )}
                        >
                          <span className={cn("text-xs font-semibold", group.groupId === previewGroupId ? "text-amber-900" : "text-foreground/80")}>挖空 {index + 1}</span>
                          {isCombined && (
                            <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-amber-400 shadow-sm" title="此为组合挖空" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Empty className="border-border bg-muted/20">
                    <EmptyHeader>
                      <EmptyTitle>还没有遮罩</EmptyTitle>
                      <EmptyDescription>先画出至少一个遮罩，页面才会生成对应的卡片预览。</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </CardContent>
            </Card>

            <div className={cn('grid gap-4 xl:grid-cols-2 transition-[opacity,filter] duration-200', !touchOptimized && isEditorHovered && 'opacity-45 saturate-75')}>
              <Card className="border-border/70 bg-background/80">
                <CardHeader className={cn(touchOptimized && "pb-2")}>
                  <CardTitle className={cn(touchOptimized && "text-[14px]")}>问题面预览</CardTitle>
                  {!touchOptimized && <CardDescription>会按照当前选中的卡片分组，把这组遮罩高亮出来。</CardDescription>}
                </CardHeader>
                <CardContent className="min-h-[260px]">
                  {previewLoading ? (
                    <div className="flex min-h-[220px] flex-col justify-center gap-3">
                      <Skeleton className="h-5 w-28 rounded-full" />
                      <Skeleton className="min-h-[180px] w-full rounded-2xl" />
                    </div>
                  ) : previewSet.frontUrl ? (
                    <button
                      type="button"
                      onClick={() => openPreview('问题面预览', '点击放大查看当前问题面。', previewSet.frontUrl)}
                      className="relative w-full overflow-hidden rounded-xl border border-border bg-muted/20 text-left transition hover:border-primary/40"
                    >
                      {!previewImageLoaded.front ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
                      <img
                        src={previewSet.frontUrl}
                        alt="Front preview"
                        loading="lazy"
                        decoding="async"
                        className={cn('max-h-[420px] cursor-zoom-in w-full object-contain transition-opacity duration-200', previewImageLoaded.front ? 'opacity-100' : 'opacity-0')}
                        onLoad={() => setPreviewImageLoaded((current) => ({ ...current, front: true }))}
                        onError={() => setPreviewImageLoaded((current) => ({ ...current, front: true }))}
                      />
                    </button>
                  ) : (
                    <Empty className="min-h-[220px] border-border bg-muted/30">
                      <EmptyHeader>
                        <EmptyTitle>还没有预览</EmptyTitle>
                        <EmptyDescription>画出遮罩后，这里会立刻显示当前卡片的问题面。</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-background/80">
                <CardHeader className={cn(touchOptimized && "pb-2")}>
                  <CardTitle className={cn(touchOptimized && "text-[14px]")}>答案面预览</CardTitle>
                  {!touchOptimized && <CardDescription>答案面会保留当前卡片本身的答案区域，并继续隐藏其他组的遮罩。</CardDescription>}
                </CardHeader>
                <CardContent className="min-h-[260px]">
                  {previewLoading ? (
                    <div className="flex min-h-[220px] flex-col justify-center gap-3">
                      <Skeleton className="h-5 w-28 rounded-full" />
                      <Skeleton className="min-h-[180px] w-full rounded-2xl" />
                    </div>
                  ) : previewSet.backUrl ? (
                    <button
                      type="button"
                      onClick={() => openPreview('答案面预览', '点击放大查看当前答案面。', previewSet.backUrl)}
                      className="relative w-full overflow-hidden rounded-xl border border-border bg-muted/20 text-left transition hover:border-primary/40"
                    >
                      {!previewImageLoaded.back ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
                      <img
                        src={previewSet.backUrl}
                        alt="Back preview"
                        loading="lazy"
                        decoding="async"
                        className={cn('max-h-[420px] cursor-zoom-in w-full object-contain transition-opacity duration-200', previewImageLoaded.back ? 'opacity-100' : 'opacity-0')}
                        onLoad={() => setPreviewImageLoaded((current) => ({ ...current, back: true }))}
                        onError={() => setPreviewImageLoaded((current) => ({ ...current, back: true }))}
                      />
                    </button>
                  ) : (
                    <Empty className="min-h-[220px] border-border bg-muted/30">
                      <EmptyHeader>
                        <EmptyTitle>还没有预览</EmptyTitle>
                        <EmptyDescription>当前还没有可展示的答案面效果。</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </ScrollArea>
      ) : null}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
            <DialogDescription>{previewDescription}</DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20">
            {previewImageUrl ? <img src={previewImageUrl} alt={previewTitle} className="max-h-[75vh] w-full object-contain" /> : null}
          </div>
        </DialogContent>
      </Dialog>

      <FocusEditorDialog
        open={focusMode}
        onOpenChange={setFocusMode}
        item={selectedItem}
        cardCount={expectedCardCount}
        onMasksCommit={onMasksCommit}
        onCropCommit={onCropCommit}
        onPreviousItem={onPreviousItem}
        onNextItem={onNextItem}
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
        previousLabel=""
        nextLabel=""
        touchOptimized={touchOptimized}
        disableWheelResize={touchOptimized}
      />
    </div>
  )
})
