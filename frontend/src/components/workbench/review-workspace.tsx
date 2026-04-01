import { useEffect, useState } from 'react'
import { ShrinkIcon, ZoomInIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ImageEditor } from '@/components/editor/image-editor'
import type { CardDraft, DraftListItem } from '@/types'

function imageName(item: DraftListItem): string {
  return item.image.source_path.split(/[\\/]/).pop() || item.image.source_path
}

function buildRenderedImageUrl(apiBaseUrl: string, path: string | null | undefined, fingerprint: string | null | undefined): string | null {
  if (!path) return null
  const version = fingerprint || 'render'
  return `${apiBaseUrl}${path}?v=${encodeURIComponent(version)}`
}

function describeRouteSource(item: DraftListItem): { label: string; detail: string } {
  switch (item.draft.route_source) {
    case 'semantic':
      return {
        label: '当前由大模型填写',
        detail: '这个 deck 建议来自大模型，它会结合 OCR、图片内容和已有 deck 来判断。',
      }
    case 'folder_name':
      return {
        label: '当前由文件夹填写',
        detail: '这个 deck 不是大模型填的，而是按文件夹同名直接映射得到的。',
      }
    case 'folder_fallback':
      return {
        label: '模型失败后回退',
        detail: '本来尝试让大模型判断，但没有成功，所以临时回退成了文件夹同名方案。',
      }
    case 'semantic_pending':
      return {
        label: '还没进入模型归档',
        detail: '这张图还在等待 OCR 后再让大模型决定送去哪里，所以现在可能还是空白。',
      }
    default:
      return {
        label: '归档来源暂不明确',
        detail: '当前没有足够信息判断这份 deck 建议来自哪里。',
      }
  }
}

interface ReviewWorkspaceProps {
  selectedItem: DraftListItem | null
  focusStage: 'empty' | 'route' | 'llm'
  routeReviewCount: number
  routeReadyCount: number
  routeStageItems: DraftListItem[]
  llmReviewItems: DraftListItem[]
  draftDeckInput: string
  draftTagsInput: string
  onDraftDeckInputChange: (value: string) => void
  onDraftTagsInputChange: (value: string) => void
  onSelectDraft: (draftId: string) => void
  onConfirmCurrentRoute: () => void
  onSaveCurrentRoute: () => void
  onApproveCurrentResult: () => void
  onMasksCommit: (masks: CardDraft['masks']) => Promise<void>
  onCropCommit: (bbox: [number, number, number, number]) => Promise<void>
  apiBaseUrl: string
}

export function ReviewWorkspace({
  selectedItem,
  focusStage,
  routeReviewCount,
  routeReadyCount,
  routeStageItems,
  llmReviewItems,
  draftDeckInput,
  draftTagsInput,
  onDraftDeckInputChange,
  onDraftTagsInputChange,
  onSelectDraft,
  onConfirmCurrentRoute,
  onSaveCurrentRoute,
  onApproveCurrentResult,
  onMasksCommit,
  onCropCommit,
  apiBaseUrl,
}: ReviewWorkspaceProps) {
  const [focusMode, setFocusMode] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewDescription, setPreviewDescription] = useState('')
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (focusStage !== 'llm' || event.key.toLowerCase() !== 'q') return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')) {
        return
      }
      event.preventDefault()
      setFocusMode((current) => !current)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusStage])

  if (!selectedItem) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Empty className="max-w-xl border-border bg-muted/20">
          <EmptyHeader>
            <EmptyTitle>等待选择项目</EmptyTitle>
            <EmptyDescription>扫描目录后，从左侧队列选择一项，即可开始审核当前阶段的结果。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const routeSourceInfo = describeRouteSource(selectedItem)
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
      key={`${mode}-${selectedItem.draft.id}`}
      draft={selectedItem.draft}
      sourceImageUrl={selectedItem.draft.source_image_url ? `${apiBaseUrl}${selectedItem.draft.source_image_url}` : ''}
      imageWidth={selectedItem.image.width}
      imageHeight={selectedItem.image.height}
      onMasksCommit={onMasksCommit}
      onCropCommit={onCropCommit}
      shortcutHintText="Q：聚焦模式"
      imageClassName={mode === 'focus' ? 'max-h-[calc(80vh-9rem)] max-w-full' : undefined}
      focusLayout={false}
    />
  )

  return (
    <div className="flex-1 overflow-hidden p-4">
      {!focusMode ? (
        <ScrollArea className="h-full pr-3">
        <div className="flex flex-col gap-4">
          {focusStage === 'route' ? (
            <Card className="border-border/70 bg-background/80">
              <CardHeader>
                <CardTitle>第一道审核：确认送去哪里</CardTitle>
                <CardDescription>这一步只做归档确认。先把 deck、tags 和归档说明看顺，再进入挖空阶段。</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid gap-3 lg:grid-cols-3">
                  <Card className="border-border/60 bg-muted/20 shadow-none">
                    <CardContent className="space-y-1 py-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Pending</div>
                      <div className="text-2xl font-semibold">{routeReviewCount}</div>
                      <div className="text-sm text-muted-foreground">还没确认送去哪里</div>
                    </CardContent>
                  </Card>
                  <Card className="border-border/60 bg-muted/20 shadow-none">
                    <CardContent className="space-y-1 py-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Ready</div>
                      <div className="text-2xl font-semibold">{routeReadyCount}</div>
                      <div className="text-sm text-muted-foreground">已经确认完归档</div>
                    </CardContent>
                  </Card>
                  <Card className="border-border/60 bg-muted/20 shadow-none">
                    <CardContent className="space-y-1 py-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current</div>
                      <div className="text-base font-semibold">{imageName(selectedItem)}</div>
                      <div className="text-sm text-muted-foreground">{selectedItem.image.folder_path || '根目录'}</div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-border/60 bg-muted/20 shadow-none">
                  <CardContent className="flex flex-col gap-3 py-4">
                    <div className="text-sm font-medium">当前需要处理的对象</div>
                    <div className="flex flex-wrap gap-2">
                      {routeStageItems.length > 0 ? (
                        routeStageItems.map((item) => (
                          <Button
                            key={item.draft.id}
                            variant={item.draft.id === selectedItem.draft.id ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => onSelectDraft(item.draft.id)}
                          >
                            {imageName(item)}
                          </Button>
                        ))
                      ) : (
                        <div className="text-sm text-muted-foreground">当前没有等待归档确认的项目。</div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-muted/20 shadow-none">
                  <CardContent className="flex flex-col gap-4 py-4">
                    <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-background/80 p-3">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">Deck 填写来源</div>
                        <Badge variant="outline">{routeSourceInfo.label}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">{routeSourceInfo.detail}</div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <div className="text-sm font-medium">目标 deck</div>
                        <Input
                          value={draftDeckInput}
                          onChange={(event) => onDraftDeckInputChange(event.target.value)}
                          placeholder="例如 Calculus::Chapter3"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="text-sm font-medium">Tags</div>
                        <Input
                          value={draftTagsInput}
                          onChange={(event) => onDraftTagsInputChange(event.target.value)}
                          placeholder="用英文逗号分隔，例如 calculus,chapter3"
                        />
                      </div>
                    </div>
                    <Card className="border-border/60 bg-background/80 shadow-none">
                      <CardContent className="flex flex-col gap-2 py-3">
                        <div className="text-sm font-medium">归档说明</div>
                        <div className="text-sm leading-6 text-muted-foreground">
                          {selectedItem.draft.route_reason || '当前没有额外的归档说明。'}
                        </div>
                      </CardContent>
                    </Card>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={onConfirmCurrentRoute}>
                        确认这张图的归档
                      </Button>
                      {selectedItem.draft.review_status === 'route_ready' && (
                        <Button variant="outline" size="sm" onClick={onSaveCurrentRoute}>
                          保存归档修改
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-muted/20 shadow-none">
                  <CardHeader>
                    <CardTitle>OCR 回读</CardTitle>
                    <CardDescription>归档判断会优先参考这里的内容。</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-[260px] overflow-auto rounded-xl border border-border/60 bg-background/80 p-3 text-sm whitespace-pre-wrap">
                      {selectedItem.draft.ocr_text || '这张图还没有 OCR 结果。'}
                    </pre>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-muted/20 shadow-none">
                  <CardHeader>
                    <CardTitle>当前图片预览</CardTitle>
                    <CardDescription>第一阶段把源图放到底部并放大，方便直接对照 OCR 和归档结果。</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedItem.draft.source_image_url ? (
                      <img
                        src={`${apiBaseUrl}${selectedItem.draft.source_image_url}`}
                        alt={imageName(selectedItem)}
                        className="max-h-[560px] w-full rounded-xl border border-border object-contain"
                      />
                    ) : (
                      <Empty className="min-h-[220px] border-border bg-muted/30">
                        <EmptyHeader>
                          <EmptyTitle>还没有源图预览</EmptyTitle>
                          <EmptyDescription>当前图片资源还没有准备好。</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="border-border/70 bg-background/80">
                <CardHeader>
                  <CardTitle>第二道审核：确认挖空结果</CardTitle>
                  <CardDescription>现在只看最终导入前真正重要的内容：遮罩、回读和最终导入位置。</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Card className="border-border/60 bg-muted/20 shadow-none">
                    <CardContent className="flex flex-col gap-3 py-4">
                      <div className="text-sm font-medium">当前等待确认的对象</div>
                      <div className="flex flex-wrap gap-2">
                        {(llmReviewItems.length > 0 ? llmReviewItems : [selectedItem]).map((item) => (
                          <Button
                            key={item.draft.id}
                            variant={item.draft.id === selectedItem.draft.id ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => onSelectDraft(item.draft.id)}
                          >
                            {imageName(item)}
                          </Button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <div className="text-sm font-medium">目标 deck</div>
                      <Input
                        value={draftDeckInput}
                        onChange={(event) => onDraftDeckInputChange(event.target.value)}
                        placeholder="例如 Calculus::Chapter3"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="text-sm font-medium">Tags</div>
                      <Input
                        value={draftTagsInput}
                        onChange={(event) => onDraftTagsInputChange(event.target.value)}
                        placeholder="用英文逗号分隔，例如 calculus,chapter3"
                      />
                    </div>
                  </div>
                  <Card className="border-border/60 bg-muted/20 shadow-none">
                    <CardContent className="flex flex-col gap-2 py-3">
                      <div className="text-sm font-medium">归档说明</div>
                      <div className="text-sm text-muted-foreground">
                        {selectedItem.draft.route_reason || '当前没有额外的归档说明。'}
                      </div>
                    </CardContent>
                  </Card>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={onApproveCurrentResult}>
                      批准最终结果
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-background/80">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle>遮罩编辑器</CardTitle>
                      <CardDescription>蓝框是 OCR 区域，绿色虚线是裁切框，白色块是当前遮罩。</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setFocusMode(true)}>
                      <ZoomInIcon data-icon="inline-start" />
                      聚焦编辑（Q）
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {renderEditor('normal')}
                </CardContent>
              </Card>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-border/70 bg-background/80">
                  <CardHeader>
                    <CardTitle>Front 预览</CardTitle>
                    <CardDescription>正面会使用当前裁切与遮罩生成。</CardDescription>
                  </CardHeader>
                  <CardContent className="min-h-[220px]">
                    {frontPreviewUrl ? (
                      <button
                        type="button"
                        onClick={() => openPreview('Front 预览', '点击放大查看当前正面预览。', frontPreviewUrl)}
                        className="w-full overflow-hidden rounded-xl border border-border bg-muted/20 text-left transition hover:border-primary/40"
                      >
                        <img
                          src={frontPreviewUrl}
                          alt="Front preview"
                          className="w-full rounded-xl object-contain"
                        />
                      </button>
                    ) : (
                      <Empty className="min-h-[180px] border-border bg-muted/30">
                        <EmptyHeader>
                          <EmptyTitle>还没有渲染结果</EmptyTitle>
                          <EmptyDescription>点击上方“渲染当前”即可生成 Front/Back 预览。</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                  </CardContent>
                </Card>
                <Card className="border-border/70 bg-background/80">
                  <CardHeader>
                    <CardTitle>Back 预览</CardTitle>
                    <CardDescription>背面保留裁切后的原图内容。</CardDescription>
                  </CardHeader>
                  <CardContent className="min-h-[220px]">
                    {backPreviewUrl ? (
                      <button
                        type="button"
                        onClick={() => openPreview('Back 预览', '点击放大查看当前背面预览。', backPreviewUrl)}
                        className="w-full overflow-hidden rounded-xl border border-border bg-muted/20 text-left transition hover:border-primary/40"
                      >
                        <img
                          src={backPreviewUrl}
                          alt="Back preview"
                          className="w-full rounded-xl object-contain"
                        />
                      </button>
                    ) : (
                      <Empty className="min-h-[180px] border-border bg-muted/30">
                        <EmptyHeader>
                          <EmptyTitle>等待渲染</EmptyTitle>
                          <EmptyDescription>裁切、遮罩或标签更新后，都可以重新生成预览。</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
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

      {focusStage === 'llm' ? (
        <Dialog open={focusMode} onOpenChange={setFocusMode}>
          <DialogContent className="h-[95vh] !w-[85vw] !max-w-[85vw] sm:!max-w-[85vw] overflow-auto rounded-[2rem] border-border/70 bg-background/95 p-4 shadow-2xl">
            <DialogHeader className="border-b border-border/60 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <DialogTitle>聚焦编辑</DialogTitle>
                  <DialogDescription>
                    当前只保留遮罩编辑和快捷键提示。按 Q 或右上角按钮可以退出。
                  </DialogDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{selectedItem.draft.masks.length} 个遮罩</Badge>
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
      ) : null}
    </div>
  )
}
