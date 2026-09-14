import { useEffect, useState } from 'react'
import {
  BlocksIcon,
  ImageDownIcon,
  MaximizeIcon,
  MinimizeIcon,
  MousePointer2Icon,
  PanelTopIcon,
  Settings2Icon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
  ZapIcon,
} from 'lucide-react'

import ankiHelpImage from '@/assets/ankiHelp-1.webp'
import { CARD_GENERATION_MODE_OPTIONS } from '@/lib/card-generation'
import type { WorkbenchSettings } from '@/types'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
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
  className,
  wrapperClassName,
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
  className?: string
  wrapperClassName?: string
}) {
  return (
    <Field className={className}>
      <FieldLabel className={cn('mb-1 flex items-center gap-2 text-sm font-medium text-foreground', disabled && 'opacity-55')}>
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </FieldLabel>
      <FieldContent>
        <div className={cn('flex flex-col gap-2.5 rounded-xl border border-border/50 bg-background/40 p-3.5 shadow-sm', wrapperClassName, disabled && 'opacity-55')}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={min}
              max={max}
              value={value}
              disabled={disabled}
              onChange={(event) => onChange(Number(event.target.value))}
              className="trs-all-400 h-1.5 min-w-0 flex-1 appearance-none rounded-full bg-muted accent-foreground hover:[&::-webkit-slider-thumb]:scale-105 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground"
            />
            <div className="relative flex w-20 items-center">
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
                className="w-full rounded-md border border-border/50 bg-muted/40 px-2 py-1 text-right text-sm font-medium tabular-nums focus:border-foreground/40 focus:outline-none"
              />
              {suffix ? <span className="pointer-events-none absolute right-2 text-xs text-muted-foreground opacity-50">{suffix}</span> : null}
            </div>
          </div>
          {presets.length > 0 ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {presets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(preset.value)}
                  className="trs-all-400 rounded-lg border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/70 hover:text-foreground active:scale-95 disabled:pointer-events-none"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ) : null}
          {helper ? <FieldDescription className="text-xs text-muted-foreground">{helper}</FieldDescription> : null}
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
  showTrigger = true,
  scope = 'main',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: WorkbenchSettings
  onSettingsChange: (settings: WorkbenchSettings) => void
  previewBlob?: Blob | null
  showTrigger?: boolean
  scope?: 'main' | 'focus-mobile'
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
  const showMainSettings = scope === 'main'
  const showFocusMobileSettings = scope === 'focus-mobile'

  useEffect(() => {
    let disposed = false
    let objectUrl: string | null = null
    let importPreviewUrl: string | null = null

    const buildPreview = async () => {
      if (!showMainSettings) return;

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
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button size="icon-sm" variant="ghost" className="trs-all-400 rounded-xl text-muted-foreground hover:-translate-y-0.5 hover:text-foreground active:scale-[0.97]">
            <Settings2Icon />
            <span className="sr-only">设置</span>
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="w-[min(96vw,48rem)] max-w-[calc(100%-0.75rem)] overflow-hidden rounded-2xl p-0 sm:max-w-[48rem]">
        <DialogHeader className="border-b border-border/50 px-4 py-4 sm:px-6 sm:py-5">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Settings2Icon className="size-5 text-muted-foreground" />
            {showFocusMobileSettings ? '编辑设置' : '设置'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            调整导入预处理、制卡模式、性能选项，以及移动端编辑偏好。
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[84vh] flex-col gap-4 overflow-auto bg-muted/5 px-4 py-4 md:px-6 md:py-6">
          <div className="mx-auto flex w-full max-w-none min-w-0 flex-col justify-center gap-5 self-stretch">
            {showFocusMobileSettings ? (
              <Card className="overflow-hidden border-border/50 bg-muted/10 shadow-sm">
                <CardHeader className="border-b border-border/40 px-4 py-3 sm:px-5 sm:py-3.5">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Settings2Icon className="size-4 text-muted-foreground" />
                    移动端编辑偏好
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
                  <FieldGroup>
                    <Field>
                    <FieldLabel className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
                      <MousePointer2Icon className="size-4 text-muted-foreground" />
                      长按遮罩直接删除
                    </FieldLabel>
                      <FieldContent>
                        <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-background/40 p-3.5 shadow-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 text-xs text-muted-foreground">
                              默认关闭,手机易误触
                            </div>
                            <div className="flex shrink-0 items-center justify-end gap-3 text-right">
                              <Switch
                                checked={settings.mobileLongPressDeleteMask}
                                onCheckedChange={(checked) => onSettingsChange({ ...settings, mobileLongPressDeleteMask: checked })}
                                aria-label="长按删除遮罩"
                                className="trs-all-400 mr-1 scale-[1.15] data-[state=checked]:bg-foreground"
                              />
                            </div>
                          </div>
                        </div>
                      </FieldContent>
                    </Field>
                  </FieldGroup>
                </CardContent>
              </Card>
            ) : null}

            {showMainSettings ? (
            <>
            <Card className="overflow-hidden border-border/50 bg-muted/10 shadow-sm">
              <CardHeader className="border-b border-border/40 px-4 py-3 sm:px-5 sm:py-3.5">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ImageDownIcon className="size-4 text-muted-foreground" />
                  导入预处理
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
                <FieldGroup>
                  <Field>
                    <FieldLabel className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
                      <MinimizeIcon className="size-4 text-muted-foreground" />
                      导入时压缩
                      <span className={cn("rounded-md bg-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold text-foreground/70",settings.importCompressionEnabled&&"hidden")}>建议开启</span>
                    </FieldLabel>
                    <FieldContent>
                      <div className="flex flex-col gap-2 rounded-xl border-2 border-border/50 bg-background/40 p-3.5 ">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 text-xs text-muted-foreground">
                            压缩图片尺寸与质量，有效降低内存占用（画质轻微受损）
                          </div>
                          <div className="flex shrink-0 items-center justify-end gap-3 text-right">
                            <Switch
                              checked={settings.importCompressionEnabled}
                              onCheckedChange={(checked) => onSettingsChange({ ...settings, importCompressionEnabled: checked })}
                              aria-label="导入时压缩"
                              className="trs-all-400 mr-1 scale-[1.15] data-[state=checked]:bg-foreground"
                            />
                          </div>
                        </div>
                        {settings.importCompressionEnabled ? (
                          <div className="mt-1 flex flex-col gap-2 border-t border-border/40 pt-3">
                            <div className="text-sm font-medium text-foreground/90">引擎格式</div>
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
                              className="h-8 w-full rounded-xl bg-background/80 p-0.5"
                            >
                              <ToggleGroupItem value="webp" className="flex-1 justify-center text-xs">WebP</ToggleGroupItem>
                              <ToggleGroupItem value="jpeg" className="flex-1 justify-center text-xs">JPG</ToggleGroupItem>
                            </ToggleGroup>
                            <FieldDescription className="text-xs text-muted-foreground">
                              JPG 无透明通道；需保持透明背景请选 WebP。
                            </FieldDescription>
                          </div>
                        ) : null}
                      </div>
                    </FieldContent>
                  </Field>
                </FieldGroup>

                {settings.importCompressionEnabled ? (
                  <>
                    <div className="flex flex-col sm:flex-row items-stretch gap-4 sm:gap-0 sm:divide-x sm:divide-border/40 sm:rounded-xl sm:border sm:border-border/50 sm:bg-background/40 sm:shadow-sm">
                      <SettingSlider
                        className="flex-1 sm:p-4"
                        wrapperClassName="sm:border-none sm:bg-transparent sm:shadow-none sm:p-0"
                        icon={MaximizeIcon}
                        label="导入最大分辨率"
                        value={settings.importMaxDimension}
                        min={480}
                        max={4096}
                        onChange={(value) => onSettingsChange({ ...settings, importMaxDimension: value })}
                        presets={[
                          { label: 'HD', value: 1280 },
                          { label: 'FHD', value: 1920 },
                          { label: '2K', value: 2560 },
                          { label: '无限制', value: 4096 },
                        ]}
                        helper="超出将被缩小。4096 即基本无限制"
                      />
                      <SettingSlider
                        className="flex-1 sm:p-4"
                        wrapperClassName="sm:border-none sm:bg-transparent sm:shadow-none sm:p-0"
                        icon={SlidersHorizontalIcon}
                        label="导入压缩质量"
                        value={settings.importImageQuality}
                        min={1}
                        max={100}
                        suffix="%"
                        onChange={(value) => onSettingsChange({ ...settings, importImageQuality: value })}
                        presets={[
                          { label: '极限', value: 5 },
                          { label: '低', value: 20 },
                          { label: '中', value: 50 },
                          { label: '高', value: 80 },
                        ]}
                        helper="对阅读而言，极低甚至也会很清晰"
                      />
                    </div>

                    <Separator className="bg-border/40" />
                  </>
                ) : null}

                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-2.5 rounded-xl bg-background/40 p-3 text-xs text-muted-foreground ">
                    <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-foreground/70" />
                    <div className="flex flex-col gap-0.5 leading-normal">
                      <span className="font-medium text-foreground/90">使用提示</span>
                      <span>受限于浏览器性能，原图编辑可能卡顿。此设置仅影响预览质量，最终清晰度以导出为准。</span>
                    </div>
                  </div>

                  {settings.importCompressionEnabled ? (
                    <ZoomableImagePreviewCard
                      previewUrl={previewUrl}
                      previewAlt="设置预览"
                      title={`${importFormatLabel} 预估单图大小预览`}
                      description={
                        previewInfo ? `${formatBytes(previewInfo.importSize)} (${formatDimension(previewInfo.importWidth, previewInfo.importHeight)})` : '加载中...'
                      }
                      dialogTitle="导入预处理细节预览"
                      dialogDescription={`当前设置：缩小至最大 ${settings.importMaxDimension}px / WebP 质量 ${settings.importImageQuality}%。`}
                      compact={false}
                      imageClassName="object-contain bg-background/70"
                    />
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-border/50 bg-muted/10 shadow-sm">
              <CardHeader className="border-b border-border/40 px-4 py-3 sm:px-5 sm:py-3.5">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Settings2Icon className="size-4 text-muted-foreground" />
                  制卡模式
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
                <FieldGroup>
                  <Field>
                    <FieldLabel className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
                      <BlocksIcon className="size-4 text-muted-foreground" />
                      导出时怎样生成卡片
                    </FieldLabel>
                    <FieldContent>
                      <div className="flex flex-col gap-2.5">
                        {CARD_GENERATION_MODE_OPTIONS.map((option) => {
                          const active = settings.cardGenerationMode === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => onSettingsChange({ ...settings, cardGenerationMode: option.value })}
                              className={cn(
                                'w-full rounded-xl border px-3.5 py-3 text-left transition',
                                active
                                  ? 'border-foreground/80 bg-background text-foreground shadow-sm'
                                  : 'border-border/50 bg-background/40 text-foreground hover:border-border/80 hover:bg-background/60 hover:shadow-sm',
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 space-y-1">
                                  <div className="text-sm font-medium">{option.label}</div>
                                  <div className="text-xs text-muted-foreground">{option.description}</div>
                                </div>
                                <div
                                  className={cn(
                                    'mr-0.5 mt-0.5 size-4 shrink-0 rounded-full border',
                                    active ? 'border-foreground bg-foreground' : 'border-border/70 bg-background',
                                  )}
                                />
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </FieldContent>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-border/50 bg-muted/10 shadow-sm">
              <CardHeader className="border-b border-border/40 px-4 py-3 sm:px-5 sm:py-3.5">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <MaximizeIcon className="size-4 text-muted-foreground" />
                  性能与体验
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
                <FieldGroup>
                  <Field>
                    <FieldLabel className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
                      <ZapIcon className="size-4 text-muted-foreground" />
                      禁用流畅动画 (极致性能)
                    </FieldLabel>
                    <FieldContent>
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/40 p-3.5 shadow-sm">
                        <div className="min-w-0 text-xs text-muted-foreground">
                          关闭所有过渡动画，在低配设备换取极致响应速度并节省电量。
                        </div>
                        <div className="flex shrink-0 items-center justify-end gap-3 text-right">
                          <Switch
                            checked={settings.disableAnimations}
                            onCheckedChange={(checked) => onSettingsChange({ ...settings, disableAnimations: checked })}
                            aria-label="禁用流畅动画"
                            className="trs-all-400 mr-1 scale-[1.15] data-[state=checked]:bg-foreground"
                          />
                        </div>
                      </div>
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldLabel className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
                      <PanelTopIcon className="size-4 text-muted-foreground" />
                      启用聚焦悬浮控制岛
                    </FieldLabel>
                    <FieldContent>
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/40 p-3.5 shadow-sm">
                        <div className="min-w-0 text-xs text-muted-foreground">
                          聚焦模式下使用现代悬浮控制条，最大化画板空间。
                        </div>
                        <div className="flex shrink-0 items-center justify-end gap-3 text-right">
                          <Switch
                            checked={settings.modernFloatingToolbar}
                            onCheckedChange={(checked) => onSettingsChange({ ...settings, modernFloatingToolbar: checked })}
                            aria-label="启用聚焦悬浮控制岛"
                            className="trs-all-400 mr-1 scale-[1.15] data-[state=checked]:bg-foreground"
                          />
                        </div>
                      </div>
                    </FieldContent>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
            </>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
