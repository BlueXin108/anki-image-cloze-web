import { useEffect, useState } from 'react'
import { ImportIcon, RefreshCcwIcon, SparklesIcon, ZoomInIcon } from 'lucide-react'

import type { AnkiTemplateStatus, DraftListItem, ImageCompressionPreview, ImageProcessingSettings } from '@/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { api } from '@/lib/api'

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

interface ManualRightPanelProps {
  selectedItem: DraftListItem | null
  imageSettings: ImageProcessingSettings | null
  onImageSettingsChange: (settings: ImageProcessingSettings) => void
  onSaveImageSettings: () => void
  loadingKey: string | null
  onImportCurrent: () => void
  onImportAll: () => void
}

export function ManualRightPanel({
  selectedItem,
  imageSettings,
  onImageSettingsChange,
  onSaveImageSettings,
  loadingKey,
  onImportCurrent,
  onImportAll,
}: ManualRightPanelProps) {
  const [preview, setPreview] = useState<ImageCompressionPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [templateStatus, setTemplateStatus] = useState<AnkiTemplateStatus | null>(null)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!selectedItem || !imageSettings) {
      setPreview(null)
      setPreviewError(null)
      setPreviewLoading(false)
      return
    }

    setPreviewLoading(true)
    setPreviewError(null)
    void api
      .getImageCompressionPreview({
        imageId: selectedItem.image.id,
        llmImageCompressEnabled: true,
        llmImageFormat: 'webp',
        llmImageQuality: imageSettings.llm_image_quality,
      })
      .then((result) => {
        if (!cancelled) setPreview(result)
      })
      .catch((error) => {
        if (!cancelled) {
          setPreview(null)
          setPreviewError(error instanceof Error ? error.message : '导出预览生成失败。')
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedItem?.image.id, imageSettings?.llm_image_quality])

  const refreshTemplateStatus = async () => {
    setTemplateLoading(true)
    setTemplateError(null)
    try {
      const result = await api.getManualTemplateStatus()
      setTemplateStatus(result)
    } catch (error) {
      setTemplateStatus(null)
      setTemplateError(error instanceof Error ? error.message : '模板检查失败。')
    } finally {
      setTemplateLoading(false)
    }
  }

  useEffect(() => {
    void refreshTemplateStatus()
  }, [])

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.45fr)]">
      <Card className="rounded-[24px] border-border/70 bg-background/85 shadow-none">
        <CardHeader>
          <CardTitle>手动导出压缩</CardTitle>
          <CardDescription>这里复用现有 WebP 预览逻辑，但语义改成导出/导入给 Anki 前的压缩质量预览。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {imageSettings && (
            <FieldGroup>
              <Field>
                <FieldLabel>WebP 质量</FieldLabel>
                <FieldContent>
                  <Input
                    type="number"
                    value={String(imageSettings.llm_image_quality)}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      onImageSettingsChange({
                        ...imageSettings,
                        llm_image_quality: Number.isFinite(next) ? Math.max(1, Math.min(next, 100)) : imageSettings.llm_image_quality,
                      })
                    }}
                  />
                  <FieldDescription>手动模式下改成 1~100，直接控制最终导出图片的压缩质量。</FieldDescription>
                </FieldContent>
              </Field>
            </FieldGroup>
          )}

          {selectedItem ? (
            previewLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                正在生成导出预览...
              </div>
            ) : previewError ? (
              <Alert>
                <AlertTitle>导出预览失败</AlertTitle>
                <AlertDescription>{previewError}</AlertDescription>
              </Alert>
            ) : preview ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">WebP 质量 {preview.quality}</Badge>
                  <Badge variant="outline">压缩后 {formatBytes(preview.byte_size)}</Badge>
                  <Badge variant="outline">原图 {formatBytes(preview.original_byte_size)}</Badge>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-background px-4 py-4 text-left transition hover:border-primary/40"
                >
                  <div className="flex flex-col gap-1">
                    <div className="text-sm font-medium">导出图像预览默认折叠</div>
                    <div className="text-sm text-muted-foreground">
                      不再直接显示缩略图，避免影响这一栏的重心。需要时点这里直接放大查看。
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>点击放大</span>
                    <ZoomInIcon className="size-4" />
                  </div>
                </button>
              </div>
            ) : null
            ) : (
              <div className="text-sm text-muted-foreground">先在左侧选一张图，才会显示导出压缩预览。</div>
          )}

          <Button className="w-full" onClick={onSaveImageSettings} disabled={!imageSettings}>
            {loadingKey === 'save-image-settings' ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
            保存导出压缩设置
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-border/70 bg-[linear-gradient(135deg,rgba(250,251,255,0.98),rgba(239,246,255,0.96))] shadow-none">
        <CardHeader>
          <CardTitle>导入到 Anki</CardTitle>
          <CardDescription>这是手动模式最重要的出口区域。会优先检查 `Image Occlusion Enhanced`，若同名模板已存在，则自动使用新的副本模板，避免覆盖旧内容。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {templateLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              正在检查模板...
            </div>
          ) : templateError ? (
            <Alert>
              <AlertTitle>模板检查失败</AlertTitle>
              <AlertDescription>{templateError}</AlertDescription>
            </Alert>
          ) : templateStatus ? (
            <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{templateStatus.active_template_name}</Badge>
                <Badge variant="outline">{templateStatus.using_copy ? '当前使用副本模板' : '当前使用主模板'}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {templateStatus.exact_exists
                  ? '检测到同名模板已存在。手动模式不会覆盖它，而会使用一个新的副本模板。'
                  : '当前没有同名模板。首次导入时会自动创建。'}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3">
            <Button variant="outline" onClick={() => void refreshTemplateStatus()}>
              <RefreshCcwIcon data-icon="inline-start" />
              重新检查模板
            </Button>
            <Button
              className="h-14 text-base font-semibold shadow-sm"
              onClick={onImportCurrent}
              disabled={!selectedItem || (selectedItem.draft.masks.length ?? 0) === 0}
            >
              {loadingKey === 'manual-import-current' ? <Spinner data-icon="inline-start" /> : <ImportIcon data-icon="inline-start" />}
              导入当前图片的所有遮罩卡片
            </Button>
            <Button
              variant="secondary"
              className="h-14 text-base font-semibold"
              onClick={onImportAll}
            >
              {loadingKey === 'manual-import-all' ? <Spinner data-icon="inline-start" /> : <ImportIcon data-icon="inline-start" />}
              导入当前手动模式下全部图片
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>导出图像预览</DialogTitle>
              <DialogDescription>这里展示的是压缩后会进入 Anki 的图片版本。</DialogDescription>
            </DialogHeader>
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20">
              <img src={preview.preview_data_url} alt="导出图像放大预览" className="max-h-[75vh] w-full object-contain" />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
