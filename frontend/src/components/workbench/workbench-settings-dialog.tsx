import { useEffect, useState } from 'react'
import {
  ImageDownIcon,
  MaximizeIcon,
  Settings2Icon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
} from 'lucide-react'

import ankiHelpImage from '@/assets/ankiHelp-1.webp'
import type { WorkbenchSettings } from '@/types'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ZoomableImagePreviewCard } from '@/components/workbench/zoomable-image-preview-card'
import { transformImageBlob } from '@/lib/image-processing'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDimension(width: number, height: number): string {
  return `${width}×${height}`
}

function SettingSlider({
  icon: Icon,
  label,
  value,
  min,
  max,
  suffix = '',
  onChange,
  helper,
  disabled = false,
  presets = [],
}: {
  icon: typeof SlidersHorizontalIcon
  label: string
  value: number
  min: number
  max: number
  suffix?: string
  onChange: (value: number) => void
  helper?: string
  disabled?: boolean
  presets?: { label: string; value: number }[]
}) {
  return (
    <Field>
      <FieldLabel className={cn('flex items-center gap-2 text-[13px] font-medium', disabled && 'opacity-55')}>
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </FieldLabel>
      <FieldContent>
        <div className={cn('flex flex-col gap-2 rounded-2xl border border-border/60 bg-background/75 p-3', disabled && 'opacity-55')}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={min}
              max={max}
              value={value}
              disabled={disabled}
              onChange={(event) => onChange(Number(event.target.value))}
              className="trs-all-400 h-2 flex-1 min-w-0 appearance-none rounded-full bg-muted accent-foreground hover:[&::-webkit-slider-thumb]:scale-125 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground"
            />
            <div className="relative flex w-16 items-center">
              <input
                type="number"
                min={min}
                max={max}
                disabled={disabled}
                value={value}
                onChange={(event) => {
                  const val = parseInt(event.target.value, 10)
                  if (!isNaN(val)) onChange(val)
                }}
                className="w-full rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-right text-[12px] font-medium tabular-nums focus:border-foreground/40 focus:outline-none"
              />
              {suffix ? <span className="pointer-events-none absolute right-7 text-[11px] text-muted-foreground opacity-50">{suffix}</span> : null}
            </div>
          </div>
          {presets.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              {presets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(preset.value)}
                  className="trs-all-400 rounded-md border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[11.5px] text-muted-foreground hover:bg-muted/70 hover:text-foreground active:scale-95 disabled:pointer-events-none"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ) : null}
          {helper ? <FieldDescription className="mt-1">{helper}</FieldDescription> : null}
        </div>
      </FieldContent>
    </Field>
  )
}

export function WorkbenchSettingsDialog({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
  previewBlob,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: WorkbenchSettings
  onSettingsChange: (settings: WorkbenchSettings) => void
  previewBlob?: Blob | null
}) {
  const [previewUrl, setPreviewUrl] = useState<string>(ankiHelpImage)
  const [previewInfo, setPreviewInfo] = useState<{
    originalSize: number
    importSize: number
    originalWidth: number
    originalHeight: number
    importWidth: number
    importHeight: number
  } | null>(null)
  const importFormatLabel = settings.importCompressionFormat === 'jpeg' ? 'JPG' : 'WebP'

  useEffect(() => {
    let disposed = false
    let objectUrl: string | null = null
    let importPreviewUrl: string | null = null

    const buildPreview = async () => {
      const sourceBlob: Blob = previewBlob ?? await fetch(ankiHelpImage).then((response) => response.blob())
      objectUrl = URL.createObjectURL(sourceBlob)

      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const next = new Image()
        next.onload = () => resolve(next)
        next.onerror = () => reject(new Error('设置预览图加载失败。'))
        next.src = objectUrl as string
      })

      const imported = settings.importCompressionEnabled
        ? await transformImageBlob(sourceBlob, {
            maxDimension: settings.importMaxDimension,
            outputType: settings.importCompressionFormat === 'jpeg' ? 'image/jpeg' : 'image/webp',
            outputQuality: settings.importImageQuality / 100,
          })
        : {
            blob: sourceBlob,
            mediaType: sourceBlob.type || 'image/png',
            width: image.naturalWidth,
            height: image.naturalHeight,
          }

      importPreviewUrl = URL.createObjectURL(imported.blob)
      if (disposed) {
        URL.revokeObjectURL(importPreviewUrl)
        return
      }

      setPreviewUrl((current) => {
        if (current.startsWith('blob:')) URL.revokeObjectURL(current)
        return importPreviewUrl as string
      })
      setPreviewInfo({
        originalSize: sourceBlob.size,
        importSize: imported.blob.size,
        originalWidth: image.naturalWidth,
        originalHeight: image.naturalHeight,
        importWidth: imported.width,
        importHeight: imported.height,
      })
    }

    void buildPreview().catch(() => {
      if (!disposed) {
        setPreviewUrl(ankiHelpImage)
        setPreviewInfo(null)
      }
    })

    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      if (importPreviewUrl) URL.revokeObjectURL(importPreviewUrl)
    }
  }, [
    previewBlob,
    settings.importCompressionEnabled,
    settings.importCompressionFormat,
    settings.importImageQuality,
    settings.importMaxDimension,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" className="trs-all-400 rounded-xl text-muted-foreground hover:-translate-y-0.5 hover:text-foreground active:scale-[0.97]">
          <Settings2Icon />
          <span className="sr-only">设置</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(96vw,48rem)] max-w-[calc(100%-0.75rem)] overflow-hidden rounded-2xl p-0 sm:max-w-[48rem]">
        <DialogHeader className="border-b border-border/70 px-3 py-3 sm:px-4 sm:py-3.5">
          <DialogTitle className="flex items-center gap-2">
            <Settings2Icon className="size-4 text-muted-foreground" />
            设置
          </DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[84vh] flex-col gap-3 overflow-auto px-3 py-3 md:px-4 md:py-4">
          <div className="mx-auto flex w-full max-w-none min-w-0 flex-col justify-center gap-3 self-stretch">
            <Card className="border-border/70 bg-muted/10 shadow-none">
              <CardHeader className="gap-1.5 px-3 pb-2 pt-3 sm:px-4 sm:pb-2.5 sm:pt-4">
                <CardTitle className="flex items-center gap-2 text-[13px] font-medium sm:text-sm">
                  <ImageDownIcon className="size-4 text-muted-foreground" />
                  导入预处理
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 px-3 pb-3 sm:px-4 sm:pb-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel className="text-[13px] font-medium">导入时压缩</FieldLabel>
                    <FieldContent>
                      <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-background/75 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 text-[12px] text-muted-foreground">
                            默认关闭。开启后会先缩放再压缩，减少页面内存占用，但画质会先损一次。
                          </div>
                          <div className="flex shrink-0 items-center justify-end gap-2 text-right">
                            <span className="text-[11px] font-medium text-muted-foreground">{settings.importCompressionEnabled ? '已开启' : '已关闭'}</span>
                            <Switch
                              checked={settings.importCompressionEnabled}
                              onCheckedChange={(checked) => onSettingsChange({ ...settings, importCompressionEnabled: checked })}
                              aria-label="导入时压缩"
                              className="trs-all-400 mr-1 scale-125 data-[state=checked]:bg-foreground"
                            />
                          </div>
                        </div>
                        {settings.importCompressionEnabled ? (
                          <div className="flex flex-col gap-2 mt-1">
                            <div className="text-[12px] font-medium text-foreground/88">引擎格式</div>
                            <ToggleGroup
                              type="single"
                              value={settings.importCompressionFormat}
                              onValueChange={(value) => {
                                if (value === 'webp' || value === 'jpeg') {
                                  onSettingsChange({ ...settings, importCompressionFormat: value })
                                }
                              }}
                              variant="outline"
                              spacing={1}
                              className="w-full rounded-xl bg-background/80 p-1"
                            >
                              <ToggleGroupItem value="webp" className="flex-1 justify-center">WebP</ToggleGroupItem>
                              <ToggleGroupItem value="jpeg" className="flex-1 justify-center">JPG</ToggleGroupItem>
                            </ToggleGroup>
                            <FieldDescription>
                              JPG 兼容性更高，但会丢失透明通道；如果需要保留原有的透明背景层，请选择 WebP。
                            </FieldDescription>
                          </div>
                        ) : null}
                      </div>
                    </FieldContent>
                  </Field>
                </FieldGroup>

                {settings.importCompressionEnabled ? (
                  <>
                    <FieldGroup>
                      <SettingSlider
                        icon={MaximizeIcon}
                        label="导入最大分辨率 (px)"
                        value={settings.importMaxDimension}
                        min={960}
                        max={3200}
                        onChange={(value) => onSettingsChange({ ...settings, importMaxDimension: value })}
                        presets={[
                          { label: '960p', value: 960 },
                          { label: '1080p', value: 1080 },
                          { label: '2K', value: 1920 },
                          { label: '4K', value: 2560 },
                        ]}
                        helper="超过该分辨率将被等比缩小"
                      />
                      <SettingSlider
                        icon={SlidersHorizontalIcon}
                        label="导入压缩质量 (%)"
                        value={settings.importImageQuality}
                        min={1}
                        max={100}
                        onChange={(value) => onSettingsChange({ ...settings, importImageQuality: value })}
                        presets={[
                          { label: '极限', value: 5 },
                          { label: '低', value: 20 },
                          { label: '中', value: 50 },
                          { label: '高', value: 80 },
                        ]}
                        helper="对阅读而言，即使质量为 1 也通常足够清晰，建议目标大小百 KB 左右，以节约预览内存"
                      />
                    </FieldGroup>

                    <Separator className="bg-border/60" />
                  </>
                ) : null}

                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-background/55 p-3.5 text-[12.5px] leading-relaxed text-muted-foreground sm:text-[13px]">
                    <div className="flex items-center gap-2 font-medium text-foreground/85">
                      <TriangleAlertIcon className="size-4 text-amber-600" />
                      压缩警告
                    </div>
                    <div>如果大量图片的编辑体验卡顿，请必须开启上方压缩开关、调低质量指标、控制分辨率。</div>
                    <div>此处的参数仅影响浏览器内渲染，关于卡片最后长什么样（真格的“导出画质”和“导出格式”），请统一下拉至【导出】面板设置。</div>
                  </div>

                  <ZoomableImagePreviewCard
                    previewUrl={previewUrl}
                    previewAlt="设置预览"
                    title={settings.importCompressionEnabled ? `${importFormatLabel} 预处理细节预览` : '导入不压缩 (保留原图) 预览'}
                    description={
                      settings.importCompressionEnabled
                        ? (previewInfo ? `预估单图大小: ${formatBytes(previewInfo.importSize)} (${formatDimension(previewInfo.importWidth, previewInfo.importHeight)})` : '加载中...')
                        : (previewInfo ? `预估单图大小: ${formatBytes(previewInfo.originalSize)} (${formatDimension(previewInfo.originalWidth, previewInfo.originalHeight)})` : '加载中...')
                    }
                    dialogTitle="导入预处理细节预览"
                    dialogDescription={
                      settings.importCompressionEnabled
                        ? `当前设置：缩小至最大 ${settings.importMaxDimension}px / WebP 质量 ${settings.importImageQuality}%。`
                        : '当前不会引入体积衰减，也不会放大。'
                    }
                    compact={false}
                    imageClassName="object-contain bg-background/70"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
