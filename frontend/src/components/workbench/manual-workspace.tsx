import { memo, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ZoomInIcon } from 'lucide-react'

import { ImageEditor } from '@/components/editor/image-editor'
import { FocusEditorDialog } from '@/components/workbench/focus-editor-dialog'
import { Badge } from '@/components/ui/badge'
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
import { groupMasksByCard, renderDraftPreviewSet } from '@/lib/manual-preview'
import { cn } from '@/lib/utils'
import type { CardDraft, DraftListItem, ManualPreviewSet, MaskRect } from '@/types'

interface ManualWorkspaceProps {
  selectedItem: DraftListItem | null
  onMasksCommit: (masks: CardDraft['masks']) => Promise<void>
  onCropCommit: (bbox: [number, number, number, number]) => Promise<void>
  focusShortcutEnabled?: boolean
  onEditorHoverChange?: (hovered: boolean) => void
}

function maskTitle(mask: MaskRect, index: number): string {
  return mask.label?.trim() || `遮罩 ${index + 1}`
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
}: ManualWorkspaceProps) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewDescription, setPreviewDescription] = useState('')
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [focusMode, setFocusMode] = useState(false)
  const [previewGroupId, setPreviewGroupId] = useState<string | null>(null)
  const [previewSet, setPreviewSet] = useState<ManualPreviewSet>({ frontUrl: null, backUrl: null })
  const [previewLoading, setPreviewLoading] = useState(false)
  
  // Hover 状态控制与 Portal 挂载状态
  const [isEditorHovered, setIsEditorHovered] = useState(false)
  const [mounted, setMounted] = useState(false)

  // 确保 Portal 仅在客户端渲染挂载
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    onEditorHoverChange?.(isEditorHovered && !focusMode)
  }, [focusMode, isEditorHovered, onEditorHoverChange])

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
            <EmptyDescription>先从顶部上传图片或导入文件夹，然后在左侧选一张图开始编辑。</EmptyDescription>
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
        isEditorHovered && !focusMode && 'z-10 brightness-100  drop-shadow-[10px_0px_2px_rgba(24,18,8,0.04)]',
      )}
      onMouseEnter={() => setIsEditorHovered(true)}
      onMouseLeave={() => setIsEditorHovered(false)}
    >
      <ImageEditor
        key={`manual-${mode}-${selectedItem.draft.id}`}
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
      />
    </div>
  )

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      
     
     {/* 核心修复：利用 createPortal 将元素直接注入 document.body。
        彻底规避 ScrollArea 中的 transform 属性造成的 fixed 失效问题。
      */}

     {mounted && createPortal(
        <div
          className={cn(
            // 1. 定位与整体布局：固定在屏幕左侧，占满高度，改为顶对齐 (items-start)
            // px-6 控制整体左侧间距，pt-10 控制顶部间距
            'pointer-events-none fixed inset-y-0 left-0 z-[99999] flex flex-col items-start pt-10 px-10 transition-all duration-300',
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
          <div className="flex flex-col gap-4 p-2">
            <Card className="border-border/70 bg-background/80 ring-0">
              <CardHeader className={cn('gap-3 transition-[opacity,filter] duration-200 border-b-[0.8px] border-border/70', isEditorHovered && 'opacity-60 saturate-75')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle>手动图像编辑</CardTitle>
                    <CardDescription>这里只保留裁剪、遮罩、分组与制卡需要的核心动作，彻底脱离后端工作流。</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setFocusMode(true)}>
                    <ZoomInIcon data-icon="inline-start" />
                    聚焦编辑（Q）
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                {renderEditor('normal')}
              </CardContent>
            </Card>

            {/* 以下保持原有的预览布局 */}
            <Card className={cn('border-border/70 bg-background/80 transition-[opacity,filter] duration-200', isEditorHovered && 'opacity-45 saturate-75')}>
              <CardHeader>
                <CardTitle>预览当前卡片分组</CardTitle>
                <CardDescription>点下面任意一组，就会切换问题面和答案面的即时预览。</CardDescription>
              </CardHeader>
              <CardContent>
                {groupedCardMasks.length > 0 ? (
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {groupedCardMasks.map((group, index) => (
                      <button
                        key={group.groupId}
                        type="button"
                        onClick={() => setPreviewGroupId(group.groupId)}
                        className={`rounded-xl border px-3 py-2 text-left transition ${
                          group.groupId === previewGroupId
                            ? 'border-amber-300/90 bg-amber-50/70 ring-2 ring-amber-300/20'
                            : 'border-border/60 bg-muted/20 hover:border-primary/40'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">卡片 {index + 1}</Badge>
                          <div className="truncate text-sm font-medium">
                            {group.masks.map((mask, maskIndex) => maskTitle(mask, maskIndex)).join(' / ')}
                          </div>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {group.masks.map((mask) => mask.reason).filter(Boolean).join('；') || '这组遮挡会作为一张独立卡片导出。'}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{group.masks.length} 个遮罩</div>
                      </button>
                    ))}
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

            <div className={cn('grid gap-4 xl:grid-cols-2 transition-[opacity,filter] duration-200', isEditorHovered && 'opacity-45 saturate-75')}>
              <Card className="border-border/70 bg-background/80">
                <CardHeader>
                  <CardTitle>问题面预览</CardTitle>
                  <CardDescription>会按照当前选中的卡片分组，把这组遮罩高亮出来。</CardDescription>
                </CardHeader>
                <CardContent className="min-h-[260px]">
                  {previewLoading ? (
                    <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">正在生成预览...</div>
                  ) : previewSet.frontUrl ? (
                    <button
                      type="button"
                      onClick={() => openPreview('问题面预览', '点击放大查看当前问题面。', previewSet.frontUrl)}
                      className="w-full overflow-hidden rounded-xl border border-border bg-muted/20 text-left transition hover:border-primary/40"
                    >
                      <img src={previewSet.frontUrl} alt="Front preview" className="max-h-[420px] cursor-zoom-in w-full object-contain" />
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
                <CardHeader>
                  <CardTitle>答案面预览</CardTitle>
                  <CardDescription>答案面会保留当前卡片本身的答案区域，并继续隐藏其他组的遮罩。</CardDescription>
                </CardHeader>
                <CardContent className="min-h-[260px]">
                  {previewLoading ? (
                    <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">正在生成预览...</div>
                  ) : previewSet.backUrl ? (
                    <button
                      type="button"
                      onClick={() => openPreview('答案面预览', '点击放大查看当前答案面。', previewSet.backUrl)}
                      className="w-full overflow-hidden rounded-xl border border-border bg-muted/20 text-left transition hover:border-primary/40"
                    >
                      <img src={previewSet.backUrl} alt="Back preview" className="max-h-[420px] cursor-zoom-in  w-full object-contain" />
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
      />
    </div>
  )
})
