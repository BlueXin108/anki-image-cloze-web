import { motion } from 'framer-motion'
import {
  BotIcon,
  FolderOpenIcon,
  ImportIcon,
  LogsIcon,
  RefreshCcwIcon,
  Settings2Icon,
  SparklesIcon,
  XCircleIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { AnalysisLogFloat, type AnalysisLogEntry } from '@/components/workbench/analysis-log-float'
import { DeckPicker } from '@/components/workbench/deck-picker'
import { DirectoryBrowserDialog } from '@/components/workbench/directory-browser-dialog'
import { DraftList } from '@/components/workbench/draft-list-compact'
import { ImportQueueDialog, type ImportQueueItemView } from '@/components/workbench/import-queue-dialog'
import { ManualDraftList } from '@/components/workbench/manual-draft-list'
import { ManualRightPanel } from '@/components/workbench/manual-right-panel'
import { ManualWorkspace } from '@/components/workbench/manual-workspace'
import { ReviewWorkspace } from '@/components/workbench/review-workspace'
import { RightPanel } from '@/components/workbench/right-panel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import type {
  AnalysisMode,
  CardDraft,
  DirectoryListResponse,
  DraftListItem,
  DraftStatus,
  ImageProcessingSettings,
  LLMModelRecord,
  LLMSettings,
  ModelConnectionTestResponse,
  PromptPresetRecord,
  RoutingSettings,
  ScanFolderResponse,
  WorkspaceMode,
} from '@/types'

const LAYOUT_TRANSITION = {
  duration: 0.55,
  ease: [0.16, 1, 0.3, 1] as const,
}

const WORKSPACE_MODE_STORAGE_KEY = 'anki-cloze:workspace-mode'

const statusVariant: Record<DraftStatus, 'secondary' | 'outline' | 'default' | 'destructive'> = {
  route_review: 'secondary',
  route_ready: 'outline',
  llm_review: 'secondary',
  approved: 'default',
  blocked: 'destructive',
  imported: 'outline',
}

const statusLabel: Record<DraftStatus, string> = {
  route_review: '待确认归档',
  route_ready: '待进入挖空',
  llm_review: '待确认结果',
  approved: '已批准',
  blocked: '已拦下',
  imported: '已导入',
}

function parseTagInput(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function describeUiError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return fallback
}

function replaceDraft(items: DraftListItem[], draft: CardDraft): DraftListItem[] {
  return items.map((item) => (item.draft.id === draft.id ? { ...item, draft } : item))
}

function queueLabel(item: DraftListItem): string {
  return item.image.folder_path || item.image.source_path
}

function inferScanRootPath(item: DraftListItem): string {
  const sourceParts = item.image.source_path.split(/[\\/]+/).filter(Boolean)
  sourceParts.pop()
  const relativeParts = item.image.folder_path.split(/[\\/]+/).filter(Boolean)
  for (let index = 0; index < relativeParts.length; index += 1) {
    sourceParts.pop()
  }
  return item.image.source_path.startsWith('\\\\')
    ? `\\\\${sourceParts.join('\\')}`
    : sourceParts.join('\\')
}

function normalizeFolderPath(value: string): string {
  return value.trim().replace(/[\\/]+$/, '').toLowerCase()
}

export default function App() {
  const [draftItems, setDraftItems] = useState<DraftListItem[]>([])
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [folderInput, setFolderInput] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem('anki-cloze:last-scan-path') || ''
  })
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [settings, setSettings] = useState<LLMSettings | null>(null)
  const [routingSettings, setRoutingSettings] = useState<RoutingSettings | null>(null)
  const [imageSettings, setImageSettings] = useState<ImageProcessingSettings | null>(null)
  const [settingsApiKey, setSettingsApiKey] = useState('')
  const [selectedTab, setSelectedTab] = useState('suggestions')
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() => {
    if (typeof window === 'undefined') return 'pipeline'
    const savedMode = window.localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY)
    return savedMode === 'manual' || savedMode === 'pipeline' ? savedMode : 'pipeline'
  })
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('hybrid')
  const [lastScanSummary, setLastScanSummary] = useState<Pick<ScanFolderResponse, 'scanned_count' | 'matched_count' | 'blocked_count'> | null>(null)
  const [directoryDialogOpen, setDirectoryDialogOpen] = useState(false)
  const [directoryState, setDirectoryState] = useState<DirectoryListResponse | null>(null)
  const [directoryLoading, setDirectoryLoading] = useState(false)
  const [modelOptions, setModelOptions] = useState<LLMModelRecord[]>([])
  const [deckOptions, setDeckOptions] = useState<string[]>([])
  const [promptPresets, setPromptPresets] = useState<PromptPresetRecord[]>([])
  const [modelLoading, setModelLoading] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  const [connectionTestResult, setConnectionTestResult] = useState<ModelConnectionTestResponse | null>(null)
  const [importQueueOpen, setImportQueueOpen] = useState(false)
  const [importQueueItems, setImportQueueItems] = useState<ImportQueueItemView[]>([])
  const [importRunning, setImportRunning] = useState(false)
  const [queueTitle, setQueueTitle] = useState('导出队列')
  const [queueDescription, setQueueDescription] = useState('这里会实时显示每一张卡片的导出进度，而不是等全部结束后才告诉你结果。')
  const [queueRunningText, setQueueRunningText] = useState('导出仍在进行中，请保持窗口打开。')
  const [queueFinishedText, setQueueFinishedText] = useState('本轮导出已经结束。')
  const [analysisLogOpen, setAnalysisLogOpen] = useState(false)
  const [analysisLogs, setAnalysisLogs] = useState<AnalysisLogEntry[]>([])
  const [draftDeckInput, setDraftDeckInput] = useState('')
  const [draftTagsInput, setDraftTagsInput] = useState('')
  const importQueueRef = useRef<ImportQueueItemView[]>([])
  const renderInFlightRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    window.localStorage.setItem(WORKSPACE_MODE_STORAGE_KEY, workspaceMode)
  }, [workspaceMode])

  const selectedItem = useMemo(
    () => draftItems.find((item) => item.draft.id === selectedDraftId) ?? draftItems[0] ?? null,
    [draftItems, selectedDraftId],
  )

  const overview = useMemo(() => {
    const activeItems = draftItems.filter((item) => !item.image.ignored)
    const routeReview = activeItems.filter((item) => item.draft.review_status === 'route_review').length
    const routeReady = activeItems.filter((item) => item.draft.review_status === 'route_ready').length
    const llmReview = activeItems.filter((item) => item.draft.review_status === 'llm_review').length
    const approved = activeItems.filter((item) => item.draft.review_status === 'approved').length
    const blocked = activeItems.filter((item) => item.draft.review_status === 'blocked').length
    const imported = activeItems.filter((item) => item.draft.review_status === 'imported').length
    const needsRoute = activeItems.filter((item) => !item.draft.deck).length

    return {
      total: activeItems.length,
      routeReview,
      routeReady,
      llmReview,
      approved,
      blocked,
      imported,
      needsRoute,
      ignored: draftItems.filter((item) => item.image.ignored).length,
    }
  }, [draftItems])

  const workflowHint = useMemo(() => {
    if (overview.total === 0) {
      return '先选择一个目录并运行流水线第一阶段，系统会先扫图、做 OCR，并把每张图准备到归档审核。'
    }
    if (overview.needsRoute > 0) {
      return `还有 ${overview.needsRoute} 项没有目标 deck，先在归档审核里补齐后再继续。`
    }
    if (overview.routeReview > 0) {
      return `还有 ${overview.routeReview} 项等待归档确认，先决定这些图该送去哪里。`
    }
    if (overview.routeReady > 0) {
      return `已有 ${overview.routeReady} 项通过归档确认，可以继续运行第二阶段做挖空。`
    }
    if (overview.llmReview > 0) {
      return `还有 ${overview.llmReview} 项等待结果确认，下一步重点应放在遮罩微调和最终批准。`
    }
    if (overview.approved > 0) {
      return `已有 ${overview.approved} 项通过最终审核，可以直接进入导出阶段。`
    }
    if (overview.imported > 0) {
      return '最近一批导入已经完成，随时可以继续扫描新的目录。'
    }
    return '当前队列已同步，可以继续对任意草稿做复核或再次运行流水线。'
  }, [overview])

  const refreshAll = async () => {
    const [drafts, llmSettings, routingMode, imageProcessingSettings, promptPresetResponse, deckResponse] = await Promise.all([
      api.getDrafts(),
      api.getLlmSettings(),
      api.getRoutingSettings(),
      api.getImageProcessingSettings(),
      api.getPromptPresets(),
      api.getDecks().catch(() => ({ items: [] })),
    ])
    setDraftItems(drafts.items)
    setSelectedDraftId((current) => current ?? drafts.items[0]?.draft.id ?? null)
    setSettings(llmSettings)
    setRoutingSettings(routingMode)
    setImageSettings(imageProcessingSettings)
    setPromptPresets(promptPresetResponse.items)
    setDeckOptions(deckResponse.items)
    const derivedMode: AnalysisMode = llmSettings.send_image_default ? 'hybrid' : 'ocr_only'
    setAnalysisMode(derivedMode)
  }

  const appendLog = (
    channel: AnalysisLogEntry['channel'],
    title: string,
    detail: string,
    options?: {
      body?: string | null
      requestBody?: string | null
      responseBody?: string | null
      targets?: string[]
      tone?: AnalysisLogEntry['tone']
    },
  ) => {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setAnalysisLogs((current) => [
      {
        id: crypto.randomUUID(),
        time: timestamp,
        channel,
        title,
        detail,
        body: options?.body,
        requestBody: options?.requestBody,
        responseBody: options?.responseBody,
        targets: options?.targets,
        tone: options?.tone ?? 'info',
      },
      ...current,
    ].slice(0, 80))
  }

  useEffect(() => {
    void refreshAll().catch((error) => {
      toast.error('后端暂时不可达', {
        description: error instanceof Error ? error.message : '请确认后端服务已启动。',
      })
    })
  }, [])

  useEffect(() => {
    if (!selectedItem) return
    const hasAnalysisArtifacts =
      !!selectedItem.draft.crop ||
      selectedItem.draft.masks.length > 0 ||
      selectedItem.draft.ocr_regions.length > 0 ||
      !!selectedItem.draft.llm_summary ||
      !!selectedItem.draft.llm_observed_text
    if (!hasAnalysisArtifacts) return
    if (selectedItem.draft.front_image_url && selectedItem.draft.back_image_url) return
    void requestRender(selectedItem.draft.id, { silent: true })
  }, [
    selectedItem?.draft.id,
    selectedItem?.draft.crop,
    selectedItem?.draft.masks.length,
    selectedItem?.draft.ocr_regions.length,
    selectedItem?.draft.llm_summary,
    selectedItem?.draft.llm_observed_text,
    selectedItem?.draft.front_image_url,
    selectedItem?.draft.back_image_url,
  ])

  useEffect(() => {
    if (!selectedItem) {
      setDraftDeckInput('')
      setDraftTagsInput('')
      return
    }
    setDraftDeckInput(selectedItem.draft.deck ?? '')
    setDraftTagsInput(selectedItem.draft.tags.join(', '))
  }, [selectedItem?.draft.id, selectedItem?.draft.deck, selectedItem?.draft.tags])

  useEffect(() => {
    if (selectedTab === 'rules') {
      setSelectedTab('settings')
    }
  }, [selectedTab])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (folderInput.trim()) {
      window.localStorage.setItem('anki-cloze:last-scan-path', folderInput.trim())
    }
  }, [folderInput])

  const run = async (key: string, action: () => Promise<void>) => {
    setLoadingKey(key)
    try {
      await action()
    } finally {
      setLoadingKey((current) => (current === key ? null : current))
    }
  }

  const loadDirectoryBrowser = async (path?: string) => {
    setDirectoryLoading(true)
    try {
      const result = await api.listDirectory(path || folderInput || undefined)
      setDirectoryState(result)
      setFolderInput(result.current_path)
    } finally {
      setDirectoryLoading(false)
    }
  }

  const openNativeDirectoryPicker = async () => {
    let pickedPath: string | null = null
    try {
      const result = await api.pickFolder(folderInput || undefined)
      if (!result.path) {
        setDirectoryDialogOpen(true)
        await loadDirectoryBrowser(folderInput || undefined)
        return
      }
      pickedPath = result.path
    } catch (error) {
      setDirectoryDialogOpen(true)
      try {
        await loadDirectoryBrowser(folderInput || undefined)
      } catch {
        // Keep the fallback dialog open even if the browser list also fails.
      }
      toast.error('系统目录选择器暂时不可用', {
        description: `${describeUiError(error, '无法打开系统目录选择器。')} 已回退到内置目录浏览。`,
      })
      return
    }

    try {
      await switchWorkspaceFolder(pickedPath, '系统目录选择器')
      await loadDirectoryBrowser(pickedPath)
      toast.success('已通过系统目录选择器定位', {
        description: pickedPath,
      })
    } catch (error) {
      setFolderInput(pickedPath)
      toast.error('目录已选中，但第一阶段启动失败', {
        description: describeUiError(error, '请稍后重试。'),
      })
    }
  }

  const fetchModels = async () => {
    if (!settings) return
    setModelLoading(true)
    setModelError(null)
    appendLog('system', '拉取模型列表', `正在从 ${settings.base_url} 获取模型列表。`)
    try {
      const result = await api.getLlmModels({
        baseUrl: settings.base_url,
        apiKey: settingsApiKey || undefined,
      })
      setModelOptions(result.items)
      appendLog('system', '模型列表已更新', `共获取到 ${result.items.length} 个模型。`, { tone: 'success' })
      toast.success(`已获取 ${result.items.length} 个模型`, {
        description: result.items.length > 0 ? result.items[0].label : '当前地址没有返回模型。',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '拉取模型失败。'
      setModelError(message)
      appendLog('system', '模型列表获取失败', message, { tone: 'error' })
      toast.error('模型列表获取失败', { description: message })
    } finally {
      setModelLoading(false)
    }
  }

  const testConnection = async () => {
    if (!settings) return
    appendLog('system', '测试模型连接', `正在测试 ${settings.base_url}，目标模型：${settings.model || '未填写'}`)
    const result = await api.testLlmConnection({
      baseUrl: settings.base_url,
      apiKey: settingsApiKey || undefined,
      model: settings.model || undefined,
    })
    setConnectionTestResult(result)
    appendLog('system', '连接测试结果', result.message, { tone: result.ok ? 'success' : 'error' })
    return result
  }

  const describeLlmDelivery = () => {
    if (analysisMode === 'ocr_only') {
      return '本次不发送图像；附带 OCR 文本'
    }
    if (imageSettings?.llm_image_compress_enabled) {
      return `图像以内联 ${imageSettings.llm_image_format.toUpperCase()} data URL 发送，质量 ${imageSettings.llm_image_quality}；附带 OCR 文本`
    }
    return '图像以内联 PNG data URL 发送；附带 OCR 文本'
  }

  const logOcrResults = (items: DraftListItem[]) => {
    setAnalysisLogOpen(true)
    items.forEach((item) => {
      const body = item.draft.ocr_text || 'OCR 没有返回可用文字。'
      const isRealText =
        !!item.draft.ocr_text &&
        !item.draft.ocr_text.includes('没有安装可用的 OCR 引擎') &&
        !item.draft.ocr_text.includes('没有真正识别出正文') &&
        !item.draft.ocr_text.includes('没有识别出可用文字内容')
      appendLog('ocr', `OCR 回读: ${queueLabel(item)}`, '已记录本次识别全文。', {
        body,
        requestBody: item.draft.ocr_request_log || null,
        responseBody: item.draft.ocr_response_log || null,
        tone: isRealText ? 'success' : 'error',
      })
    })
  }

  const logRoutingResults = (items: DraftListItem[]) => {
    setAnalysisLogOpen(true)
    items.forEach((item) => {
      appendLog('routing', `归档判断: ${queueLabel(item)}`, item.draft.deck ? `建议送去 ${item.draft.deck}` : '当前还没有命中目标 deck。', {
        body: item.draft.route_reason || '当前没有额外的归档说明。',
        requestBody: item.draft.route_request_log || null,
        responseBody: item.draft.route_response_log || null,
        tone: item.draft.deck ? 'success' : 'error',
      })
    })
  }

  const logLlmResults = (items: DraftListItem[]) => {
    setAnalysisLogOpen(true)
    const delivery = describeLlmDelivery()
    items.forEach((item) => {
      const configWarning = item.draft.llm_warnings.find((warning) => warning.includes('LLM'))
      if (configWarning) {
        appendLog('llm', `LLM 未执行: ${queueLabel(item)}`, configWarning, {
          body: item.draft.llm_warnings.join('\n'),
          requestBody: item.draft.llm_request_log || null,
          responseBody: item.draft.llm_response_log || null,
          tone: 'error',
        })
        return
      }

      appendLog('llm', `LLM 回调: ${queueLabel(item)}`, `${delivery}。当前返回 ${item.draft.masks.length} 个遮罩。`, {
        body: item.draft.llm_observed_text || item.draft.llm_summary || '模型没有返回可验证的回读文字。',
        requestBody: item.draft.llm_request_log || null,
        responseBody: item.draft.llm_response_log || null,
        targets: item.draft.llm_cloze_targets,
        tone: item.draft.llm_observed_text || item.draft.llm_cloze_targets.length > 0 ? 'success' : 'error',
      })
    })
  }

  const toggleIgnoredImages = async (imageIdsToToggle: string[], ignored: boolean) => {
    const result = await api.patchIgnoredImages(imageIdsToToggle, ignored)
    setDraftItems(result.items)
    setSelectedDraftId((current) => {
      if (!current) return result.items[0]?.draft.id ?? null
      const stillExists = result.items.some((item) => item.draft.id === current)
      return stillExists ? current : result.items[0]?.draft.id ?? null
    })
    appendLog(
      'system',
      ignored ? '已忽略图片' : '已恢复图片',
      `本次${ignored ? '忽略' : '恢复'} ${imageIdsToToggle.length} 项。`,
      { tone: 'success' },
    )
  }

  const setQueueState = (updater: ImportQueueItemView[] | ((current: ImportQueueItemView[]) => ImportQueueItemView[])) => {
    const current = importQueueRef.current
    const next = typeof updater === 'function' ? updater(current) : updater
    importQueueRef.current = next
    setImportQueueItems(next)
  }

  const openProcessingQueue = (options: {
    title: string
    description: string
    runningText: string
    finishedText: string
    items: ImportQueueItemView[]
  }) => {
    setQueueTitle(options.title)
    setQueueDescription(options.description)
    setQueueRunningText(options.runningText)
    setQueueFinishedText(options.finishedText)
    setImportQueueOpen(true)
    setImportRunning(true)
    importQueueRef.current = options.items
    setQueueState(options.items)
  }

  const requestRender = async (draftId: string, options?: { silent?: boolean }) => {
    if (renderInFlightRef.current.has(draftId)) {
      return null
    }
    renderInFlightRef.current.add(draftId)
    try {
      const result = await api.renderDraft(draftId)
      setDraftItems((current) => replaceDraft(current, result.draft))
      if (!options?.silent) {
        toast.success('预览已更新', {
          description: '当前 Front / Back 预览已经重新生成。',
        })
      }
      return result.draft
    } catch (error) {
      const message = error instanceof Error ? error.message : '渲染失败'
      if (!options?.silent) {
        toast.error('渲染失败', { description: message })
      }
      appendLog('system', '渲染失败', message, { tone: 'error' })
      return null
    } finally {
      renderInFlightRef.current.delete(draftId)
    }
  }

  const commitMasks = async (masks: CardDraft['masks']) => {
    if (!selectedItem) return
    const nextDraft = await api.patchMasks(selectedItem.draft.id, masks)
    setDraftItems((current) => replaceDraft(current, nextDraft))
    await requestRender(nextDraft.id, { silent: true })
  }

  const commitCrop = async (bbox: [number, number, number, number]) => {
    if (!selectedItem) return
    const nextDraft = await api.patchCrop(selectedItem.draft.id, bbox)
    setDraftItems((current) => replaceDraft(current, nextDraft))
    await requestRender(nextDraft.id, { silent: true })
  }

  const patchDraft = async (payload: {
    reviewStatus?: DraftStatus
    deck?: string | null
    tags?: string[]
    routeReason?: string | null
  }) => {
    if (!selectedItem) return
    const nextDraft = await api.patchDraft({
      draftId: selectedItem.draft.id,
      reviewStatus: payload.reviewStatus,
      deck: payload.deck,
      tags: payload.tags,
      routeReason: payload.routeReason,
    })
    setDraftItems((current) => replaceDraft(current, nextDraft))
    return nextDraft
  }

  const clearLocalWorkspaceState = () => {
    setDraftItems([])
    setSelectedDraftId(null)
    setLastScanSummary(null)
    setImportQueueOpen(false)
    setImportRunning(false)
    setImportQueueItems([])
    importQueueRef.current = []
    setDraftDeckInput('')
    setDraftTagsInput('')
    setAnalysisLogs([])
    setAnalysisLogOpen(false)
  }

  const runStageOneForPath = async (path: string, options?: { sourceLabel?: string; showCompletionToast?: boolean }) => {
    const result = await api.scanFolder(path)
    setDraftItems(result.items)
    setSelectedDraftId(result.items[0]?.draft.id ?? null)
    setLastScanSummary({
      scanned_count: result.scanned_count,
      matched_count: result.matched_count,
      blocked_count: result.blocked_count,
    })
    appendLog('system', '第一阶段开始', routingSettings?.mode === 'semantic'
      ? '已完成扫描，接下来会自动逐张执行 OCR，并在 OCR 后让大模型决定该送去哪里。'
      : '已完成扫描，接下来会自动逐张执行 OCR；当前不会让大模型填 deck，而是按文件夹同名填写。', {
      tone: 'success',
    })
    const activeItems = result.items.filter((item) => !item.image.ignored)
    const ocrItems = await runOcrQueue(activeItems)
    if (routingSettings?.mode === 'semantic') {
      const routeTargets = ocrItems.filter((item) => !item.image.ignored && item.draft.review_status === 'route_review')
      await runRouteQueue(routeTargets)
    } else {
      logRoutingResults(activeItems)
    }
    if (options?.showCompletionToast !== false) {
      toast.success('第一阶段已完成', {
        description: '扫描、OCR 和归档准备已完成，现在可以开始确认每张图要送去哪里。',
      })
    }
  }

  const switchWorkspaceFolder = async (nextPath: string, sourceLabel: string) => {
    const normalizedNextPath = nextPath.trim()
    if (!normalizedNextPath) return

    const currentWorkspacePath = folderInput.trim() || effectiveScanPath

    const pathChanged =
      !currentWorkspacePath || normalizeFolderPath(currentWorkspacePath) !== normalizeFolderPath(normalizedNextPath)

    if (pathChanged) {
      await api.resetWorkspace()
      clearLocalWorkspaceState()
      toast.warning('已切换文件夹并清空当前工作区', {
        description: `${sourceLabel} 已切到新目录，旧队列、日志和未保存输入已清除。当前目录：${normalizedNextPath}`,
      })
    }

    setFolderInput(normalizedNextPath)
    try {
      await runStageOneForPath(normalizedNextPath, { sourceLabel, showCompletionToast: true })
    } catch (error) {
      appendLog('system', '切换目录后启动失败', `已切到 ${normalizedNextPath}，但第一阶段没有成功启动。`, {
        body: describeUiError(error, '请稍后重试。'),
        tone: 'error',
      })
      throw error
    }
  }

  const setStatus = async (status: DraftStatus) => {
    await patchDraft({ reviewStatus: status })
  }

  const resetCurrentAnalysis = async () => {
    if (!selectedItem) return
    const nextDraft = await api.resetDraftAnalysis(selectedItem.draft.id)
    setDraftItems((current) => replaceDraft(current, nextDraft))
    appendLog('system', '已重置当前分析', `已清空 ${queueLabel(selectedItem)} 的 OCR、裁切、遮罩、LLM 与渲染结果。`, {
      tone: 'success',
    })
    toast.success('已重置当前分析', {
      description: '这张图的 OCR、遮罩、LLM 和预览都已清空。',
    })
  }

  const runSingleOcr = async () => {
    if (!selectedItem) return
    const result = await api.runOcr([selectedItem.image.id])
    setDraftItems(result.items)
    const updated = result.items.find((item) => item.image.id === selectedItem.image.id)
    if (updated) {
      logOcrResults([updated])
      toast.success('当前图片 OCR 已完成', {
        description: queueLabel(updated),
      })
    }
  }

  const runOcrQueue = async (targets: DraftListItem[]) => {
    if (targets.length === 0) return draftItems

    let latestItems = draftItems

    openProcessingQueue({
      title: 'OCR 队列',
      description: '这里会一张一张执行 OCR，识别完一张就立即返回结果和日志。',
      runningText: 'OCR 仍在进行中，当前会一张一张返回。',
      finishedText: '本轮 OCR 已结束。',
      items: targets.map((item) => ({
        draftId: item.image.id,
        label: queueLabel(item),
        status: 'pending',
        message: '等待识别',
      })),
    })

    for (const item of targets) {
      const stillQueued = importQueueRef.current.some((entry) => entry.draftId === item.image.id)
      if (!stillQueued) continue

      setQueueState((current) =>
        current.map((entry) =>
          entry.draftId === item.image.id
            ? { ...entry, status: 'running', message: '正在识别 OCR...' }
            : entry,
        ),
      )

      try {
        const result = await api.runOcr([item.image.id])
        setDraftItems(result.items)
        const updated = result.items.find((entry) => entry.image.id === item.image.id)
        if (updated) {
          logOcrResults([updated])
        }
        setQueueState((current) =>
          current.map((entry) =>
            entry.draftId === item.image.id
              ? {
                  ...entry,
                  status: 'success',
                  message: updated?.draft.ocr_text?.slice(0, 80) || 'OCR 已完成',
                }
              : entry,
          ),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'OCR 失败'
        setQueueState((current) =>
          current.map((entry) =>
            entry.draftId === item.image.id
              ? { ...entry, status: 'failed', message }
              : entry,
          ),
        )
        appendLog('ocr', `OCR 失败: ${queueLabel(item)}`, message, { tone: 'error' })
      }
    }

    setImportRunning(false)
    return latestItems
  }

  const runRouteQueue = async (targets: DraftListItem[]) => {
    if (targets.length === 0) return draftItems
    if (!routingSettings || routingSettings.mode !== 'semantic') return draftItems

    let latestItems = draftItems

    openProcessingQueue({
      title: '归档队列',
      description: '这里会按设置的批量执行语义归档，模型会结合 OCR、图片内容和本地已有 deck 给出建议。',
      runningText: '归档仍在进行中，当前会按批次请求、按结果更新。',
      finishedText: '本轮语义归档已结束。',
      items: targets.map((item) => ({
        draftId: item.draft.id,
        label: queueLabel(item),
        status: 'pending',
        message: '等待归档判断',
      })),
    })

    const configuredBatchSize = Math.max(1, routingSettings.semantic_batch_size || 1)
    let cursor = 0

    while (cursor < targets.length) {
      const chunkCandidates = targets.slice(cursor, cursor + configuredBatchSize)
      cursor += configuredBatchSize
      const chunk = chunkCandidates.filter((item) =>
        importQueueRef.current.some((entry) => entry.draftId === item.draft.id),
      )
      if (chunk.length === 0) continue

      const chunkIds = new Set(chunk.map((item) => item.draft.id))

      setQueueState((current) =>
        current.map((entry) =>
          chunkIds.has(entry.draftId)
            ? { ...entry, status: 'running', message: `正在批量判断归档（${chunk.length} 项）...` }
            : entry,
        ),
      )

      try {
        const result = await api.runRouteSuggestions({
          draftIds: chunk.map((item) => item.draft.id),
          analysisMode,
          includeImage: analysisMode !== 'ocr_only',
          includeOcr: true,
        })
        setDraftItems(result.items)
        const updatedItems = result.items.filter((entry) => chunkIds.has(entry.draft.id))
        if (updatedItems.length > 0) {
          logRoutingResults(updatedItems)
        }
        const updatedMap = new Map(updatedItems.map((entry) => [entry.draft.id, entry]))
        setQueueState((current) =>
          current.map((entry) => {
            if (!chunkIds.has(entry.draftId)) return entry
            const updated = updatedMap.get(entry.draftId)
            return {
              ...entry,
              status: updated?.draft.deck ? 'success' : 'failed',
              message: updated?.draft.deck
                ? `${updated.draft.deck}${updated.draft.tags.length > 0 ? ` | ${updated.draft.tags.join(', ')}` : ''}`
                : updated?.draft.route_reason || '归档建议为空',
            }
          }),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : '归档失败'
        setQueueState((current) =>
          current.map((entry) =>
            chunkIds.has(entry.draftId)
              ? { ...entry, status: 'failed', message }
              : entry,
          ),
        )
        chunk.forEach((item) => {
          appendLog('routing', `归档失败: ${queueLabel(item)}`, message, { tone: 'error' })
        })
      }
    }

    setImportRunning(false)
    return latestItems
  }

  const runLlmQueue = async (targets: DraftListItem[]) => {
    if (targets.length === 0) return
    if (!settings?.enabled) {
      appendLog('llm', 'LLM 未执行', '当前模型开关是关闭的，所以这次没有真正发到模型。', {
        tone: 'error',
      })
      setAnalysisLogOpen(true)
      toast.error('LLM 当前未启用', { description: '先到“模型与提示”里打开模型开关，再运行。' })
      return
    }

    const configuredBatchSize = Math.max(1, settings.batch_size_default || 1)

    openProcessingQueue({
      title: 'LLM 队列',
      description: '这里会优先按设置的批量把多张图打包到一个请求里；如果预计请求体过大，后端会自动缩小本批数量。',
      runningText: 'LLM 仍在进行中，当前会按批次请求、按结果更新。',
      finishedText: '本轮 LLM 处理已结束。',
      items: targets.map((item) => ({
        draftId: item.draft.id,
        label: queueLabel(item),
        status: 'pending',
        message: '等待 LLM 判断',
      })),
    })

    let cursor = 0

    while (cursor < targets.length) {
      const chunkCandidates = targets.slice(cursor, cursor + configuredBatchSize)
      cursor += configuredBatchSize
      const chunk = chunkCandidates.filter((item) =>
        importQueueRef.current.some((entry) => entry.draftId === item.draft.id),
      )
      if (chunk.length === 0) continue

      const chunkIds = new Set(chunk.map((item) => item.draft.id))

      setQueueState((current) =>
        current.map((entry) =>
          chunkIds.has(entry.draftId)
            ? { ...entry, status: 'running', message: `正在批量运行 LLM（${chunk.length} 项）...` }
            : entry,
        ),
      )

      try {
        const result = await api.runLlmSuggestions({
          draftIds: chunk.map((item) => item.draft.id),
          analysisMode,
          batchSize: chunk.length,
          includeImage: analysisMode !== 'ocr_only',
          includeOcr: true,
          promptPreset: settings?.prompt_preset,
          customPrompt: settings?.custom_prompt,
          maskDensity: settings?.mask_density,
        })
        setDraftItems(result.items)
        const updatedItems = result.items.filter((entry) => chunkIds.has(entry.draft.id))
        const finalizedItems: DraftListItem[] = []

        for (const updated of updatedItems) {
          let finalDraft = updated.draft
          const hasFailure = updated.draft.llm_warnings.some((warning) => warning.includes('LLM'))
          if (!hasFailure && updated.draft.review_status === 'route_ready') {
            const promoted = await api.patchDraft({
              draftId: updated.draft.id,
              reviewStatus: 'llm_review',
            })
            setDraftItems((current) => replaceDraft(current, promoted))
            finalDraft = promoted
          }
          finalizedItems.push({ ...updated, draft: finalDraft })
          if (!hasFailure) {
            await requestRender(finalDraft.id, { silent: true })
          }
        }

        if (finalizedItems.length > 0) {
          logLlmResults(finalizedItems)
        }

        const finalizedMap = new Map(finalizedItems.map((entry) => [entry.draft.id, entry]))
        setQueueState((current) =>
          current.map((entry) => {
            if (!chunkIds.has(entry.draftId)) return entry
            const updated = finalizedMap.get(entry.draftId)
            const failed = updated?.draft.llm_warnings.some((warning) => warning.includes('LLM')) ?? true
            return {
              ...entry,
              status: failed ? 'failed' : 'success',
              message: updated?.draft.llm_summary || updated?.draft.llm_warnings.join('；') || 'LLM 已完成',
            }
          }),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'LLM 失败'
        setQueueState((current) =>
          current.map((entry) =>
            chunkIds.has(entry.draftId)
              ? { ...entry, status: 'failed', message }
              : entry,
          ),
        )
        appendLog('llm', `LLM 失败（批量 ${chunk.length} 项）`, message, { tone: 'error' })
      }
    }

    setImportRunning(false)
  }

  const runImportQueue = async () => {
    const approvedItems = draftItems.filter((item) => !item.image.ignored && item.draft.review_status === 'approved')
    if (approvedItems.length === 0) return

    openProcessingQueue({
      title: '最终导出队列',
      description: '这里会把已经通过最终审核的项目依次送往 Anki，并实时显示每一项的结果。',
      runningText: '导出仍在进行中，请保持窗口打开。',
      finishedText: '本轮导出已经结束。',
      items: approvedItems.map((item) => ({
        draftId: item.draft.id,
        label: queueLabel(item),
        status: 'pending',
        message: item.draft.deck || '等待导出',
      })),
    })

    for (const item of approvedItems) {
      const stillQueued = importQueueRef.current.some((entry) => entry.draftId === item.draft.id)
      if (!stillQueued) {
        continue
      }

      setQueueState((current) =>
        current.map((entry) =>
          entry.draftId === item.draft.id
            ? { ...entry, status: 'running', message: '正在导出到 Anki...' }
            : entry,
        ),
      )

      try {
        const result = await api.importApproved([item.draft.id])
        const row = result.results[0]
        setQueueState((current) =>
          current.map((entry) =>
            entry.draftId === item.draft.id
              ? {
                  ...entry,
                  status: row?.ok ? 'success' : 'failed',
                  message: row?.ok ? `已创建 note ${row.note_id}` : row?.error || '导出失败',
                }
              : entry,
          ),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : '导出失败'
        setQueueState((current) =>
          current.map((entry) =>
            entry.draftId === item.draft.id
              ? { ...entry, status: 'failed', message }
              : entry,
          ),
        )
      }
    }

    await refreshAll()
    setImportRunning(false)
  }

  const runManualImportQueue = async (draftIds?: string[], mode: 'current' | 'all' = 'all') => {
    const manualTargets = draftItems.filter((item) => {
      if (item.image.ignored) return false
      if (draftIds && !draftIds.includes(item.draft.id)) return false
      return item.draft.masks.length > 0
    })
    if (manualTargets.length === 0) {
      toast.error('当前没有可导入的手动卡片', {
        description: '先在手动模式里至少画出一个遮罩，再导入到 Anki。',
      })
      return
    }

    openProcessingQueue({
      title: '手动制卡导入队列',
      description: '这里会按图片聚合显示，但每个遮罩都会独立生成一张 Anki 卡片。',
      runningText: '手动模式导入仍在进行中。',
      finishedText: '本轮手动模式导入已结束。',
      items: manualTargets.map((item) => ({
        draftId: item.draft.id,
        label: queueLabel(item),
        status: 'pending',
        message: `准备导入 ${item.draft.masks.length} 张遮罩卡片`,
      })),
    })

    const quality = Math.max(1, Math.min(imageSettings?.llm_image_quality ?? 80, 100))
    try {
      const result = await api.importManual({
        draftIds: manualTargets.map((item) => item.draft.id),
        webpQuality: quality,
      })
      const resultMap = new Map(result.results.map((entry) => [entry.draft_id, entry]))
      setQueueState((current) =>
        current.map((entry) => {
          const matched = resultMap.get(entry.draftId)
          if (!matched) return entry
          return {
            ...entry,
            status: matched.ok ? 'success' : 'failed',
            message: matched.ok
              ? `已创建 ${matched.created_count} 张卡片${matched.template_name ? ` · ${matched.template_name}` : ''}`
              : matched.error || '导入失败',
          }
        }),
      )
      await refreshAll()
      toast.success(mode === 'current' ? '当前图片已导入到 Anki' : '手动模式批量导入已完成', {
        description: `本次按遮罩独立创建卡片，导出质量 ${quality}。`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '手动模式导入失败'
      setQueueState((current) => current.map((entry) => ({ ...entry, status: 'failed', message })))
      toast.error('手动模式导入失败', { description: message })
    } finally {
      setImportRunning(false)
    }
  }

  const routeReadyItems = draftItems.filter((item) => !item.image.ignored && item.draft.review_status === 'route_ready')
  const routeReviewItems = draftItems.filter((item) => !item.image.ignored && item.draft.review_status === 'route_review')
  const llmReviewItems = draftItems.filter((item) => !item.image.ignored && item.draft.review_status === 'llm_review')
  const routeFocusItems = routeReviewItems.length > 0 ? routeReviewItems : routeReadyItems

  const rerunCurrentRoute = async () => {
    if (!selectedItem) return
    if (!routingSettings || routingSettings.mode !== 'semantic') {
      appendLog('routing', '未进入模型归档模式', '当前“送去哪里”还不是“让模型决定”，所以大模型不会填写 deck。', {
        tone: 'error',
      })
      toast.error('当前不是模型归档模式', {
        description: '先到右侧把“扫描后送去哪里”切到“让模型决定”，保存后再运行第一阶段或当前归档。',
      })
      return
    }
    if (!settings?.enabled) {
      toast.error('模型当前未启用', { description: '先打开模型，再重跑当前归档建议。' })
      return
    }
    appendLog('routing', '重跑当前归档建议', `正在为 ${queueLabel(selectedItem)} 重新判断该送去哪里。`)
    const result = await api.runRouteSuggestions({
      draftIds: [selectedItem.draft.id],
      analysisMode,
      includeImage: analysisMode !== 'ocr_only',
      includeOcr: true,
    })
    setDraftItems(result.items)
    const updated = result.items.find((item) => item.draft.id === selectedItem.draft.id)
    if (updated) {
      logRoutingResults([updated])
    }
  }

  const fillCurrentRouteForDebug = async () => {
    if (!selectedItem) return
    const sampleDeck = selectedItem.draft.deck || 'Test::Routing'
    const sampleTags = selectedItem.draft.tags.length > 0 ? selectedItem.draft.tags : ['test', 'routing']
    const sampleReason =
      selectedItem.draft.route_reason ||
      '这是测试填入内容，用来确认第二道审核的 deck、tags 和归档说明能否正确显示。'
    const nextDraft = await patchDraft({
      deck: sampleDeck,
      tags: sampleTags,
      routeReason: sampleReason,
    })
    if (nextDraft) {
      setDraftDeckInput(nextDraft.deck || '')
      setDraftTagsInput(nextDraft.tags.join(', '))
      appendLog('routing', `测试填入: ${queueLabel(selectedItem)}`, '已写入一组测试 deck/tags/说明，用来确认界面绑定是否正常。', {
        body: nextDraft.route_reason || sampleReason,
        tone: 'success',
      })
      toast.success('测试填入已完成', {
        description: '如果这次能显示出来，就说明界面绑定已经通了。',
      })
    }
  }

  const runStageOnePipeline = async () => {
    if (!effectiveScanPath) return
    await runStageOneForPath(effectiveScanPath, { sourceLabel: '当前目录', showCompletionToast: true })
  }

  const runStageTwoPipeline = async () => {
    if (routeReadyItems.length === 0) {
      toast.error('还没有可进入第二阶段的项目', {
        description: '先在第一道审核里确认归档，再继续跑挖空。',
      })
      return
    }
    appendLog('system', '第二阶段开始', `共有 ${routeReadyItems.length} 项进入挖空队列，完成后会停在结果审核。`, {
      tone: 'success',
    })
    await runLlmQueue(routeReadyItems)
    toast.success('第二阶段已完成', {
      description: '挖空结果已经返回，现在可以开始做最终审核。',
    })
  }

  const confirmCurrentRoute = async () => {
    if (!selectedItem) return
    const nextDeck = draftDeckInput.trim()
    const nextTags = parseTagInput(draftTagsInput)
    if (!nextDeck) {
      toast.error('还没有目标 deck', {
        description: '先填好这张图要送去哪个 deck，再确认归档。',
      })
      return
    }
    const nextDraft = await patchDraft({
      deck: nextDeck,
      tags: nextTags,
      reviewStatus: 'route_ready',
    })
    if (nextDraft) {
      appendLog('routing', `归档已确认: ${queueLabel(selectedItem)}`, `接下来会送去 ${nextDraft.deck}`, {
        body: nextDraft.route_reason || '已由人工确认归档结果。',
        tone: 'success',
      })
      const nextRouteItem = draftItems.find(
        (item) => !item.image.ignored && item.draft.review_status === 'route_review' && item.draft.id !== nextDraft.id,
      )
      if (nextRouteItem) {
        setSelectedDraftId(nextRouteItem.draft.id)
      }
    }
  }

  const approveCurrentResult = async () => {
    if (!selectedItem) return
    const nextDeck = draftDeckInput.trim()
    const nextTags = parseTagInput(draftTagsInput)
    if (!nextDeck) {
      toast.error('还没有目标 deck', {
        description: '请先补齐 deck，再批准最终结果。',
      })
      return
    }
    await patchDraft({
      deck: nextDeck,
      tags: nextTags,
      reviewStatus: 'approved',
    })
    const nextLlmItem = draftItems.find(
      (item) => !item.image.ignored && item.draft.review_status === 'llm_review' && item.draft.id !== selectedItem.draft.id,
    )
    if (nextLlmItem) {
      setSelectedDraftId(nextLlmItem.draft.id)
    }
  }

  const scanPath = folderInput.trim()
  const effectiveScanPath = scanPath || (draftItems[0] ? inferScanRootPath(draftItems[0]) : '')
  const routeStageItems = routeFocusItems
  const hasQueueItems = draftItems.length > 0
  const focusStage =
    !selectedItem
      ? 'empty'
      : selectedItem.draft.review_status === 'llm_review' ||
          selectedItem.draft.review_status === 'approved' ||
          selectedItem.draft.review_status === 'imported'
        ? 'llm'
        : 'route'
  const overviewStats = [
    { label: 'Queue', value: overview.total, note: '待处理' },
    { label: 'Route Review', value: overview.routeReview, note: '等归档确认' },
    { label: 'LLM Review', value: overview.llmReview, note: '等结果确认' },
    { label: 'Stage 2 Ready', value: overview.routeReady, note: '可进第二阶段' },
    { label: 'Imported', value: overview.imported, note: '已导入' },
  ]

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(247,176,62,0.14),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(21,165,146,0.12),_transparent_24%),linear-gradient(180deg,#f8f6ef_0%,#f4efe3_100%)] text-foreground">
      <motion.div layout transition={LAYOUT_TRANSITION} className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-4 py-4 md:px-6">
        <Card className="border-none bg-[linear-gradient(135deg,rgba(255,251,240,0.96),rgba(255,244,219,0.94))] shadow-lg shadow-amber-950/10">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="text-3xl tracking-tight">Anki 图像挖空工作台</CardTitle>
              <CardDescription>
                {workspaceMode === 'manual'
                  ? '手动模式下只保留裁剪、遮罩、导出压缩和导入 Anki。每个遮罩都会独立生成一张卡片。'
                  : '先决定扫描到的图片该自动送去哪里，再用 LLM 重点决定图里该挖哪里，最后进入可见的导出区域。'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[320px] flex-1">
                <Input value={folderInput} onChange={(event) => setFolderInput(event.target.value)} placeholder="输入待扫描目录，例如 D:\\Notes\\Calculus" />
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  void openNativeDirectoryPicker()
                }}
              >
                <FolderOpenIcon data-icon="inline-start" />
                浏览目录
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" onClick={() => run('refresh', refreshAll)}>
                    {loadingKey === 'refresh' ? <Spinner data-icon="inline-start" /> : <RefreshCcwIcon data-icon="inline-start" />}
                    刷新
                  </Button>
                </TooltipTrigger>
                <TooltipContent>重新拉取队列、送去哪里方式和模型设置。</TooltipContent>
              </Tooltip>
              <Button
                variant={analysisLogOpen ? 'secondary' : 'outline'}
                onClick={() => setAnalysisLogOpen((current) => !current)}
                disabled={workspaceMode === 'manual'}
              >
                <LogsIcon data-icon="inline-start" />
                {analysisLogOpen ? '关闭日志窗' : '打开日志窗'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-background/75 px-3 py-3 shadow-none">
              <ToggleGroup
                type="single"
                value={workspaceMode}
                onValueChange={(value) => value && setWorkspaceMode(value as WorkspaceMode)}
                className="justify-start"
              >
                <ToggleGroupItem value="pipeline">流水线模式</ToggleGroupItem>
                <ToggleGroupItem value="manual">手动模式</ToggleGroupItem>
              </ToggleGroup>
              {workspaceMode === 'pipeline' ? (
                <>
                  <Badge variant="secondary">当前概览</Badge>
                  {overviewStats.map((stat) => (
                    <div
                      key={stat.label}
                      className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-1.5"
                    >
                      <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        {stat.label}
                      </span>
                      <span className="text-base font-semibold">{stat.value}</span>
                      <span className="text-xs text-muted-foreground">{stat.note}</span>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <Badge variant="secondary">手动模式概览</Badge>
                  <div className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-1.5">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Images</span>
                    <span className="text-base font-semibold">{draftItems.filter((item) => !item.image.ignored).length}</span>
                    <span className="text-xs text-muted-foreground">当前图片</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-1.5">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Masks</span>
                    <span className="text-base font-semibold">
                      {draftItems.filter((item) => !item.image.ignored).reduce((sum, item) => sum + item.draft.masks.length, 0)}
                    </span>
                    <span className="text-xs text-muted-foreground">将拆成独立卡片</span>
                  </div>
                </>
              )}
            </div>

            {workspaceMode === 'pipeline' ? (
              <Alert className="border-amber-300/50 bg-amber-50/80">
                <AlertTitle>推荐下一步</AlertTitle>
                <AlertDescription className="space-y-1">
                  <div>{workflowHint}</div>
                  {lastScanSummary && (
                    <div className="text-sm text-muted-foreground">
                      最近一次扫描：共发现 {lastScanSummary.scanned_count} 项，其中 {lastScanSummary.matched_count} 项已经知道该自动送去哪里，{lastScanSummary.blocked_count} 项还需要补设置。
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-amber-300/50 bg-amber-50/80">
                <AlertTitle>手动模式当前重点</AlertTitle>
                <AlertDescription>
                  只需要关注裁剪、遮罩和最终导入。每个遮罩都会独立制卡，导入前会自动检查专用模板是否存在。
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex flex-wrap items-start justify-between gap-4 border-t border-amber-950/10 pt-4">
            {workspaceMode === 'pipeline' ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      run('pipeline-stage-1', async () => {
                        await runStageOnePipeline()
                      })
                    }
                    disabled={!effectiveScanPath}
                  >
                    {loadingKey === 'pipeline-stage-1' ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
                    运行第一阶段
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      run('pipeline-rerun', async () => {
                        if (!effectiveScanPath) return
                        await api.resetWorkspace()
                        clearLocalWorkspaceState()
                        appendLog('system', '重新跑当前流水线', `已清空当前工作区，准备从 ${effectiveScanPath} 重新开始。`, {
                          tone: 'success',
                        })
                        await runStageOneForPath(effectiveScanPath, { sourceLabel: '当前目录', showCompletionToast: true })
                      })
                    }
                    disabled={!effectiveScanPath}
                  >
                    {loadingKey === 'pipeline-rerun' ? <Spinner data-icon="inline-start" /> : <RefreshCcwIcon data-icon="inline-start" />}
                    重新跑当前流水线
                  </Button>
                  <Button
                    onClick={() =>
                      run('pipeline-stage-2', async () => {
                        await runStageTwoPipeline()
                      })
                    }
                    disabled={routeReadyItems.length === 0}
                  >
                    {loadingKey === 'pipeline-stage-2' ? <Spinner data-icon="inline-start" /> : <BotIcon data-icon="inline-start" />}
                    继续第二阶段
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      selectedItem &&
                      run('render', async () => {
                        await requestRender(selectedItem.draft.id)
                      })
                    }
                    disabled={!selectedItem}
                  >
                    {loadingKey === 'render' ? <Spinner data-icon="inline-start" /> : <Settings2Icon data-icon="inline-start" />}
                    立即渲染当前预览
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      selectedItem &&
                      run('reveal', async () => {
                        await api.revealPath(selectedItem.image.source_path)
                      })
                    }
                    disabled={!selectedItem}
                  >
                    {loadingKey === 'reveal' ? <Spinner data-icon="inline-start" /> : <FolderOpenIcon data-icon="inline-start" />}
                    打开所在位置
                  </Button>
                </div>
                <div className="flex min-w-[220px] justify-end">
                  <Button
                    onClick={() => run('import', runImportQueue)}
                    disabled={!draftItems.some((item) => !item.image.ignored && item.draft.review_status === 'approved')}
                  >
                    {loadingKey === 'import' ? <Spinner data-icon="inline-start" /> : <ImportIcon data-icon="inline-start" />}
                    导出
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() =>
                    selectedItem &&
                    run('render', async () => {
                      await requestRender(selectedItem.draft.id)
                    })
                  }
                  disabled={!selectedItem}
                >
                  {loadingKey === 'render' ? <Spinner data-icon="inline-start" /> : <Settings2Icon data-icon="inline-start" />}
                  更新当前图片预览
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    selectedItem &&
                    run('reveal', async () => {
                      await api.revealPath(selectedItem.image.source_path)
                    })
                  }
                  disabled={!selectedItem}
                >
                  {loadingKey === 'reveal' ? <Spinner data-icon="inline-start" /> : <FolderOpenIcon data-icon="inline-start" />}
                  打开所在位置
                </Button>
                <Button
                  onClick={() =>
                    run('manual-import-all', async () => {
                      await runManualImportQueue(undefined, 'all')
                    })
                  }
                  disabled={!draftItems.some((item) => !item.image.ignored && item.draft.masks.length > 0)}
                >
                  {loadingKey === 'manual-import-all' ? <Spinner data-icon="inline-start" /> : <ImportIcon data-icon="inline-start" />}
                  导入手动模式全部遮罩卡片
                </Button>
              </>
            )}
          </CardFooter>
        </Card>

        {workspaceMode === 'manual' ? (
          <>
            <ResizablePanelGroup orientation="horizontal" className="min-h-[calc(100vh-220px)] rounded-2xl border border-border/70 bg-background/90 shadow-lg shadow-amber-950/5 backdrop-blur">
              <ResizablePanel defaultSize={22} minSize={18}>
                <ManualDraftList
                  items={draftItems}
                  selectedDraftId={selectedItem?.draft.id ?? null}
                  apiBaseUrl={api.baseUrl}
                  onSelect={setSelectedDraftId}
                />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={78} minSize={60}>
                <ManualWorkspace
                  selectedItem={selectedItem}
                  apiBaseUrl={api.baseUrl}
                  onMasksCommit={commitMasks}
                  onCropCommit={commitCrop}
                  deckContent={
                    <DeckPicker
                      decks={deckOptions}
                      value={draftDeckInput}
                      onValueChange={setDraftDeckInput}
                      onSave={() =>
                        void patchDraft({
                          deck: draftDeckInput.trim() || null,
                          tags: parseTagInput(draftTagsInput),
                        }).then(() => {
                          void refreshAll()
                        })
                      }
                    />
                  }
                />
              </ResizablePanel>
            </ResizablePanelGroup>

            <section className="flex flex-col gap-5 rounded-[32px] border border-border/70 bg-[linear-gradient(135deg,rgba(255,251,244,0.98),rgba(242,247,255,0.96))] px-6 py-6 shadow-xl shadow-amber-950/5">
              <div className="flex flex-col gap-2">
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Export Board</div>
                <div className="text-3xl font-semibold tracking-tight">导出与导入</div>
                <div className="max-w-3xl text-sm text-muted-foreground">
                  这是页面级的独立重要板块，不再隶属于“目标 Deck”或“手动图像编辑”。这里专门负责最终压缩、模板检查和导入到 Anki。
                </div>
              </div>
              <ManualRightPanel
                selectedItem={selectedItem}
                imageSettings={imageSettings}
                onImageSettingsChange={(next) => setImageSettings(next)}
                onSaveImageSettings={() =>
                  imageSettings &&
                  void run('save-image-settings', async () => {
                    const next = await api.patchImageProcessingSettings(imageSettings)
                    setImageSettings(next)
                    appendLog(
                      'system',
                      '图像处理设置已保存',
                      `上传压缩：${next.llm_image_compress_enabled ? '开启' : '关闭'}，格式：${next.llm_image_format}，质量：${next.llm_image_quality}`,
                      { tone: 'success' },
                    )
                  })
                }
                loadingKey={loadingKey}
                onImportCurrent={() =>
                  selectedItem &&
                  void run('manual-import-current', async () => {
                    await runManualImportQueue([selectedItem.draft.id], 'current')
                  })
                }
                onImportAll={() =>
                  void run('manual-import-all', async () => {
                    await runManualImportQueue(undefined, 'all')
                  })
                }
              />
            </section>
          </>
        ) : (
          <ResizablePanelGroup orientation="horizontal" className="min-h-[calc(100vh-220px)] rounded-2xl border border-border/70 bg-background/90 shadow-lg shadow-amber-950/5 backdrop-blur">
            {hasQueueItems && (
              <>
                <ResizablePanel defaultSize={20} minSize={16}>
                  <DraftList
                    items={draftItems}
                    selectedDraftId={selectedItem?.draft.id ?? null}
                    currentRootPath={folderInput}
                    apiBaseUrl={api.baseUrl}
                    onSelect={setSelectedDraftId}
                    onToggleIgnored={(imageIdsToToggle, ignored) => {
                      void run('toggle-ignore', async () => {
                        await toggleIgnoredImages(imageIdsToToggle, ignored)
                      })
                    }}
                  />
                </ResizablePanel>
                <ResizableHandle withHandle />
              </>
            )}
            <ResizablePanel defaultSize={hasQueueItems ? 50 : 68} minSize={hasQueueItems ? 40 : 48}>
              <motion.div layout transition={LAYOUT_TRANSITION} className="flex h-full flex-col">
                {selectedItem && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                      <Badge variant={statusVariant[selectedItem.draft.review_status]}>{statusLabel[selectedItem.draft.review_status]}</Badge>
                      <div className="text-sm text-muted-foreground">{selectedItem.draft.deck ?? '尚未命中归档路由'}</div>
                      <div className="ml-auto flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => void run('ocr-single', runSingleOcr)}>
                          当前 OCR
                        </Button>
                        {focusStage === 'route' && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => void run('route-single', rerunCurrentRoute)}>
                              让模型填写当前 deck
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => void run('route-debug-fill', fillCurrentRouteForDebug)}>
                              测试填入
                            </Button>
                          </>
                        )}
                        <Button variant="outline" size="sm" onClick={() => void resetCurrentAnalysis()}>
                          重置当前分析
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => void setStatus('blocked')}>
                          <XCircleIcon data-icon="inline-start" />
                          拦下
                        </Button>
                      </div>
                  </div>
                )}
                <ReviewWorkspace
                  selectedItem={selectedItem}
                  focusStage={focusStage}
                  routeReviewCount={routeReviewItems.length}
                  routeReadyCount={routeReadyItems.length}
                  routeStageItems={routeStageItems}
                  llmReviewItems={llmReviewItems}
                  draftDeckInput={draftDeckInput}
                  draftTagsInput={draftTagsInput}
                  onDraftDeckInputChange={setDraftDeckInput}
                  onDraftTagsInputChange={setDraftTagsInput}
                  onSelectDraft={setSelectedDraftId}
                  onConfirmCurrentRoute={() => void confirmCurrentRoute()}
                  onSaveCurrentRoute={() =>
                    void patchDraft({
                      deck: draftDeckInput.trim() || null,
                      tags: parseTagInput(draftTagsInput),
                    })
                  }
                  onApproveCurrentResult={() => void approveCurrentResult()}
                  onMasksCommit={commitMasks}
                  onCropCommit={commitCrop}
                  apiBaseUrl={api.baseUrl}
                />
              </motion.div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={hasQueueItems ? 30 : 32} minSize={22}>
              <RightPanel
                selectedItem={selectedItem}
                selectedTab={selectedTab}
                onTabChange={setSelectedTab}
                analysisMode={analysisMode}
                onAnalysisModeChange={setAnalysisMode}
                settings={settings}
                onSettingsChange={(next) => setSettings(next)}
                routingSettings={routingSettings}
                onRoutingSettingsChange={(next) => setRoutingSettings(next)}
                imageSettings={imageSettings}
                onImageSettingsChange={(next) => setImageSettings(next)}
                settingsApiKey={settingsApiKey}
                onSettingsApiKeyChange={setSettingsApiKey}
                loadingKey={loadingKey}
                modelOptions={modelOptions}
                promptPresets={promptPresets}
                modelLoading={modelLoading}
                modelError={modelError}
                connectionTestResult={connectionTestResult}
                onFetchModels={() => void fetchModels()}
                onTestConnection={() =>
                  void run('test-connection', async () => {
                    try {
                      const result = await testConnection()
                      if (result) {
                        toast.success('连接测试完成', { description: result.message })
                      }
                    } catch (error) {
                      const message = error instanceof Error ? error.message : '连接测试失败。'
                      setConnectionTestResult(null)
                      appendLog('system', '连接测试失败', message, { tone: 'error' })
                      toast.error('连接测试失败', { description: message })
                    }
                  })
                }
                onRunCurrentLlm={() =>
                  selectedItem &&
                  void run('llm-single', async () => {
                      if (!settings?.enabled) {
                        appendLog('llm', 'LLM 未执行', '当前模型开关是关闭的，所以这次没有真正发到模型。', {
                          tone: 'error',
                        })
                        setAnalysisLogOpen(true)
                        toast.error('LLM 当前未启用', { description: '先到“模型与提示”里打开模型开关，再运行。' })
                        return
                      }
                      appendLog('llm', '运行当前 LLM', `正在为当前草稿生成语义遮罩：${queueLabel(selectedItem)}`)
                      const result = await api.runLlmSuggestions({
                        draftIds: [selectedItem.draft.id],
                        analysisMode,
                        batchSize: 1,
                        includeImage: analysisMode !== 'ocr_only',
                        includeOcr: true,
                        promptPreset: settings?.prompt_preset,
                        customPrompt: settings?.custom_prompt,
                        maskDensity: settings?.mask_density,
                      })
                      setDraftItems(result.items)
                      const updated = result.items.find((item) => item.draft.id === selectedItem.draft.id)
                      if (updated) {
                        let finalDraft = updated.draft
                        const hasFailure = updated.draft.llm_warnings.some((warning) => warning.includes('LLM'))
                        if (!hasFailure && updated.draft.review_status === 'route_ready') {
                          const promoted = await api.patchDraft({
                            draftId: updated.draft.id,
                            reviewStatus: 'llm_review',
                          })
                          setDraftItems((current) => replaceDraft(current, promoted))
                          finalDraft = promoted
                        }
                        logLlmResults([{ ...updated, draft: finalDraft }])
                        await requestRender(finalDraft.id, { silent: true })
                      } else {
                        appendLog('llm', '当前 LLM 完成', '当前草稿已完成请求，但没有匹配到新的回调结果。', { tone: 'success' })
                      }
                    })
                }
                onSaveSettings={() =>
                  settings &&
                  void run('save-settings', async () => {
                      const next = await api.patchLlmSettings({
                        ...settings,
                        send_image_default: analysisMode !== 'ocr_only',
                        send_ocr_default: true,
                        api_key: settingsApiKey || undefined,
                      })
                    setSettings(next)
                    setSettingsApiKey('')
                    setModelError(null)
                    appendLog('system', '模型与提示已保存', `当前模型：${next.model || '未填写'}，提示策略：${next.prompt_preset}`, { tone: 'success' })
                  })
                }
                onSaveImageSettings={() =>
                  imageSettings &&
                  void run('save-image-settings', async () => {
                    const next = await api.patchImageProcessingSettings(imageSettings)
                    setImageSettings(next)
                    appendLog(
                      'system',
                      '图像处理设置已保存',
                      `上传压缩：${next.llm_image_compress_enabled ? '开启' : '关闭'}，格式：${next.llm_image_format}，质量：${next.llm_image_quality}`,
                      { tone: 'success' },
                    )
                  })
                }
                onSaveRoutingSettings={() =>
                  routingSettings &&
                  void run('save-routing-settings', async () => {
                    const next = await api.patchRoutingSettings(routingSettings)
                    setRoutingSettings(next)
                    appendLog(
                      'system',
                      '送去哪里方式已保存',
                      next.mode === 'folder_name'
                        ? '当前会按文件夹同名直连到同名 deck。'
                        : `当前会先看 OCR、图片内容和现有 deck，再交给模型决定最合适的归档；最多 ${next.semantic_max_depth} 层。`,
                      { tone: 'success' },
                    )
                  })
                }
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </motion.div>

      <DirectoryBrowserDialog
        open={directoryDialogOpen}
        onOpenChange={setDirectoryDialogOpen}
        pathInput={folderInput}
        currentPath={directoryState?.current_path || folderInput || '未选择'}
        parentPath={directoryState?.parent_path}
        items={directoryState?.items ?? []}
        loading={directoryLoading}
        onPathInputChange={setFolderInput}
        onBrowse={(path) =>
          void loadDirectoryBrowser(path).catch((error) => {
            toast.error('目录浏览失败', {
              description: error instanceof Error ? error.message : '请确认路径是否可访问。',
            })
          })
        }
        onConfirm={() => {
          const nextPath = directoryState?.current_path || folderInput
          if (!nextPath.trim()) {
            toast.error('还没有可用目录', {
              description: '先在上方输入路径，或者在下面点选一个目录。',
            })
            return
          }
          void switchWorkspaceFolder(nextPath, '内置目录浏览')
            .catch((error) => {
              toast.error('切换目录后启动流水线失败', {
                description: describeUiError(error, '请稍后重试。'),
              })
            })
            .finally(() => {
              setDirectoryDialogOpen(false)
            })
        }}
      />

      <ImportQueueDialog
        open={importQueueOpen}
        onOpenChange={setImportQueueOpen}
        items={importQueueItems}
        running={importRunning}
        title={queueTitle}
        description={queueDescription}
        runningText={queueRunningText}
        finishedText={queueFinishedText}
        onRemoveItem={(draftId) =>
          setQueueState((current) => current.filter((item) => item.draftId !== draftId))
        }
        onClearFinished={() =>
          setQueueState((current) => current.filter((item) => item.status === 'pending' || item.status === 'running'))
        }
      />

      <AnalysisLogFloat open={analysisLogOpen} onOpenChange={setAnalysisLogOpen} entries={analysisLogs} />
    </div>
  )
}
