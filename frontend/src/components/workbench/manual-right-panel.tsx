import { useEffect, useState } from 'react'
import { DownloadIcon, RefreshCcwIcon, ShieldCheckIcon, ZoomInIcon } from 'lucide-react'

import type { AnkiConnectionState, DraftListItem } from '@/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

function formatCheckedAt(value?: string | null): string {
  if (!value) return '还没有同步记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '还没有同步记录'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function stateBadgeLabel(state: AnkiConnectionState['level']) {
  switch (state) {
    case 'loading':
      return '获取中'
    case 'success':
      return '已同步'
    case 'warning':
      return '需确认'
    case 'error':
      return '未就绪'
    default:
      return '尚未获取'
  }
}

function stateBadgeVariant(state: AnkiConnectionState['level']) {
  switch (state) {
    case 'success':
      return 'default'
    case 'warning':
      return 'secondary'
    case 'error':
      return 'destructive'
    default:
      return 'outline'
  }
}

interface ManualRightPanelProps {
  selectedItem: DraftListItem | null
  importableCount: number
  quality: number
  onQualityChange: (value: number) => void
  ankiState: AnkiConnectionState
  onRefreshConnection: () => void
  onImportCurrent: () => void
  onImportAll: () => void
  loadingKey: string | null
}

export function ManualRightPanel({
  selectedItem,
  importableCount,
  quality,
  onQualityChange,
  ankiState,
  onRefreshConnection,
  onImportCurrent,
  onImportAll,
  loadingKey,
}: ManualRightPanelProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    const buildPreview = async () => {
      if (!selectedItem?.image_blob) {
        setPreviewUrl(null)
        return
      }

      const imageUrl = URL.createObjectURL(selectedItem.image_blob)
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
        objectUrl = URL.createObjectURL(blob)
        if (!cancelled) {
          setPreviewUrl(objectUrl)
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
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [quality, selectedItem])

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
      <Card className="rounded-[24px] border-border/70 bg-background/85 shadow-none">
        <CardHeader>
          <CardTitle>导出质量</CardTitle>
          <CardDescription>这里控制发往 Anki 的原图压缩质量。值越高，图片越清晰，但占用也会更大。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldGroup>
            <Field>
              <FieldLabel>WebP 质量</FieldLabel>
              <FieldContent>
                <Input
                  type="number"
                  value={String(quality)}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    onQualityChange(Number.isFinite(next) ? Math.max(1, Math.min(next, 100)) : quality)
                  }}
                />
                <FieldDescription>默认 80。数值越高越清晰，文件也会更大，一般保持在 60 到 85 就够用了。</FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>

          <Alert className="border-border/60 bg-muted/20">
            <AlertTitle>当前导出范围</AlertTitle>
            <AlertDescription>
              {selectedItem
                ? `当前图片已有 ${selectedItem.draft.masks.length} 个遮罩，导出时会按遮罩分组拆成独立卡片。`
                : '先在左侧选一张图片，再检查这张图会导出多少张卡片。'}
            </AlertDescription>
          </Alert>

          {selectedItem ? (
            previewUrl ? (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3 text-left trs-all-400 hover:border-primary/40"
              >
                <img src={previewUrl} alt="导出预览" className="h-24 w-24 rounded-xl border border-border/60 object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">导出预览图</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    这里展示当前质量下会送去 Anki 的压缩预览。点击可放大查看。
                  </div>
                </div>
                <ZoomInIcon className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ) : (
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                当前还没有可用的导出预览图。
              </div>
            )
          ) : null}
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-border/70 bg-[linear-gradient(135deg,rgba(255,251,244,0.98),rgba(242,247,255,0.96))] shadow-none">
        <CardHeader>
          <CardTitle>连接并导出到 Anki</CardTitle>
          <CardDescription>网页会直接尝试连接你本机的 AnkiConnect。桌面浏览器是首发支持场景，手机浏览器暂时不保证可用。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant={stateBadgeVariant(ankiState.level)}>{stateBadgeLabel(ankiState.level)}</Badge>
              <Badge variant="outline">{ankiState.decks.length} 个牌组</Badge>
              <Badge variant="outline">最近同步：{formatCheckedAt(ankiState.lastCheckedAt)}</Badge>
              {ankiState.templateStatus && (
                <Badge variant="outline">
                  {ankiState.templateStatus.using_copy ? '使用副本模板' : '使用主模板'}
                </Badge>
              )}
            </div>
            <div className="text-sm font-medium">{ankiState.title}</div>
            <div className="text-sm text-muted-foreground">{ankiState.message}</div>
            {ankiState.templateStatus && (
              <div className="text-sm text-muted-foreground">
                当前模板：{ankiState.templateStatus.active_template_name}
              </div>
            )}
          </div>

          <Alert>
            <ShieldCheckIcon data-icon="inline-start" />
            <AlertTitle>连接失败时该检查什么</AlertTitle>
            <AlertDescription>
              先确认 Anki 已打开、AnkiConnect 已安装，并且已经允许当前网页访问。如果你是从远端站点打开本站，只要本机插件完成放行，网页仍然可以连接到你电脑里的 Anki。
            </AlertDescription>
          </Alert>

          <div className="grid gap-3">
            <Button variant="outline" onClick={onRefreshConnection}>
              {loadingKey === 'refresh-anki' ? <Spinner data-icon="inline-start" /> : <RefreshCcwIcon data-icon="inline-start" />}
              重新检测 Anki 连接
            </Button>
            <Button
              className="h-14 text-base font-semibold shadow-sm"
              onClick={onImportCurrent}
              disabled={!selectedItem || selectedItem.draft.masks.length === 0}
            >
              {loadingKey === 'manual-import-current' ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
              导出当前图片的全部卡片
            </Button>
            <Button
              variant="secondary"
              className="h-14 text-base font-semibold"
              onClick={onImportAll}
              disabled={importableCount === 0}
            >
              {loadingKey === 'manual-import-all' ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
              导出当前项目全部卡片
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>导出预览图</DialogTitle>
            <DialogDescription>这里展示当前质量设置下，准备发往 Anki 的图片版本。</DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20">
            {previewUrl ? <img src={previewUrl} alt="导出预览图放大" className="max-h-[70vh] w-full object-contain" /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
