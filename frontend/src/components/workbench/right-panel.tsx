import { AnimatePresence, motion } from 'framer-motion'
import { BotIcon, CircleHelpIcon, FolderTreeIcon, RefreshCcwIcon, SparklesIcon, ZoomInIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import type {
  AnalysisMode,
  DraftListItem,
  ImageCompressionPreview,
  ImageProcessingSettings,
  LLMModelRecord,
  LLMSettings,
  MaskDensity,
  ModelConnectionTestResponse,
  PromptPreset,
  PromptPresetRecord,
  RoutingSettings,
  } from '@/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'

const LAYOUT_TRANSITION = {
  duration: 0.55,
  ease: [0.16, 1, 0.3, 1] as const,
}

const CONTENT_TRANSITION = {
  duration: 0.4,
  ease: [0, 0.43, 0, 0.99] as const,
}

const promptPresetLabels: Record<PromptPreset, string> = {
  anki_focus: '记忆挖空',
  concept_map: '概念网络',
  formula_focus: '公式优先',
  custom: '自定义',
}

const maskDensityLabels: Record<MaskDensity, string> = {
  few: '少',
  medium: '中',
  many: '多',
  complete: '完全',
}

interface RightPanelProps {
  selectedItem: DraftListItem | null
  selectedTab: string
  onTabChange: (tab: string) => void
  analysisMode: AnalysisMode
  onAnalysisModeChange: (mode: AnalysisMode) => void
  settings: LLMSettings | null
  onSettingsChange: (settings: LLMSettings) => void
  routingSettings: RoutingSettings | null
  onRoutingSettingsChange: (settings: RoutingSettings) => void
  imageSettings: ImageProcessingSettings | null
  onImageSettingsChange: (settings: ImageProcessingSettings) => void
  settingsApiKey: string
  onSettingsApiKeyChange: (value: string) => void
  loadingKey: string | null
  modelOptions: LLMModelRecord[]
  promptPresets: PromptPresetRecord[]
  modelLoading: boolean
  modelError: string | null
  connectionTestResult: ModelConnectionTestResponse | null
  onFetchModels: () => void
  onTestConnection: () => void
  onRunCurrentLlm: () => void
  onSaveSettings: () => void
  onSaveImageSettings: () => void
  onSaveRoutingSettings: () => void
}

function describeMaskCount(count: number): string {
  if (count === 0) return '还没有遮罩建议'
  if (count === 1) return '目前只有 1 个遮罩，通常偏少'
  return `当前有 ${count} 个遮罩，更接近多点记忆测试`
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function RightPanel({
  selectedItem,
  selectedTab,
  onTabChange,
  analysisMode,
  onAnalysisModeChange,
  settings,
  onSettingsChange,
  routingSettings,
  onRoutingSettingsChange,
  imageSettings,
  onImageSettingsChange,
  settingsApiKey,
  onSettingsApiKeyChange,
  loadingKey,
  modelOptions,
  promptPresets,
  modelLoading,
  modelError,
  connectionTestResult,
  onFetchModels,
  onTestConnection,
  onRunCurrentLlm,
  onSaveSettings,
  onSaveImageSettings,
  onSaveRoutingSettings,
}: RightPanelProps) {
  const currentMaskCount = selectedItem?.draft.masks.length ?? 0
  const promptPresetMap = new Map(promptPresets.map((item) => [item.id, item]))
  const [preview, setPreview] = useState<ImageCompressionPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const deliveryNote = (() => {
    if (analysisMode === 'ocr_only') {
      return '本次只发送 OCR 文本，不发送图像'
    }
    if (imageSettings?.llm_image_compress_enabled) {
      return `本次同时发送图像和 OCR 文本，图像会以内联 ${imageSettings.llm_image_format.toUpperCase()} 数据发送，质量 ${imageSettings.llm_image_quality}`
    }
    return '本次同时发送图像和 OCR 文本，图像会以内联 PNG 数据发送'
  })()

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
        llmImageCompressEnabled: imageSettings.llm_image_compress_enabled,
        llmImageFormat: imageSettings.llm_image_format,
        llmImageQuality: imageSettings.llm_image_quality,
      })
      .then((result) => {
        if (!cancelled) {
          setPreview(result)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPreview(null)
          setPreviewError(error instanceof Error ? error.message : '预览生成失败。')
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
  }, [
    selectedItem?.image.id,
    imageSettings?.llm_image_compress_enabled,
    imageSettings?.llm_image_format,
    imageSettings?.llm_image_quality,
  ])

  return (
    <motion.div layout transition={LAYOUT_TRANSITION} className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="text-sm font-medium">语义工作台</div>
        <div className="text-xs text-muted-foreground">把“送去哪里”和“遮哪里”分开表达，避免概念混在一起。</div>
      </div>

      <Tabs value={selectedTab} onValueChange={onTabChange} className="flex h-full flex-col">
        <TabsList className="mx-4 mt-4 grid grid-cols-3">
          <TabsTrigger value="suggestions">LLM 引擎</TabsTrigger>
          <TabsTrigger value="settings">模型与提示</TabsTrigger>
          <TabsTrigger value="image">图像处理</TabsTrigger>
        </TabsList>

        <motion.div layout="size" transition={LAYOUT_TRANSITION} className="flex-1 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={`${selectedTab}-${selectedItem?.draft.id ?? 'empty'}`}
              layout="position"
              transition={CONTENT_TRANSITION}
              initial={{ opacity: 0, filter: 'blur(10px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(8px)' }}
              className="h-full"
            >
              <ScrollArea className="h-full px-4 py-4">
                <TabsContent value="suggestions" className="mt-0 flex flex-col gap-4">
                  <Alert className="border-primary/30 bg-primary/5">
                    <AlertTitle>LLM 是核心判断器</AlertTitle>
                    <AlertDescription>
                      这一块专门解决“图里到底该挖哪里”。目录路由只负责决定送到哪个 deck，不负责决定遮罩内容。
                    </AlertDescription>
                  </Alert>

                  {selectedItem ? (
                    <>
                      <Card className="border-border/70 bg-background/85">
                        <CardHeader>
                          <CardTitle>当前草稿的语义策略</CardTitle>
                          <CardDescription>让模型判断真正的重点内容，再决定需要打多少遮罩，而不是死卡固定数量。</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                          <FieldGroup>
                            <Field>
                              <FieldLabel>本次让模型看什么</FieldLabel>
                              <FieldContent>
                                <ToggleGroup
                                  type="single"
                                  value={analysisMode}
                                  onValueChange={(value) => value && onAnalysisModeChange(value as AnalysisMode)}
                                  className="justify-start"
                                >
                                  <ToggleGroupItem value="hybrid">图像 + OCR</ToggleGroupItem>
                                  <ToggleGroupItem value="ocr_only">只看 OCR</ToggleGroupItem>
                                </ToggleGroup>
                                <FieldDescription>默认使用图像 + OCR。只看 OCR 仅作为排错或兜底模式。</FieldDescription>
                              </FieldContent>
                            </Field>
                            <Field>
                              <FieldLabel>遮罩密度</FieldLabel>
                              <FieldContent>
                                {settings && (
                                  <ToggleGroup
                                    type="single"
                                    value={settings.mask_density}
                                    onValueChange={(value) =>
                                      value && onSettingsChange({ ...settings, mask_density: value as MaskDensity })
                                    }
                                    className="justify-start"
                                  >
                                    {(['few', 'medium', 'many', 'complete'] as const).map((density) => (
                                      <ToggleGroupItem key={density} value={density}>
                                        {maskDensityLabels[density]}
                                      </ToggleGroupItem>
                                    ))}
                                  </ToggleGroup>
                                )}
                                <FieldDescription>少 / 中 / 多 / 完全。完全模式理论上不设数量上限，只要值得记忆测试就继续打遮罩。</FieldDescription>
                              </FieldContent>
                            </Field>
                          </FieldGroup>

                          <Alert className="border-border/60 bg-muted/20">
                            <AlertTitle>当前发送方式</AlertTitle>
                            <AlertDescription>
                              {deliveryNote}。运行后请到右下角日志窗里核对 OCR 全文、模型回读文字和具体挖空目标。
                            </AlertDescription>
                          </Alert>

                          <div className="grid gap-3 md:grid-cols-3">
                            <Card className="border-border/60 bg-muted/20 shadow-none">
                              <CardContent className="space-y-1 py-4">
                                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Mask Count</div>
                                <div className="text-2xl font-semibold">{currentMaskCount}</div>
                                <div className="text-sm text-muted-foreground">{describeMaskCount(currentMaskCount)}</div>
                              </CardContent>
                            </Card>
                            <Card className="border-border/60 bg-muted/20 shadow-none">
                              <CardContent className="space-y-1 py-4">
                                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Prompt Mode</div>
                                <div className="flex items-center gap-2">
                                  <div className="text-2xl font-semibold">
                                    {settings ? promptPresetLabels[settings.prompt_preset] : '未配置'}
                                  </div>
                                  {settings && promptPresetMap.get(settings.prompt_preset) && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button type="button" className="text-muted-foreground transition-colors hover:text-foreground">
                                          <CircleHelpIcon className="size-4" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-lg whitespace-pre-wrap text-left">
                                        {promptPresetMap.get(settings.prompt_preset)?.prompt_preview}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground">当前 LLM 提示风格</div>
                              </CardContent>
                            </Card>
                            <Card className="border-border/60 bg-muted/20 shadow-none">
                              <CardContent className="space-y-1 py-4">
                                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Mask Density</div>
                                <div className="text-2xl font-semibold">
                                  {settings ? maskDensityLabels[settings.mask_density] : '未配置'}
                                </div>
                                <div className="text-sm text-muted-foreground">当前遮罩覆盖强度</div>
                              </CardContent>
                            </Card>
                          </div>

                          <Button className="w-full" onClick={onRunCurrentLlm}>
                            {loadingKey === 'llm-single' ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
                            重新生成当前草稿的 LLM 遮罩
                          </Button>
                        </CardContent>
                      </Card>

                      <Card className="border-border/70 bg-background/85">
                        <CardHeader>
                          <CardTitle>模型给出的当前结果</CardTitle>
                          <CardDescription>{selectedItem.draft.llm_summary || '还没有语义总结。'}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                          {selectedItem.draft.llm_observed_text && (
                            <Card className="border-border/60 bg-muted/20 shadow-none">
                              <CardContent className="flex flex-col gap-2 py-3 text-sm">
                                <div className="font-medium">模型回读到的文字</div>
                                <pre className="rounded-xl border border-border/60 bg-background/80 p-3 whitespace-pre-wrap">
                                  {selectedItem.draft.llm_observed_text}
                                </pre>
                              </CardContent>
                            </Card>
                          )}

                          {selectedItem.draft.llm_cloze_targets.length > 0 && (
                            <Card className="border-border/60 bg-muted/20 shadow-none">
                              <CardContent className="flex flex-col gap-2 py-3 text-sm">
                                <div className="font-medium">模型计划挖空的词</div>
                                <div className="flex flex-wrap gap-2">
                                  {selectedItem.draft.llm_cloze_targets.map((target) => (
                                    <Badge key={`${selectedItem.draft.id}-${target}`} variant="secondary">
                                      {target}
                                    </Badge>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          )}

                          {selectedItem.draft.ocr_text && (
                            <Card className="border-border/60 bg-muted/20 shadow-none">
                              <CardContent className="flex flex-col gap-2 py-3 text-sm">
                                <div className="font-medium">OCR 全文回读</div>
                                <pre className="rounded-xl border border-border/60 bg-background/80 p-3 whitespace-pre-wrap">
                                  {selectedItem.draft.ocr_text}
                                </pre>
                              </CardContent>
                            </Card>
                          )}

                          {selectedItem.draft.llm_warnings.length > 0 && (
                            <Alert>
                              <AlertTitle>需要留意</AlertTitle>
                              <AlertDescription>{selectedItem.draft.llm_warnings.join('；')}</AlertDescription>
                            </Alert>
                          )}
                          {selectedItem.draft.masks.map((mask) => (
                            <Card key={mask.id} className="border-border/60 bg-muted/20 shadow-none">
                              <CardContent className="flex flex-col gap-2 py-3 text-sm">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="font-medium">{mask.label || '未命名遮罩'}</div>
                                  <div className="flex gap-2">
                                    <Badge variant="outline">{mask.source}</Badge>
                                    <Badge variant={mask.manual ? 'secondary' : 'outline'}>
                                      {mask.manual ? '手动' : '自动'}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="text-muted-foreground">bbox: {mask.bbox.join(', ')}</div>
                                <div className="text-muted-foreground">confidence: {mask.confidence.toFixed(2)}</div>
                                {mask.reason && <div className="text-muted-foreground">{mask.reason}</div>}
                              </CardContent>
                            </Card>
                          ))}
                          {selectedItem.draft.masks.length === 0 && (
                            <Alert>
                              <AlertTitle>还没有结果</AlertTitle>
                              <AlertDescription>先运行一次 LLM，让它给出第一版多遮罩建议。</AlertDescription>
                            </Alert>
                          )}
                        </CardContent>
                      </Card>

                    </>
                  ) : (
                    <Alert>
                      <AlertTitle>先选一张草稿</AlertTitle>
                      <AlertDescription>选中左侧队列中的任意一项后，这里会显示它的 LLM 策略和当前遮罩结果。</AlertDescription>
                    </Alert>
                  )}
                </TabsContent>

                <TabsContent value="rules" className="mt-0 flex flex-col gap-4">
                  <Alert className="border-primary/30 bg-primary/5">
                    <AlertTitle>只保留两个模式</AlertTitle>
                    <AlertDescription>
                      不再让你手写复杂匹配。现在只有“文件夹同名直连”或者“交给模型决定”。
                    </AlertDescription>
                  </Alert>

                  <Card className="border-border/70 bg-background/85">
                    <CardHeader>
                      <CardTitle>扫描到图片后，送去哪里</CardTitle>
                      <CardDescription>选一个你更想要的方式，保存后就会成为默认行为。</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      {routingSettings && (
                        <FieldGroup>
                          <Card className="border-border/60 bg-muted/20 shadow-none">
                            <CardContent className="flex flex-col gap-3 py-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                  <Badge variant={routingSettings.mode === 'folder_name' ? 'default' : 'outline'}>
                                    默认推荐
                                  </Badge>
                                  <div className="text-base font-medium">1. 文件夹同名直连</div>
                                  <div className="text-sm text-muted-foreground">
                                    图片在什么文件夹里，就送到同名 deck。没有这个 deck 的话，导入时自动创建。
                                  </div>
                                </div>
                                <Toggle
                                  variant="outline"
                                  pressed={routingSettings.mode === 'folder_name'}
                                  onPressedChange={(pressed) => {
                                    if (pressed) {
                                      onRoutingSettingsChange({ ...routingSettings, mode: 'folder_name' })
                                    }
                                  }}
                                >
                                  {routingSettings.mode === 'folder_name' ? '当前使用' : '改用这个'}
                                </Toggle>
                              </div>
                              <div className="rounded-2xl border border-border/60 bg-background/80 p-3 text-sm text-muted-foreground">
                                例子：扫描目录里有 `Calculus/Definition`，系统会直接送到 `Calculus::Definition`。
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="border-border/60 bg-muted/20 shadow-none">
                            <CardContent className="flex flex-col gap-3 py-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                  <Badge variant={routingSettings.mode === 'semantic' ? 'default' : 'outline'}>
                                    模型模式
                                  </Badge>
                                  <div className="text-base font-medium">2. 交给模型决定</div>
                                  <div className="text-sm text-muted-foreground">
                                    模型会先看当前目录内部已经有哪些文件夹，再看图片内容。能放进已有 deck 就放进去，不合适就给一个新 deck 名。
                                  </div>
                                </div>
                                <Toggle
                                  variant="outline"
                                  pressed={routingSettings.mode === 'semantic'}
                                  onPressedChange={(pressed) => {
                                    if (pressed) {
                                      onRoutingSettingsChange({ ...routingSettings, mode: 'semantic' })
                                    }
                                  }}
                                >
                                  {routingSettings.mode === 'semantic' ? '当前使用' : '改用这个'}
                                </Toggle>
                              </div>
                              <div className="rounded-2xl border border-border/60 bg-background/80 p-3 text-sm text-muted-foreground">
                                模型模式需要先把 LLM 打开。否则系统会自动退回到文件夹同名直连，保证流程不会卡住。
                              </div>
                            </CardContent>
                          </Card>
                        </FieldGroup>
                      )}

                      <Button onClick={onSaveRoutingSettings} disabled={!routingSettings}>
                        {loadingKey === 'save-routing-settings' ? <Spinner data-icon="inline-start" /> : <FolderTreeIcon data-icon="inline-start" />}
                        保存“送去哪里”方式
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="settings" className="mt-0 flex flex-col gap-4">
                  <Card className="border-border/70 bg-background/85">
                    <CardHeader>
                      <CardTitle>模型连接</CardTitle>
                      <CardDescription>这里解决“模型从哪里来、用哪个模型、用什么提示方式”。</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      {settings && (
                        <FieldGroup>
                          <Field>
                            <FieldLabel>模型开关</FieldLabel>
                            <FieldContent>
                              <div className="flex items-center gap-3">
                                <Toggle
                                  variant="outline"
                                  pressed={settings.enabled}
                                  onPressedChange={(pressed) => onSettingsChange({ ...settings, enabled: pressed })}
                                >
                                  {settings.enabled ? '已启用' : '已停用'}
                                </Toggle>
                                <div className="text-sm text-muted-foreground">
                                  关闭时不会真正发请求给模型，只会保留本地基础候选。
                                </div>
                              </div>
                            </FieldContent>
                          </Field>

                          <Field>
                            <FieldLabel>Base URL</FieldLabel>
                            <FieldContent>
                              <div className="flex gap-2">
                                <Input
                                  value={settings.base_url}
                                  onChange={(event) => onSettingsChange({ ...settings, base_url: event.target.value })}
                                />
                                <Button variant="outline" onClick={onFetchModels}>
                                  {modelLoading ? <Spinner data-icon="inline-start" /> : <RefreshCcwIcon data-icon="inline-start" />}
                                  拉取模型
                                </Button>
                                <Button variant="outline" onClick={onTestConnection}>
                                  {loadingKey === 'test-connection' ? <Spinner data-icon="inline-start" /> : <BotIcon data-icon="inline-start" />}
                                  测试连接
                                </Button>
                              </div>
                              <FieldDescription>会尝试从这个地址读取可选模型列表。</FieldDescription>
                            </FieldContent>
                          </Field>

                          <Field>
                            <FieldLabel>API Key</FieldLabel>
                            <FieldContent>
                              <Input
                                type="password"
                                value={settingsApiKey}
                                placeholder={settings.api_key_present ? '已保存，留空则不覆盖' : '输入新的 API Key'}
                                onChange={(event) => onSettingsApiKeyChange(event.target.value)}
                              />
                            </FieldContent>
                          </Field>

                          <Field>
                            <FieldLabel>Model</FieldLabel>
                            <FieldContent>
                              <div className="flex flex-col gap-3">
                                <Select
                                  value={settings.model || undefined}
                                  onValueChange={(value) => onSettingsChange({ ...settings, model: value })}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder={modelOptions.length > 0 ? '从模型列表中选择' : '先拉取模型列表'} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      {modelOptions.map((model) => (
                                        <SelectItem key={model.id} value={model.id}>
                                          {model.label}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                                <Input
                                  value={settings.model}
                                  onChange={(event) => onSettingsChange({ ...settings, model: event.target.value })}
                                  placeholder="也可以手动输入模型 ID"
                                />
                              </div>
                            </FieldContent>
                          </Field>

                          <Field>
                            <FieldLabel>提示策略</FieldLabel>
                            <FieldContent>
                              <ToggleGroup
                                type="single"
                                value={settings.prompt_preset}
                                onValueChange={(value) =>
                                  value && onSettingsChange({ ...settings, prompt_preset: value as PromptPreset })
                                }
                                className="justify-start"
                              >
                                {(['anki_focus', 'concept_map', 'formula_focus', 'custom'] as const).map((presetId) => (
                                  <Tooltip key={presetId}>
                                    <TooltipTrigger asChild>
                                      <ToggleGroupItem value={presetId}>
                                        {promptPresetLabels[presetId]}
                                      </ToggleGroupItem>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-lg whitespace-pre-wrap text-left">
                                      {promptPresetMap.get(presetId)?.prompt_preview || '暂无提示词预览'}
                                    </TooltipContent>
                                  </Tooltip>
                                ))}
                              </ToggleGroup>
                              <FieldDescription>把鼠标停在任意策略上，可以看到系统实际会拼进去的详细提示内容。</FieldDescription>
                            </FieldContent>
                          </Field>

                          <Field>
                            <FieldLabel>自定义提示词</FieldLabel>
                            <FieldContent>
                              <Textarea
                                value={settings.custom_prompt}
                                onChange={(event) => onSettingsChange({ ...settings, custom_prompt: event.target.value })}
                                placeholder="例如：优先遮挡定义中的术语和结论句，不要遮挡整段解释。"
                                className="min-h-28"
                                disabled={settings.prompt_preset !== 'custom'}
                              />
                              <FieldDescription>
                                只有在选择“自定义”时才会启用；其他模式会使用预设的提示策略。
                              </FieldDescription>
                            </FieldContent>
                          </Field>

                          <Field>
                            <FieldLabel>超时 / 输出上限 / 批量 / 请求体预算</FieldLabel>
                            <FieldContent className="grid gap-3 md:grid-cols-4">
                              <div className="flex flex-col gap-2">
                                <Input
                                  type="number"
                                  value={String(settings.timeout_ms)}
                                  onChange={(event) =>
                                    onSettingsChange({ ...settings, timeout_ms: Number(event.target.value) || 0 })
                                  }
                                />
                                <FieldDescription>单位毫秒。图像请求默认建议至少 120000。</FieldDescription>
                              </div>
                              <div className="flex flex-col gap-2">
                                <Input
                                  type="number"
                                  value={String(settings.max_output_tokens)}
                                  onChange={(event) =>
                                    onSettingsChange({ ...settings, max_output_tokens: Number(event.target.value) || 0 })
                                  }
                                />
                                <FieldDescription>限制模型最多能回多少内容。图像结构化结果建议至少 4096。</FieldDescription>
                              </div>
                              <div className="flex flex-col gap-2">
                                <Input
                                  type="number"
                                  value={String(settings.batch_size_default)}
                                  onChange={(event) =>
                                    onSettingsChange({ ...settings, batch_size_default: Number(event.target.value) || 1 })
                                  }
                                />
                                <FieldDescription>第二阶段会优先按这个批量把多张图打包到同一个请求里。</FieldDescription>
                              </div>
                              <div className="flex flex-col gap-2">
                                <Input
                                  type="number"
                                  value={String(settings.request_token_limit)}
                                  onChange={(event) =>
                                    onSettingsChange({ ...settings, request_token_limit: Number(event.target.value) || 0 })
                                  }
                                />
                                <FieldDescription>这是按整段请求体做的近似预算。若预计超出上限，系统会自动缩小本批数量。</FieldDescription>
                              </div>
                            </FieldContent>
                          </Field>
                        </FieldGroup>
                      )}

                      {settings && !settings.enabled && (
                        <Alert>
                          <AlertTitle>当前没有启用模型</AlertTitle>
                          <AlertDescription>
                            现在即使点击“运行当前 LLM”或“批量 LLM”，也不会真正把内容发给模型。
                          </AlertDescription>
                        </Alert>
                      )}

                      {modelError && (
                        <Alert>
                          <AlertTitle>模型列表获取失败</AlertTitle>
                          <AlertDescription>{modelError}</AlertDescription>
                        </Alert>
                      )}

                      {connectionTestResult && (
                        <Alert className={connectionTestResult.ok ? 'border-emerald-300/50 bg-emerald-50/70' : undefined}>
                          <AlertTitle>连接测试结果</AlertTitle>
                          <AlertDescription>
                            {connectionTestResult.message}
                            <div className="mt-2 text-sm text-muted-foreground">
                              共返回 {connectionTestResult.model_count} 个模型
                              {settings?.model ? `，当前模型${connectionTestResult.model_found ? '已命中' : '未命中'}` : ''}
                            </div>
                          </AlertDescription>
                        </Alert>
                      )}

                      {routingSettings && (
                        <Card className="border-border/60 bg-muted/20 shadow-none">
                          <CardHeader>
                            <CardTitle>扫描后送去哪里</CardTitle>
                            <CardDescription>这里不再展开复杂规则，只保留最直白的两种方式。</CardDescription>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-4">
                            <ToggleGroup
                              type="single"
                              value={routingSettings.mode}
                              onValueChange={(value) =>
                                value && onRoutingSettingsChange({ ...routingSettings, mode: value as RoutingSettings['mode'] })
                              }
                              className="justify-start"
                            >
                              <ToggleGroupItem value="folder_name">按同名文件夹</ToggleGroupItem>
                              <ToggleGroupItem value="semantic">让模型决定</ToggleGroupItem>
                            </ToggleGroup>
                            <div className="text-sm text-muted-foreground">
                              {routingSettings.mode === 'folder_name'
                                ? '默认按文件夹同名匹配 deck；如果不存在，导入时自动创建。'
                                : '会先参考 OCR、图片内容和本地已有 deck，再让模型给出最合适的归档建议，并尽量避免重复命名。'}
                            </div>
                            <div className="rounded-2xl border border-border/60 bg-background/80 p-3 text-sm text-muted-foreground">
                              只有切到“让模型决定”并重新运行第一阶段后，第一道审核里的 deck 才会由大模型预填。
                            </div>
                              {routingSettings.mode === 'semantic' && (
                                <FieldGroup>
                                  <Field>
                                    <FieldLabel>最多几层</FieldLabel>
                                  <FieldContent>
                                    <Input
                                      type="number"
                                      value={String(routingSettings.semantic_max_depth)}
                                      onChange={(event) =>
                                        onRoutingSettingsChange({
                                          ...routingSettings,
                                          semantic_max_depth: Number(event.target.value) || routingSettings.semantic_max_depth,
                                        })
                                      }
                                    />
                                      <FieldDescription>
                                        例如 3 代表最多像 `Calculus::Chapter3::Extrema` 这样三级。模型新建 deck 时会尽量遵守这个层级。
                                      </FieldDescription>
                                    </FieldContent>
                                  </Field>
                                  <Field>
                                    <FieldLabel>单次归档最多几张</FieldLabel>
                                    <FieldContent>
                                      <Input
                                        type="number"
                                        value={String(routingSettings.semantic_batch_size)}
                                        onChange={(event) =>
                                          onRoutingSettingsChange({
                                            ...routingSettings,
                                            semantic_batch_size:
                                              Number(event.target.value) || routingSettings.semantic_batch_size,
                                          })
                                        }
                                      />
                                      <FieldDescription>
                                        归档时会优先按这个批量把多张图打包到一个请求里，再逐批返回结果。
                                      </FieldDescription>
                                    </FieldContent>
                                  </Field>
                                  <Field>
                                    <FieldLabel>请求体预算上限</FieldLabel>
                                    <FieldContent>
                                      <Input
                                        type="number"
                                        value={String(routingSettings.semantic_request_token_limit)}
                                        onChange={(event) =>
                                          onRoutingSettingsChange({
                                            ...routingSettings,
                                            semantic_request_token_limit:
                                              Number(event.target.value) || routingSettings.semantic_request_token_limit,
                                          })
                                        }
                                      />
                                      <FieldDescription>
                                        这是按整段请求体做的近似预算。若预计超出上限，系统会自动缩小本批数量，直到落回安全范围。
                                      </FieldDescription>
                                    </FieldContent>
                                  </Field>
                                </FieldGroup>
                              )}
                            <Button variant="outline" onClick={onSaveRoutingSettings}>
                              {loadingKey === 'save-routing-settings' ? <Spinner data-icon="inline-start" /> : <FolderTreeIcon data-icon="inline-start" />}
                              保存送去哪里方式
                            </Button>
                          </CardContent>
                        </Card>
                      )}

                      <Button className="w-full" onClick={onSaveSettings} disabled={!settings}>
                        {loadingKey === 'save-settings' ? <Spinner data-icon="inline-start" /> : <BotIcon data-icon="inline-start" />}
                        保存模型与提示设置
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="image" className="mt-0 flex flex-col gap-4">
                  <Alert>
                    <AlertTitle>发送给模型前先做图像处理</AlertTitle>
                    <AlertDescription>
                      这里专门解决“图片太大，模型吃不动”的问题。默认会在发送前压缩成 WebP，下面的预览会直接展示实际请求里将要发送的那张图。
                    </AlertDescription>
                  </Alert>

                  <Card className="border-border/70 bg-background/85">
                    <CardHeader>
                      <CardTitle>上传前图像压缩</CardTitle>
                      <CardDescription>这个设置只影响发给模型的图像，不会改动你的原图，也不会影响最终导入 Anki 的成品图片。</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      {imageSettings && (
                        <FieldGroup>
                          <Field>
                            <FieldLabel>自动压缩</FieldLabel>
                            <FieldContent>
                              <div className="flex items-center gap-3">
                                <Toggle
                                  variant="outline"
                                  pressed={imageSettings.llm_image_compress_enabled}
                                  onPressedChange={(pressed) =>
                                    onImageSettingsChange({
                                      ...imageSettings,
                                      llm_image_compress_enabled: pressed,
                                    })
                                  }
                                >
                                  {imageSettings.llm_image_compress_enabled ? '已开启' : '已关闭'}
                                </Toggle>
                                <div className="text-sm text-muted-foreground">默认建议保持开启。</div>
                              </div>
                            </FieldContent>
                          </Field>

                          <Field>
                            <FieldLabel>压缩格式</FieldLabel>
                            <FieldContent>
                              <Input value={imageSettings.llm_image_format.toUpperCase()} disabled />
                              <FieldDescription>当前固定使用 WebP，后续如果要扩展其他格式，也会继续放在这里。</FieldDescription>
                            </FieldContent>
                          </Field>

                          <Field>
                            <FieldLabel>压缩质量</FieldLabel>
                            <FieldContent>
                              <Input
                                type="number"
                                value={String(imageSettings.llm_image_quality)}
                                onChange={(event) => {
                                  if (!event.target.value.trim()) {
                                    return
                                  }
                                  const nextQuality = Number(event.target.value)
                                  onImageSettingsChange({
                                    ...imageSettings,
                                    llm_image_quality: Number.isFinite(nextQuality) ? nextQuality : imageSettings.llm_image_quality,
                                  })
                                }}
                              />
                              <FieldDescription>这里不再强行限制范围。你可以按自己的模型和图片特点自由调整。</FieldDescription>
                            </FieldContent>
                          </Field>
                        </FieldGroup>
                      )}

                      {selectedItem && (
                        <Card className="border-border/60 bg-muted/20 shadow-none">
                          <CardHeader>
                            <CardTitle>当前请求图像预览</CardTitle>
                            <CardDescription>如果你现在点击“运行当前 LLM”，请求里发送出去的就是下面这张图，而不是原图。</CardDescription>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-4">
                            {previewLoading ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Spinner />
                                正在生成压缩预览...
                              </div>
                            ) : previewError ? (
                              <Alert>
                                <AlertTitle>预览生成失败</AlertTitle>
                                <AlertDescription>{previewError}</AlertDescription>
                              </Alert>
                            ) : preview ? (
                              <>
                                <div className="flex flex-wrap gap-2">
                                  <Badge variant="secondary">
                                    {preview.using_compressed_image ? `请求使用 ${preview.format.toUpperCase()} 压缩图` : '请求直接发送 PNG'}
                                  </Badge>
                                  <Badge variant="outline">请求大小 {formatBytes(preview.byte_size)}</Badge>
                                  <Badge variant="outline">原图大小 {formatBytes(preview.original_byte_size)}</Badge>
                                  <Badge variant="outline">{preview.width} x {preview.height}</Badge>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setPreviewOpen(true)}
                                  className="overflow-hidden rounded-2xl border border-border/60 bg-background text-left transition hover:border-primary/40"
                                >
                                  <img
                                    src={preview.preview_data_url}
                                    alt="当前请求图像预览"
                                    className="aspect-[4/3] w-full object-contain bg-muted/30"
                                  />
                                  <div className="flex items-center justify-between gap-3 border-t border-border/60 px-3 py-2 text-sm text-muted-foreground">
                                    <span>点击放大查看压缩后的发送图像</span>
                                    <ZoomInIcon className="size-4" />
                                  </div>
                                </button>

                                <div className="text-sm text-muted-foreground">
                                  日志里的 request 也会记录这张图的类型和大小，方便你核对真正发给模型的内容。
                                </div>
                              </>
                            ) : (
                              <div className="text-sm text-muted-foreground">还没有可预览的图片。</div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      <Button className="w-full" onClick={onSaveImageSettings} disabled={!imageSettings}>
                        {loadingKey === 'save-image-settings' ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
                        保存图像处理设置
                      </Button>
                    </CardContent>
                  </Card>

                  {preview && (
                    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                      <DialogContent className="sm:max-w-5xl">
                        <DialogHeader>
                          <DialogTitle>当前请求图像预览</DialogTitle>
                          <DialogDescription>
                            这里展示的是发送给模型的压缩版本，方便你放大确认细节有没有被压坏。
                          </DialogDescription>
                        </DialogHeader>
                        <div className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20">
                          <img
                            src={preview.preview_data_url}
                            alt="当前请求图像放大预览"
                            className="max-h-[75vh] w-full object-contain"
                          />
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </TabsContent>
              </ScrollArea>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </Tabs>
    </motion.div>
  )
}
