import { useEffect, useState, type ReactNode } from 'react'
import { ShrinkIcon, ZoomInIcon } from 'lucide-react'

import { ImageEditor } from '@/components/editor/image-editor'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import type { CardDraft, DraftListItem, MaskRect } from '@/types'

interface ManualWorkspaceProps {
  selectedItem: DraftListItem | null
  apiBaseUrl: string
  onMasksCommit: (masks: CardDraft['masks']) => Promise<void>
  onCropCommit: (bbox: [number, number, number, number]) => Promise<void>
  deckContent?: ReactNode
}

function buildRenderedImageUrl(apiBaseUrl: string, path: string | null | undefined, fingerprint: string | null | undefined): string | null {
  if (!path) return null
  const version = fingerprint || 'render'
  return `${apiBaseUrl}${path}?v=${encodeURIComponent(version)}`
}

function maskTitle(mask: MaskRect, index: number): string {
  return mask.label?.trim() || `遮罩 ${index + 1}`
}

function maskGroupId(mask: MaskRect): string {
  return mask.card_group_id || mask.id
}

function groupedMasks(masks: MaskRect[]) {
  const grouped = new Map<string, { groupId: string; order: number; masks: MaskRect[] }>()
  masks.forEach((mask, index) => {
    const groupId = maskGroupId(mask)
    const orderCandidate = mask.card_order ?? index + 1
    const current = grouped.get(groupId)
    if (current) {
      current.masks.push(mask)
      current.order = Math.min(current.order, orderCandidate)
      return
    }
    grouped.set(groupId, { groupId, order: orderCandidate, masks: [mask] })
  })
  return [...grouped.values()].sort((a, b) => a.order - b.order)
}

export function ManualWorkspace({
  selectedItem,
  apiBaseUrl,
  onMasksCommit,
  onCropCommit,
  deckContent,
}: ManualWorkspaceProps) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewDescription, setPreviewDescription] = useState('')
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [focusMode, setFocusMode] = useState(false)

  useEffect(() => {
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
  }, [])

  if (!selectedItem) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Empty className="max-w-xl border-border bg-muted/20">
          <EmptyHeader>
            <EmptyTitle>等待选择图片</EmptyTitle>
            <EmptyDescription>切到手动模式后，从左侧选一张图，就可以只专注于裁剪、遮罩和制卡。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const groupedCardMasks = groupedMasks(selectedItem.draft.masks)
  const expectedCardCount = groupedCardMasks.length
  const frontPreviewUrl = buildRenderedImageUrl(apiBaseUrl, selectedItem.draft.front_image_url, selectedItem.draft.render_fingerprint)
  const backPreviewUrl = buildRenderedImageUrl(apiBaseUrl, selectedItem.draft.back_image_url, selectedItem.draft.render_fingerprint)

  const openPreview = (title: string, description: string, imageUrl: string | null) => {
    if (!imageUrl) return
    setPreviewTitle(title)
    setPreviewDescription(description)
    setPreviewImageUrl(imageUrl)
    setPreviewOpen(true)
  }

  const renderEditor = (mode: 'normal' | 'focus') => (
    <ImageEditor
      key={`manual-${mode}-${selectedItem.draft.id}`}
      draft={selectedItem.draft}
      sourceImageUrl={selectedItem.draft.source_image_url ? `${apiBaseUrl}${selectedItem.draft.source_image_url}` : ''}
      imageWidth={selectedItem.image.width}
      imageHeight={selectedItem.image.height}
      onMasksCommit={onMasksCommit}
      onCropCommit={onCropCommit}
      showOcrTools={false}
      showCropSubmit={false}
      shortcutHintText="Q：聚焦模式  Alt + 鼠标拖动：直接画遮罩"
      imageClassName={mode === 'focus' ? 'max-h-[calc(80vh-9rem)] max-w-full' : undefined}
      focusLayout={false}
    />
  )

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      {!focusMode ? (
        <ScrollArea className="h-full pr-3">
          <div className="flex flex-col gap-4">
            {deckContent}

            <Card className="border-border/70 bg-background/80">
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle>手动图像编辑</CardTitle>
                    <CardDescription>这里不显示 OCR、归档和流水线信息，只保留纯图像编辑和最终制卡需要的内容。</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setFocusMode(true)}>
                    <ZoomInIcon data-icon="inline-start" />
                    聚焦编辑（Q）
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{expectedCardCount} 个遮罩</Badge>
                  <Badge variant="outline">将生成 {expectedCardCount} 张卡片</Badge>
                  <Badge variant="outline">{selectedItem.image.width} × {selectedItem.image.height}</Badge>
                </div>

                {renderEditor('normal')}
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="border-border/70 bg-background/80">
                <CardHeader>
                  <CardTitle>问题面预览</CardTitle>
                  <CardDescription>这里沿用现有渲染预览，方便在手动模式里快速检查遮罩整体效果。</CardDescription>
                </CardHeader>
                <CardContent className="min-h-[260px]">
                  {frontPreviewUrl ? (
                    <button
                      type="button"
                      onClick={() => openPreview('问题面预览', '点击放大查看当前问题面渲染结果。', frontPreviewUrl)}
                      className="w-full overflow-hidden rounded-xl border border-border bg-muted/20 text-left transition hover:border-primary/40"
                    >
                      <img src={frontPreviewUrl} alt="Front preview" className="max-h-[420px] w-full object-contain" />
                      <div className="flex items-center justify-between gap-3 border-t border-border/60 px-3 py-2 text-sm text-muted-foreground">
                        <span>点击放大查看</span>
                        <ZoomInIcon className="size-4" />
                      </div>
                    </button>
                  ) : (
                    <Empty className="min-h-[220px] border-border bg-muted/30">
                      <EmptyHeader>
                        <EmptyTitle>还没有渲染预览</EmptyTitle>
                        <EmptyDescription>编辑完遮罩后，手动模式也会继续使用现有预览链路。</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-background/80">
                <CardHeader>
                  <CardTitle>答案面预览</CardTitle>
                  <CardDescription>最终导入 Anki 时会改用专用模板，但这里仍保留直观的图片预览帮助你查错。</CardDescription>
                </CardHeader>
                <CardContent className="min-h-[260px]">
                  {backPreviewUrl ? (
                    <button
                      type="button"
                      onClick={() => openPreview('答案面预览', '点击放大查看当前答案面渲染结果。', backPreviewUrl)}
                      className="w-full overflow-hidden rounded-xl border border-border bg-muted/20 text-left transition hover:border-primary/40"
                    >
                      <img src={backPreviewUrl} alt="Back preview" className="max-h-[420px] w-full object-contain" />
                      <div className="flex items-center justify-between gap-3 border-t border-border/60 px-3 py-2 text-sm text-muted-foreground">
                        <span>点击放大查看</span>
                        <ZoomInIcon className="size-4" />
                      </div>
                    </button>
                  ) : (
                    <Empty className="min-h-[220px] border-border bg-muted/30">
                      <EmptyHeader>
                        <EmptyTitle>等待渲染</EmptyTitle>
                        <EmptyDescription>当前还没有可用的答案面预览。</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/70 bg-background/80">
              <CardHeader>
                <CardTitle>这张图会拆成哪些卡片</CardTitle>
                <CardDescription>这里改成更紧凑的形式，并放在最终图片预览下方，方便一眼对照。</CardDescription>
              </CardHeader>
              <CardContent>
                {selectedItem.draft.masks.length > 0 ? (
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {groupedCardMasks.map((group, index) => (
                      <div key={group.groupId} className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">卡片 {index + 1}</Badge>
                          <div className="truncate text-sm font-medium">
                            {group.masks.map((mask, maskIndex) => maskTitle(mask, maskIndex)).filter(Boolean).join(' / ')}
                          </div>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {group.masks.map((mask) => mask.reason).filter(Boolean).join('；') || '这张卡会使用当前这一组遮罩区域生成独立问答遮罩。'}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {group.masks.length} 个遮罩块
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty className="border-border bg-muted/20">
                    <EmptyHeader>
                      <EmptyTitle>还没有遮罩</EmptyTitle>
                      <EmptyDescription>先画出至少一个遮罩，才能在手动模式里生成独立卡片。</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </CardContent>
            </Card>
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
            {previewImageUrl ? (
              <img src={previewImageUrl} alt={previewTitle} className="max-h-[75vh] w-full object-contain" />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={focusMode} onOpenChange={setFocusMode}>
        <DialogContent className="h-[95vh] !w-[85vw] !max-w-[85vw] sm:!max-w-[85vw] overflow-hidden rounded-[2rem] border-border/70 bg-background/95 px-4 py-3 shadow-2xl">
          <DialogHeader className="border-b border-border/60 px-4 py-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <DialogTitle>聚焦编辑</DialogTitle>
                <DialogDescription>
                  当前只保留图像编辑和快捷键提示。按 Q 或右上角按钮可以退出。
                </DialogDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{expectedCardCount} 个遮罩</Badge>
                <Badge variant="outline">{selectedItem.image.width} × {selectedItem.image.height}</Badge>
                <Button variant="outline" size="sm" onClick={() => setFocusMode(false)}>
                  <ShrinkIcon data-icon="inline-start" />
                  退出聚焦（Q）
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden p-3 md:p-4">
            {renderEditor('focus')}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
