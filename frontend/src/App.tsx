import {
  DownloadIcon,
  ImageDownIcon,
  Settings2Icon,
  Loader2Icon,
} from 'lucide-react'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, startTransition, type ChangeEvent, type InputHTMLAttributes } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { toast } from 'sonner'

import { InlineEmphasis } from '@/components/workbench/inline-emphasis'
import { ManualDraftList } from '@/components/workbench/manual-draft-list'
import { StatusCapsule, type StatusTaskId, type StatusTaskState } from '@/components/workbench/status-capsule'
import { ExportFlowDialog } from '@/components/workbench/export-flow-dialog'
import { ManualWorkspace } from '@/components/workbench/manual-workspace'
import { WorkbenchHeader, type WorkspaceGuideAction } from '@/components/workbench/workbench-header'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useExportFlow } from '@/hooks/use-export-flow'
import { useDeviceProfile } from '@/hooks/use-device-profile'
import { api } from '@/lib/api'
import { countGeneratedCards } from '@/lib/card-generation'
import { downloadDeckPoolBackup, loadDeckPool, loadDeckQuickPicks, readDeckPoolBackup, rememberDeckName, rememberDeckNames, saveDeckPool } from '@/lib/deck-pool'
import ankiHelpImage from '@/assets/ankiHelp-1.webp'
import { transformImageBlob } from '@/lib/image-processing'
import { buildDraftItemFromAsset, buildDraftItemsFromFiles, mergeImportedItems, preferredWorkspaceMode } from '@/lib/manual-project'
import { releaseDraftItems } from '@/lib/project-store'
import {
  DEFAULT_WORKBENCH_SETTINGS,
  loadWorkbenchSettings,
  normalizeWorkbenchSettings,
  pickAvailableExportFormat,
  resolveExportFormatPolicy,
  saveWorkbenchSettings,
} from '@/lib/workbench-settings'
import { ankiLoadingState, classifyAnkiFailure, createInitialStatusTasks, EMPTY_ANKI_STATE, nowIso, replaceDraft, STATUS_TASK_ORDER, WORKSPACE_MODE_STORAGE_KEY } from '@/lib/workbench-state'
import type { AnkiConnectionState, BBox, CardDraft, DraftListItem, WorkspaceMode, WorkbenchSettings } from '@/types'

const LazyPipelinePlaceholder = lazy(async () => {
  const module = await import('@/components/workbench/pipeline-placeholder')
  return { default: module.PipelinePlaceholder }
})

const LazyWorkbenchSettingsDialog = lazy(async () => {
  const module = await import('@/components/workbench/workbench-settings-dialog')
  return { default: module.WorkbenchSettingsDialog }
})

type DirectoryInputProps = InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory?: string
  directory?: string
}

const MANUAL_PROJECT_MIN_SIZE = 340
const STARTUP_SAMPLE_PATH = '内置示例/启动测试图.png'
const ENABLE_STARTUP_SAMPLE = false
const ENABLE_WORKSPACE_MODE_SWITCH = false
const MOBILE_IMAGE_ACCEPT = 'image/*'
const ANKI_HELP_PROMPT_DISMISSED_KEY = 'anki-cloze:anki-help-prompt-dismissed'
const MANUAL_PANEL_LAYOUT_KEY = 'anki-cloze:manual-panel-layout'
const SLOW_SAVE_THRESHOLD_MS = 60
const SLOW_SAVE_REPEAT_THRESHOLD_MS = 100
const SLOW_SAVE_REPEAT_TRIGGER_COUNT = 3
const AUTO_OPTIMIZE_MAX_DIMENSION = DEFAULT_WORKBENCH_SETTINGS.importMaxDimension
const AUTO_OPTIMIZE_QUALITY = DEFAULT_WORKBENCH_SETTINGS.importImageQuality / 100

type ProcessingProgress = {
  percent: number
  completed: number
  total: number
  fileName: string
  stageLabel: string
}

type RecoverableProjectSummary = {
  itemCount: number
  savedAt: string
  workspaceMode: WorkspaceMode
  compressionCount: number
}

type PendingImageEditSaveMetric = {
  draftId: string
  fileLabel: string
  action: 'masks' | 'crop'
}

function WorkspaceLoadingShell({ mobile }: { mobile: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border/70 bg-background/92 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Skeleton className="size-11 rounded-2xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-52 rounded-full" />
            <Skeleton className="h-4 w-full max-w-xl rounded-full" />
          </div>
        </div>
      </div>
      <div className={mobile ? 'flex flex-col gap-4' : 'grid min-h-[calc(100vh-220px)] grid-cols-[340px_minmax(0,1fr)] gap-4'}>
        <div className="rounded-2xl border border-border/70 bg-background/90 p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-28 rounded-full" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/90 p-4 shadow-sm">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-40 rounded-full" />
            <Skeleton className="aspect-[4/3] w-full rounded-3xl" />
            <div className="grid gap-4 xl:grid-cols-2">
              <Skeleton className="h-44 w-full rounded-2xl" />
              <Skeleton className="h-44 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ImportCompressionOverlay({
  open,
  progress,
}: {
  open: boolean
  progress: { percent: number; completed: number; total: number; fileName: string; stageLabel: string } | null
}) {
  if (!open || !progress) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/58 px-4 backdrop-blur-md animate-in fade-in duration-300">
      <Card className="w-full max-w-xl border-border/70 bg-background/94 shadow-2xl shadow-slate-900/10 animate-in zoom-in-95 duration-300">
        <CardHeader className="gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-muted/30 text-foreground/85">
              <ImageDownIcon className="size-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle>正在预处理导入图片</CardTitle>
              <CardDescription>已开启导入压缩，当前会先统一缩图和压缩，再加入项目。</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border/60 bg-muted/15 p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="truncate font-medium text-foreground/88">{progress.stageLabel}</div>
              <div className="shrink-0 text-xs tabular-nums text-muted-foreground">{progress.percent}%</div>
            </div>
            <div className="mt-3">
              <Progress value={progress.percent} className="h-2" />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="truncate">{progress.fileName}</span>
              <span className="shrink-0">{Math.min(progress.completed + 1, progress.total)}/{progress.total}</span>
            </div>
          </div>
          <div className="text-xs leading-5 text-muted-foreground">
            大图压缩时会比普通导入更久一些；处理完成后会自动回到工作台。
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ProjectOptimizationOverlay({
  open,
  progress,
}: {
  open: boolean
  progress: ProcessingProgress | null
}) {
  if (!open || !progress) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/58 px-4 backdrop-blur-md animate-in fade-in duration-300">
      <Card className="w-full max-w-xl border-border/70 bg-background/94 shadow-2xl shadow-slate-900/10 animate-in zoom-in-95 duration-300">
        <CardHeader className="gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-muted/30 text-foreground/85">
              <ImageDownIcon className="size-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle>正在压缩当前项目</CardTitle>
              <CardDescription>会按默认档位压缩图片，并同步保留裁切与遮罩位置。</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border/60 bg-muted/15 p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="truncate font-medium text-foreground/88">{progress.stageLabel}</div>
              <div className="shrink-0 text-xs tabular-nums text-muted-foreground">{progress.percent}%</div>
            </div>
            <div className="mt-3">
              <Progress value={progress.percent} className="h-2" />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="truncate">{progress.fileName || '正在整理项目'}</span>
              <span className="shrink-0">{Math.min(progress.completed + 1, progress.total)}/{progress.total}</span>
            </div>
          </div>
          <div className="text-xs leading-5 text-muted-foreground">
            压缩完成后，当前项目会自动换成更轻的本地图片版本。
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function DeferredDialogFallback({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/58 px-4 backdrop-blur-md animate-in fade-in duration-300">
      <Card className="w-full max-w-lg border-border/70 bg-background/94 shadow-2xl shadow-slate-900/10 animate-in zoom-in-95 duration-300">
        <CardHeader className="gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-muted/30 text-foreground/85">
              <Settings2Icon className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground shrink-0" />
          <Progress value={65} className="h-2 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

function scaleBox(box: BBox, scaleX: number, scaleY: number, maxWidth: number, maxHeight: number): BBox {
  const next: BBox = [
    Math.round(box[0] * scaleX),
    Math.round(box[1] * scaleY),
    Math.round(box[2] * scaleX),
    Math.round(box[3] * scaleY),
  ]
  next[0] = Math.max(0, Math.min(next[0], Math.max(0, maxWidth - 1)))
  next[1] = Math.max(0, Math.min(next[1], Math.max(0, maxHeight - 1)))
  next[2] = Math.max(next[0] + 1, Math.min(next[2], maxWidth))
  next[3] = Math.max(next[1] + 1, Math.min(next[3], maxHeight))
  return next
}

export default function App() {
  const deviceProfile = useDeviceProfile()
  const [draftItems, setDraftItems] = useState<DraftListItem[]>([])
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [editorHoverActive, setEditorHoverActive] = useState(false)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() => {
    if (typeof window === 'undefined') return 'manual'
    return preferredWorkspaceMode(window.localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY) as WorkspaceMode | null)
  })
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [ankiState, setAnkiState] = useState<AnkiConnectionState>(EMPTY_ANKI_STATE)
  const [deckPool, setDeckPool] = useState<string[]>(() => loadDeckPool())
  const [deckQuickPicks, setDeckQuickPicks] = useState<string[]>(() => loadDeckQuickPicks())
  const [storageReady, setStorageReady] = useState(false)
  const [isImportingFiles, setIsImportingFiles] = useState(false)
  const [importingLabel, setImportingLabel] = useState('正在准备项目')
  const [importProgress, setImportProgress] = useState<ProcessingProgress | null>(null)
  const [optimizeProgress, setOptimizeProgress] = useState<ProcessingProgress | null>(null)
  const [recoverableProjectSummary, setRecoverableProjectSummary] = useState<RecoverableProjectSummary | null>(null)
  const [statusTasks, setStatusTasks] = useState<Record<StatusTaskId, StatusTaskState>>(() => createInitialStatusTasks())
  const [projectCompressionCount, setProjectCompressionCount] = useState(0)
  const [ankiHelpOpen, setAnkiHelpOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workbenchSettings, setWorkbenchSettings] = useState<WorkbenchSettings>(() => loadWorkbenchSettings())
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const fileManagerInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const deckPoolInputRef = useRef<HTMLInputElement | null>(null)
  const manualLayoutRef = useRef<HTMLDivElement | null>(null)
  const draftItemsRef = useRef<DraftListItem[]>([])
  const saveSequenceRef = useRef(0)
  const slowSavePromptShownRef = useRef(false)
  const slowSaveStrikeRef = useRef(0)
  const restorePromptToastIdRef = useRef<string | number | null>(null)
  const pendingImageEditSaveMetricRef = useRef<PendingImageEditSaveMetric | null>(null)
  const exportModulesPrefetchedRef = useRef(false)
  const [manualPanelLayout, setManualPanelLayout] = useState<[number, number]>(() => {
    if (typeof window === 'undefined') return [22, 78]
    const raw = window.localStorage.getItem(MANUAL_PANEL_LAYOUT_KEY)
    if (!raw) return [22, 78]
    try {
      const parsed = JSON.parse(raw) as [number, number]
      if (
        Array.isArray(parsed) &&
        parsed.length === 2 &&
        typeof parsed[0] === 'number' &&
        typeof parsed[1] === 'number'
      ) {
        return parsed
      }
    } catch {
      // ignore broken local cache
    }
    return [22, 78]
  })
  const [manualLayoutWidth, setManualLayoutWidth] = useState(0)
  const [ankiHelpPromptDismissed, setAnkiHelpPromptDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(ANKI_HELP_PROMPT_DISMISSED_KEY) === '1'
  })
  const [settingsDialogRequested, setSettingsDialogRequested] = useState(false)
  const [exportDialogRequested, setExportDialogRequested] = useState(false)
  const [slowSavePrompt, setSlowSavePrompt] = useState<{ open: boolean; elapsedMs: number; itemCount: number; compressionCount: number }>({
    open: false,
    elapsedMs: 0,
    itemCount: 0,
    compressionCount: 0,
  })
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [exportCleanupPrompt, setExportCleanupPrompt] = useState<{ open: boolean; draftIds: string[] }>({
    open: false,
    draftIds: [],
  })
  const [isDragActive, setIsDragActive] = useState(false)
  const dragCounterRef = useRef(0)
  const [hugeImportPrompt, setHugeImportPrompt] = useState<{ open: boolean; files: FileList | File[] | null; label: string }>({
    open: false,
    files: null,
    label: '',
  })

  const selectedItem = useMemo(
    () => draftItems.find((item) => item.draft.id === selectedDraftId) ?? draftItems[0] ?? null,
    [draftItems, selectedDraftId],
  )
  const activeDraftItems = useMemo(() => draftItems.filter((item) => !item.image.ignored), [draftItems])
  const settingsPreviewItem = useMemo(() => {
    if (activeDraftItems.length === 0) return null
    const seed = activeDraftItems.reduce((sum, item) => sum + item.draft.id.charCodeAt(0), 0)
    return activeDraftItems[seed % activeDraftItems.length] ?? activeDraftItems[0] ?? null
  }, [activeDraftItems])
  const selectedDraftIndex = useMemo(
    () => activeDraftItems.findIndex((item) => item.draft.id === selectedItem?.draft.id),
    [activeDraftItems, selectedItem?.draft.id],
  )

  useEffect(() => {
    if (exportModulesPrefetchedRef.current) return
    if (activeDraftItems.length === 0) return

    exportModulesPrefetchedRef.current = true
    const warmModules = () => {
      void import('@/lib/apkg-export')
      void import('@/lib/image-group-export')
    }

    const idleWindow = window.setTimeout(warmModules, 1200)
    return () => window.clearTimeout(idleWindow)
  }, [activeDraftItems.length])

  const deckOptions = useMemo(() => {
    const localDecks = draftItems
      .map((item) => item.draft.deck?.trim())
      .filter((value): value is string => Boolean(value))
    const ankiDecks = deviceProfile.canDirectAnki ? ankiState.decks : []
    return [...new Set([...ankiDecks, ...deckPool, ...localDecks])].sort((left, right) => left.localeCompare(right, 'zh-CN'))
  }, [ankiState.decks, deckPool, deviceProfile.canDirectAnki, draftItems])

  const exportQueue = useMemo(
    () => draftItems.filter((item) => !item.image.ignored && item.draft.masks.length > 0),
    [draftItems],
  )
  const hasPendingExitGuard = useMemo(
    () => draftItems.some((item) => !item.image.ignored && item.draft.masks.length > 0 && item.draft.review_status === 'draft'),
    [draftItems],
  )
  const exportFormatPolicy = useMemo(
    () => resolveExportFormatPolicy(exportQueue.map((item) => ({ image: item.image }))),
    [exportQueue],
  )
  const projectCompressionState = useMemo<'original' | 'compressed' | 'mixed' | 'none'>(() => {
    const itemsWithBlob = draftItems.filter((item) => item.image_blob instanceof Blob)
    if (itemsWithBlob.length === 0) return 'none'
    const compressedCount = itemsWithBlob.filter((item) => item.image.source_quality === 'import-compressed' || item.image.source_quality === 'project-optimized').length
    const legacyCount = itemsWithBlob.filter((item) => item.image.source_quality === 'legacy-unknown').length
    if (legacyCount > 0) return 'mixed'
    if (compressedCount === 0) return 'original'
    if (compressedCount === itemsWithBlob.length) return 'compressed'
    return 'mixed'
  }, [draftItems])

  const orderedStatusTasks = useMemo(
    () => STATUS_TASK_ORDER.filter((taskId) => deviceProfile.canDirectAnki || taskId !== 'anki').map((taskId) => statusTasks[taskId]),
    [deviceProfile.canDirectAnki, statusTasks],
  )
  const manualProjectMinPercent = useMemo(() => {
    if (manualLayoutWidth <= 0) return 22
    const raw = (MANUAL_PROJECT_MIN_SIZE / manualLayoutWidth) * 100
    return Math.min(45, Math.max(16, Number(raw.toFixed(2))))
  }, [manualLayoutWidth])
  const resolvedManualPanelLayout = useMemo<[number, number]>(() => {
    const left = Math.max(manualPanelLayout[0], manualProjectMinPercent)
    const safeLeft = Math.min(60, left)
    return [safeLeft, Math.max(40, 100 - safeLeft)]
  }, [manualPanelLayout, manualProjectMinPercent])
  const showWorkspaceLoadingShell = !storageReady
  const showWorkspaceProcessingOverlay = isImportingFiles || loadingKey === 'restore-project'
  const showImportCompressionOverlay = isImportingFiles && workbenchSettings.importCompressionEnabled
  const workspaceProcessingText =
    isImportingFiles
      ? `${importingLabel}，正在处理图片和预览。`
      : '正在恢复你上次保存在浏览器里的项目。'

  const updateStatusTask = (taskId: StatusTaskId, patch: Partial<StatusTaskState>) => {
    setStatusTasks((current) => ({
      ...current,
      [taskId]: {
        ...current[taskId],
        ...patch,
      },
    }))
  }

  const dismissAnkiHelpPrompt = useCallback(() => {
    setAnkiHelpPromptDismissed(true)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ANKI_HELP_PROMPT_DISMISSED_KEY, '1')
    }
  }, [])

  const dismissRestoreProjectPrompt = useCallback(() => {
    if (restorePromptToastIdRef.current !== null) {
      toast.dismiss(restorePromptToastIdRef.current)
      restorePromptToastIdRef.current = null
    }
  }, [])

  const promptAnkiHelpOnFirstFailure = useCallback((force = false) => {
    if (deviceProfile.isMobileDevice) return
    if (!force && ankiHelpPromptDismissed) return
    toast('是否已安装 AnkiConnect？', {
      id: 'anki-help-prompt',
      description: '它可以提供牌组直连服务；如果你只想导出 APKG，可以忽略这一步。',
      duration: Infinity,
      action: {
        label: 'AnkiConnect',
        onClick: () => {
          setAnkiHelpOpen(true)
        },
      },
      cancel: {
        label: '不再提示',
        onClick: dismissAnkiHelpPrompt,
      },
    })
  }, [ankiHelpPromptDismissed, deviceProfile.isMobileDevice, dismissAnkiHelpPrompt])

  useEffect(() => {
    draftItemsRef.current = draftItems
  }, [draftItems])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(MANUAL_PANEL_LAYOUT_KEY, JSON.stringify(manualPanelLayout))
  }, [manualPanelLayout])

  useEffect(() => {
    const node = manualLayoutRef.current
    if (!node || typeof ResizeObserver === 'undefined') return

    const updateWidth = () => {
      const nextWidth = Math.round(node.getBoundingClientRect().width)
      setManualLayoutWidth((current) => (current === nextWidth ? current : nextWidth))
    }

    updateWidth()
    const observer = new ResizeObserver(() => updateWidth())
    observer.observe(node)
    return () => observer.disconnect()
  }, [deviceProfile.isMobileLayout, workspaceMode])

  useEffect(() => {
    return () => {
      releaseDraftItems(draftItemsRef.current)
    }
  }, [])

  useEffect(() => {
    if (!deviceProfile.canDirectAnki) {
      setAnkiState(EMPTY_ANKI_STATE)
      updateStatusTask('anki', { state: 'idle', progress: 0, detail: '移动端已跳过本机 Anki 检测。' })
      return
    }
    void refreshAnkiConnection({ source: 'startup' })
  }, [deviceProfile.canDirectAnki])

  useEffect(() => {
    const decksToRemember = draftItems
      .map((item) => item.draft.deck?.trim())
      .filter((value): value is string => Boolean(value))

    if (decksToRemember.length === 0) return
    setDeckPool(rememberDeckNames(decksToRemember))
    setDeckQuickPicks(loadDeckQuickPicks())
  }, [draftItems])

  useEffect(() => {
    window.localStorage.setItem(WORKSPACE_MODE_STORAGE_KEY, workspaceMode)
  }, [workspaceMode])

  useEffect(() => {
    if (ENABLE_WORKSPACE_MODE_SWITCH) return
    if (workspaceMode === 'pipeline') {
      setWorkspaceMode('manual')
    }
  }, [workspaceMode])

  useEffect(() => {
    saveWorkbenchSettings(workbenchSettings)
  }, [workbenchSettings])

  useEffect(() => {
    let cancelled = false

    const restore = async () => {
      updateStatusTask('restore', { state: 'running', progress: 20, detail: '正在检查浏览器里是否有上次保存的项目。' })
      try {
        const saved = await api.projectStore.peekProjectSummary()
        if (cancelled) return
        if (!saved) {
          updateStatusTask('restore', { state: 'idle', progress: 0, detail: '当前浏览器里还没有可恢复的项目。' })
          return
        }
        setRecoverableProjectSummary(saved)
        updateStatusTask('restore', {
          state: 'idle',
          progress: 0,
          detail: `检测到 ${saved.itemCount} 张可恢复图片，等待你手动恢复。`,
        })
        const savedAtLabel = new Date(saved.savedAt).toLocaleString('zh-CN', { hour12: false })
        restorePromptToastIdRef.current = toast('检测到上次本地项目', {
          id: 'recoverable-project',
          duration: Infinity,
          description:
            saved.itemCount > 0
              ? `上次保存于 ${savedAtLabel}，共 ${saved.itemCount} 张图片。需要时可点“恢复项目”。`
              : `上次保存于 ${savedAtLabel}。需要时可点“恢复项目”。`,
          action: {
            label: '恢复项目',
            onClick: () => {
              dismissRestoreProjectPrompt()
              void run('restore-project', restoreSavedProject)
            },
          },
          cancel: {
            label: '稍后再说',
            onClick: dismissRestoreProjectPrompt,
          },
        })
      } catch (error) {
        if (!cancelled) {
          updateStatusTask('restore', { state: 'error', progress: 100, detail: error instanceof Error ? error.message : '浏览器本地数据读取失败。' })
          toast.error('恢复本地项目失败', { description: error instanceof Error ? error.message : '浏览器本地数据读取失败。' })
        }
      } finally {
        if (!cancelled) {
          setStorageReady(true)
        }
      }
    }

    void restore()
    return () => {
      cancelled = true
      dismissRestoreProjectPrompt()
    }
  }, [dismissRestoreProjectPrompt])

  useEffect(() => {
    if (!storageReady) return
    if (recoverableProjectSummary && draftItems.length === 0) {
      updateStatusTask('save', {
        state: 'idle',
        progress: 0,
        detail: '当前保留了一个待恢复的本地项目，暂不自动用空白状态覆盖它。',
      })
      return
    }
    const sequence = ++saveSequenceRef.current
    const handle = window.setTimeout(() => {
      void (async () => {
        updateStatusTask('save', {
          state: 'running',
          progress: 35,
          detail: draftItems.length > 0 ? `正在保存 ${draftItems.length} 张图片的当前进度。` : '正在同步浏览器里的空项目状态。',
        })

        try {
          const saveMetric = pendingImageEditSaveMetricRef.current
          const startedAt = performance.now()
          if (draftItems.length === 0) {
            await api.projectStore.clearProject()
          } else {
            await api.projectStore.saveProject({ items: draftItems, selectedDraftId, workspaceMode, compressionCount: projectCompressionCount })
          }
          const elapsedMs = performance.now() - startedAt

          if (saveSequenceRef.current !== sequence) return
          updateStatusTask('save', {
            state: 'success',
            progress: 100,
            detail:
              saveMetric && draftItems.length > 0
                ? `最近一次图片编辑保存已完成：${saveMetric.fileLabel}，约 ${Math.round(elapsedMs)}ms。`
                : draftItems.length > 0
                  ? `最近一次自动保存已完成，共 ${draftItems.length} 张图片。`
                  : '当前浏览器里没有待保存的项目。',
          })
          if (saveMetric && draftItems.length > 0) {
            console.info('[image-edit-save]', {
              action: saveMetric.action,
              draftId: saveMetric.draftId,
              fileLabel: saveMetric.fileLabel,
              elapsedMs: Math.round(elapsedMs),
              changedImageCount: 1,
              projectImageCount: draftItems.length,
              savedAt: new Date().toISOString(),
            })
          }
          if (saveMetric) {
            const roundedElapsedMs = Math.round(elapsedMs)
            const shouldAccumulateSlowSave =
              projectCompressionCount > 0
                ? roundedElapsedMs >= SLOW_SAVE_REPEAT_THRESHOLD_MS
                : roundedElapsedMs >= SLOW_SAVE_THRESHOLD_MS

            if (shouldAccumulateSlowSave) {
              slowSaveStrikeRef.current += 1
            } else {
              slowSaveStrikeRef.current = 0
            }

            const shouldShowSlowSavePrompt =
              !slowSavePromptShownRef.current &&
              (
                (projectCompressionCount === 0 && roundedElapsedMs >= SLOW_SAVE_THRESHOLD_MS) ||
                (projectCompressionCount > 0 && slowSaveStrikeRef.current >= SLOW_SAVE_REPEAT_TRIGGER_COUNT)
              )

            if (shouldShowSlowSavePrompt) {
              slowSavePromptShownRef.current = true
              setSlowSavePrompt({
                open: true,
                elapsedMs: roundedElapsedMs,
                itemCount: 1,
                compressionCount: projectCompressionCount,
              })
            }
          }
          pendingImageEditSaveMetricRef.current = null
        } catch (error) {
          if (saveSequenceRef.current !== sequence) return
          pendingImageEditSaveMetricRef.current = null
          updateStatusTask('save', { state: 'error', progress: 100, detail: error instanceof Error ? error.message : '浏览器本地保存失败。' })
          toast.error('浏览器本地保存失败', { description: error instanceof Error ? error.message : '请检查当前浏览器是否允许本地存储。' })
        }
      })()
    }, 1600)
    return () => window.clearTimeout(handle)
  }, [draftItems, loadingKey, recoverableProjectSummary, selectedDraftId, storageReady, workspaceMode])

  useEffect(() => {
    if (!hasPendingExitGuard || typeof window === 'undefined') return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasPendingExitGuard])

  const run = async (key: string, action: () => Promise<void>) => {
    setLoadingKey(key)
    try {
      await action()
    } catch (error) {
      toast.error('操作失败', { description: error instanceof Error ? error.message : '请稍后再试。' })
    } finally {
      setLoadingKey(null)
    }
  }

  const optimizeDraftItemForSpeed = async (item: DraftListItem): Promise<DraftListItem> => {
    const sourceBlob = item.image_blob as Blob
    const transformed = await transformImageBlob(sourceBlob, {
      maxDimension: AUTO_OPTIMIZE_MAX_DIMENSION,
      outputType: 'image/webp',
      outputQuality: AUTO_OPTIMIZE_QUALITY,
    })

    const sourceWidth = Math.max(1, item.image.width)
    const sourceHeight = Math.max(1, item.image.height)
    const scaleX = transformed.width / sourceWidth
    const scaleY = transformed.height / sourceHeight
    const nextUrl = URL.createObjectURL(transformed.blob)

    return {
      ...item,
      image: {
        ...item.image,
        width: transformed.width,
        height: transformed.height,
        source_url: nextUrl,
        media_type: transformed.mediaType,
        source_quality: 'project-optimized',
      },
      draft: {
        ...item.draft,
        crop: item.draft.crop
          ? {
              ...item.draft.crop,
              bbox: scaleBox(item.draft.crop.bbox, scaleX, scaleY, transformed.width, transformed.height),
              padding: Math.max(0, Math.round(item.draft.crop.padding * Math.max(scaleX, scaleY))),
            }
          : item.draft.crop,
        masks: item.draft.masks.map((mask) => ({
          ...mask,
          bbox: scaleBox(mask.bbox, scaleX, scaleY, transformed.width, transformed.height),
        })),
        ocr_regions: item.draft.ocr_regions.map((region) => ({
          ...region,
          bbox: scaleBox(region.bbox, scaleX, scaleY, transformed.width, transformed.height),
        })),
        source_image_url: nextUrl,
        updated_at: nowIso(),
      },
      image_blob: transformed.blob,
    }
  }

  const optimizeCurrentProjectForSpeed = async () => {
    const currentItems = draftItemsRef.current.filter((item) => item.image_blob instanceof Blob)
    if (currentItems.length === 0) {
      toast.error('当前没有可压缩的图片', { description: '先导入图片后再试。' })
      return
    }

    setSlowSavePrompt({ open: false, elapsedMs: 0, itemCount: 0, compressionCount: projectCompressionCount })
    setOptimizeProgress({
      percent: 0,
      completed: 0,
      total: currentItems.length,
      fileName: '',
      stageLabel: '正在准备压缩当前项目',
    })
    updateStatusTask('save', { state: 'running', progress: 5, detail: `正在压缩 ${currentItems.length} 张图片，减少后续保存等待。` })

    const loadingToastId = toast.loading('正在压缩当前项目', {
      description: '会按默认档位压缩图片，并同步调整现有遮罩与裁切。',
    })

    try {
      const optimizedItems: DraftListItem[] = []
      for (const [index, item] of currentItems.entries()) {
        setOptimizeProgress({
          percent: Math.max(1, Math.round((index / Math.max(currentItems.length, 1)) * 100)),
          completed: index,
          total: currentItems.length,
          fileName: item.image.source_path,
          stageLabel: '正在读取并压缩图片',
        })
        optimizedItems.push(await optimizeDraftItemForSpeed(item))
      }

      const optimizedMap = new Map(optimizedItems.map((item) => [item.draft.id, item]))
      const nextItems = draftItemsRef.current.map((item) => optimizedMap.get(item.draft.id) ?? item)
      releaseDraftItems(draftItemsRef.current)
      slowSavePromptShownRef.current = false
      slowSaveStrikeRef.current = 0
      setProjectCompressionCount((current) => current + 1)
      setDraftItems(nextItems)
      setOptimizeProgress({
        percent: 100,
        completed: currentItems.length,
        total: currentItems.length,
        fileName: currentItems.at(-1)?.image.source_path ?? '',
        stageLabel: '压缩完成，正在回写项目',
      })
      updateStatusTask('save', { state: 'success', progress: 100, detail: `已按默认档位压缩 ${currentItems.length} 张图片，后续保存会更轻。` })
      toast.dismiss(loadingToastId)
      toast.success('当前项目已压缩', { description: '图片已换成更轻的版本，遮罩和裁切也一起保留好了。' })
    } catch (error) {
      updateStatusTask('save', { state: 'error', progress: 100, detail: error instanceof Error ? error.message : '当前项目压缩失败。' })
      toast.dismiss(loadingToastId)
      throw error
    } finally {
      setOptimizeProgress(null)
    }
  }

  const replaceAllItems = (items: DraftListItem[], nextSelectedDraftId?: string | null) => {
    releaseDraftItems(draftItemsRef.current)
    slowSavePromptShownRef.current = false
    slowSaveStrikeRef.current = 0
    pendingImageEditSaveMetricRef.current = null
    dismissRestoreProjectPrompt()
    setRecoverableProjectSummary(null)
    setSlowSavePrompt({ open: false, elapsedMs: 0, itemCount: 0, compressionCount: 0 })
    setDraftItems(items)
    setSelectedDraftId(nextSelectedDraftId ?? items[0]?.draft.id ?? null)
  }

  const removeDraftItem = (draftId: string) => {
    const currentItems = draftItemsRef.current
    const index = currentItems.findIndex(item => item.draft.id === draftId)
    if (index === -1) return
    const itemToRemove = currentItems[index]
    
    let nextSelectedId = selectedDraftId
    if (selectedDraftId === draftId) {
      const active = currentItems.filter((item) => !item.image.ignored)
      const activeIndex = active.findIndex(item => item.draft.id === draftId)
      if (active.length > 1) {
        if (activeIndex < active.length - 1) {
          nextSelectedId = active[activeIndex + 1].draft.id
        } else {
          nextSelectedId = active[activeIndex - 1].draft.id
        }
      } else {
        nextSelectedId = null
      }
    }
    
    const nextItems = currentItems.filter(item => item.draft.id !== draftId)
    startTransition(() => {
      setDraftItems(nextItems)
      setSelectedDraftId(nextSelectedId)
    })
    
    // 延迟 500ms 释放对应的 Object URL，避免右侧 AnimatePresence 退场动画还未播放完就丢失资源引起报错和卡顿
    setTimeout(() => {
      releaseDraftItems([itemToRemove])
    }, 500)
    // Skip empty project clearing here, project layout handles it via summary and empty states
  }

  const removeDraftItemsByIds = (draftIds: string[]) => {
    if (draftIds.length === 0) return
    const draftIdSet = new Set(draftIds)
    const currentItems = draftItemsRef.current
    const remainingItems = currentItems.filter((item) => !draftIdSet.has(item.draft.id))
    const removedItems = currentItems.filter((item) => draftIdSet.has(item.draft.id))
    const selectedStillExists = selectedDraftId ? remainingItems.some((item) => item.draft.id === selectedDraftId) : false

    setDraftItems(remainingItems)
    setSelectedDraftId(selectedStillExists ? selectedDraftId : (remainingItems[0]?.draft.id ?? null))
    releaseDraftItems(removedItems)
  }

  const promptExportCleanup = (draftIds: string[]) => {
    if (draftIds.length === 0) return
    setExportCleanupPrompt({ open: true, draftIds })
  }

  const refreshAnkiConnection = async (options?: { source?: 'startup' | 'manual' | 'create-deck' }) => {
    if (!deviceProfile.canDirectAnki) {
      setAnkiState(EMPTY_ANKI_STATE)
      updateStatusTask('anki', { state: 'idle', progress: 0, detail: '移动端已跳过本机 Anki 检测。' })
      return
    }

    setAnkiState((current) => ({ ...current, ...ankiLoadingState() }))
    updateStatusTask('anki', { state: 'running', progress: 15, detail: '正在连接本机 AnkiConnect，并检查模板状态。' })

    try {
      const check = await api.anki.checkAnkiConnection()
      if (!check.ok) {
        const failure = classifyAnkiFailure(check.message)
        setAnkiState({
          checked: true,
          ok: false,
          title: failure.title,
          message: `${failure.detail} ${check.message}`.trim(),
          decks: [],
          level: failure.level,
          lastCheckedAt: nowIso(),
          templateStatus: null,
        })
        updateStatusTask('anki', { state: 'error', progress: 100, detail: check.message })
        if (options?.source === 'startup' || options?.source === 'manual') {
          promptAnkiHelpOnFirstFailure(options?.source === 'manual')
        }
        return
      }

      const [decks, templateStatus] = await Promise.all([api.anki.listAnkiDecks(), api.anki.ensureManualTemplate()])
      const checkedAt = nowIso()
      setAnkiState({
        checked: true,
        ok: true,
        title: decks.length > 0 ? '本机牌组已同步' : '已连接，但还没有读到牌组',
        message:
          decks.length > 0
            ? '网页已经连到你本机的 Anki，并拿到了当前可用牌组。'
            : '网页已经连到你本机的 Anki，但目前没有读到任何牌组。请确认本机牌组是否为空。',
        decks,
        level: decks.length > 0 ? 'success' : 'warning',
        lastCheckedAt: checkedAt,
        templateStatus,
      })
      updateStatusTask('anki', {
        state: decks.length > 0 ? 'success' : 'error',
        progress: 100,
        detail: decks.length > 0 ? `已连接本机 Anki，当前可用 ${decks.length} 个牌组。` : '已经连上本机 Anki，但当前没有读到任何牌组。',
      })
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Anki 状态检查失败。'
      const failure = classifyAnkiFailure(rawMessage)
      setAnkiState({
        checked: true,
        ok: false,
        title: failure.title,
        message: `${failure.detail} ${rawMessage}`.trim(),
        decks: [],
        level: failure.level,
        lastCheckedAt: nowIso(),
        templateStatus: null,
      })
      updateStatusTask('anki', { state: 'error', progress: 100, detail: rawMessage })
      if (options?.source === 'startup' || options?.source === 'manual') {
        promptAnkiHelpOnFirstFailure(options?.source === 'manual')
      }
      if (options?.source === 'manual' || options?.source === 'create-deck') {
        throw error
      }
    }
  }

  const restoreSavedProject = async () => {
    dismissRestoreProjectPrompt()
    updateStatusTask('restore', { state: 'running', progress: 25, detail: '正在读取你上次保存在浏览器里的项目。' })
    try {
      const saved = await api.projectStore.loadProject()
      if (!saved) {
        setRecoverableProjectSummary(null)
        updateStatusTask('restore', { state: 'idle', progress: 0, detail: '当前浏览器里没有可恢复的项目。' })
        toast.error('当前没有可恢复的本地项目', { description: '先导入图片并编辑一次，浏览器才会保存这份项目。' })
        return
      }
      replaceAllItems(saved.items, saved.selectedDraftId)
      setProjectCompressionCount(saved.compressionCount)
      setWorkspaceMode(preferredWorkspaceMode(saved.workspaceMode))
      updateStatusTask('restore', { state: 'success', progress: 100, detail: `已恢复 ${saved.items.length} 张图片的本地项目。` })
      toast.success('已恢复上次的本地项目', { description: `共恢复 ${saved.items.length} 张图片。` })
    } catch (error) {
      updateStatusTask('restore', { state: 'error', progress: 100, detail: error instanceof Error ? error.message : '本地项目恢复失败。' })
      throw error
    }
  }

  const clearLocalProject = async () => {
    dismissRestoreProjectPrompt()
    releaseDraftItems(draftItemsRef.current)
    draftItemsRef.current = []
    slowSavePromptShownRef.current = false
    slowSaveStrikeRef.current = 0
    pendingImageEditSaveMetricRef.current = null
    setRecoverableProjectSummary(null)
    setSlowSavePrompt({ open: false, elapsedMs: 0, itemCount: 0, compressionCount: 0 })
    setProjectCompressionCount(0)
    setDraftItems([])
    setSelectedDraftId(null)

    try {
      await api.projectStore.clearProject()
      updateStatusTask('save', { state: 'success', progress: 100, detail: '浏览器本地项目已清空。' })
      toast.success('本地项目已清空', { description: '浏览器里保存的图片、遮挡和牌组信息都已移除。' })
    } catch (error) {
      updateStatusTask('save', { state: 'error', progress: 100, detail: error instanceof Error ? error.message : '清空浏览器本地项目失败。' })
      throw error
    }
  }

  const ingestFiles = async (files: FileList | File[], sourceLabel: string) => {
    setIsImportingFiles(true)
    setImportingLabel(sourceLabel)
    setImportProgress(null)
    const loadingToastId = toast.loading(`${sourceLabel}处理中`, {
      description: '正在整理图片并加入列表，请稍等一下。',
    })
    updateStatusTask('files', { state: 'running', progress: 5, detail: `正在整理 ${sourceLabel} 里的图片。` })

    try {
      const items = await buildDraftItemsFromFiles(files, {
        settings: workbenchSettings,
        onProgress: ({ completed, total, fileName, percent, stageLabel }) => {
          setImportProgress({
            percent,
            completed,
            total,
            fileName,
            stageLabel,
          })
          updateStatusTask('files', {
            state: 'running',
            progress: Math.max(5, percent),
            detail: `${stageLabel}：${fileName}（${Math.min(completed + 1, total)}/${total}）。`,
          })
        },
      })

      if (items.length === 0) {
        updateStatusTask('files', { state: 'error', progress: 100, detail: '没有找到可用的图片文件。' })
        toast.dismiss(loadingToastId)
        toast.error('没有找到可导入的图片', { description: '支持 png、jpg、jpeg、webp、bmp、gif。' })
        return
      }

      let addedCount = 0
      setDraftItems((current) => {
        const merged = mergeImportedItems(current, items)
        addedCount = merged.length - current.length
        return merged
      })
        setSelectedDraftId((current) => current ?? items[0]?.draft.id ?? null)
        setWorkspaceMode('manual')
        dismissRestoreProjectPrompt()
        setRecoverableProjectSummary(null)
        slowSavePromptShownRef.current = false
        slowSaveStrikeRef.current = 0
        pendingImageEditSaveMetricRef.current = null
        setSlowSavePrompt({ open: false, elapsedMs: 0, itemCount: 0, compressionCount: 0 })
        setProjectCompressionCount(0)
        updateStatusTask('files', {
        state: 'success',
        progress: 100,
        detail:
          addedCount === items.length
            ? `${sourceLabel} 已完成，本次带入 ${items.length} 张图片。`
            : `${sourceLabel} 已完成，新带入 ${addedCount} 张图片，跳过了 ${items.length - addedCount} 张重复图片。`,
      })
      toast.dismiss(loadingToastId)
      toast.success(`${sourceLabel} 已完成`, {
        description:
          addedCount === items.length
            ? `本次带入 ${items.length} 张图片。`
            : `新带入 ${addedCount} 张图片，跳过了 ${items.length - addedCount} 张重复图片。`,
      })
    } catch (error) {
      toast.dismiss(loadingToastId)
      updateStatusTask('files', { state: 'error', progress: 100, detail: error instanceof Error ? error.message : '图片导入失败。' })
      throw error
    } finally {
      setIsImportingFiles(false)
      setImportProgress(null)
    }
  }

  const safeIngestFiles = async (files: FileList | File[], label: string) => {
    if (files.length > 20) {
      setHugeImportPrompt({ open: true, files, label })
    } else {
      await ingestFiles(files, label)
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      if (Array.from(e.dataTransfer.items).some(item => item.kind === 'file')) {
        setIsDragActive(true)
      }
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragActive(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files)
      void safeIngestFiles(files, '拖入图片')
    }
  }

  const onFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    await safeIngestFiles(files, '图片上传')
    event.target.value = ''
  }

  const onFolderInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    await safeIngestFiles(files, '文件夹导入')
    event.target.value = ''
  }

  const onFileManagerInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    await safeIngestFiles(files, '文件管理器导入')
    event.target.value = ''
  }

  const onDeckPoolBackupInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    await run('import-deck-pool', async () => {
      const importedDecks = await readDeckPoolBackup(file)
      const mergedDecks = saveDeckPool([...deckPool, ...importedDecks])
      setDeckPool(mergedDecks)
      setDeckQuickPicks(loadDeckQuickPicks())
      toast.success('牌组池备份已导入', {
        description:
          importedDecks.length > 0
            ? `这次一共并入了 ${importedDecks.length} 个备份牌组名。`
            : '这份备份文件里没有读到可用的牌组名。',
      })
    })

    event.target.value = ''
  }

  const exportDeckPoolBackupFile = () => {
    const { count } = downloadDeckPoolBackup(deckPool)
    toast.success('牌组池备份已导出', {
      description: count > 0 ? `这次打包了 ${count} 个本地牌组名。` : '当前牌组池是空的，已导出一份空备份。',
    })
  }

  const patchDraft = async (payload: {
    draftId: string
    deck?: string | null
    tags?: string[]
    reviewStatus?: CardDraft['review_status']
    importedNoteId?: number | null
    lastImportedAt?: string | null
  }) => {
    const currentItem = draftItemsRef.current.find((item) => item.draft.id === payload.draftId)
    if (!currentItem) return null
    const nextDraft: CardDraft = {
      ...currentItem.draft,
      deck: payload.deck !== undefined ? payload.deck : currentItem.draft.deck,
      tags: payload.tags !== undefined ? payload.tags : currentItem.draft.tags,
      review_status: payload.reviewStatus ?? currentItem.draft.review_status,
      imported_note_id: payload.importedNoteId !== undefined ? payload.importedNoteId : currentItem.draft.imported_note_id,
      last_imported_at: payload.lastImportedAt !== undefined ? payload.lastImportedAt : currentItem.draft.last_imported_at,
      updated_at: nowIso(),
    }
    setDraftItems((current) => replaceDraft(current, nextDraft))
    if (payload.deck !== undefined && payload.deck) {
      setDeckPool(rememberDeckName(payload.deck))
      setDeckQuickPicks(loadDeckQuickPicks())
    }
    return nextDraft
  }

  // 响应并全局应用动画减弱设置
  useEffect(() => {
    if (workbenchSettings.disableAnimations) {
      document.documentElement.setAttribute('data-reduce-motion', 'true')
    } else {
      document.documentElement.removeAttribute('data-reduce-motion')
    }
  }, [workbenchSettings.disableAnimations])

  const commitMasks = useCallback(async (masks: CardDraft['masks']) => {
    if (!selectedItem) return
    pendingImageEditSaveMetricRef.current = {
      draftId: selectedItem.draft.id,
      fileLabel: selectedItem.image.source_path || selectedItem.draft.id,
      action: 'masks',
    }
    const nextDraft: CardDraft = { ...selectedItem.draft, masks, updated_at: nowIso() }
    setDraftItems((current) => replaceDraft(current, nextDraft))
  }, [selectedItem])

  const commitCrop = useCallback(async (bbox: [number, number, number, number]) => {
    if (!selectedItem) return
    pendingImageEditSaveMetricRef.current = {
      draftId: selectedItem.draft.id,
      fileLabel: selectedItem.image.source_path || selectedItem.draft.id,
      action: 'crop',
    }
    const nextDraft: CardDraft = {
      ...selectedItem.draft,
      crop: { bbox, padding: 0, confidence: 1, source: 'manual' },
      updated_at: nowIso(),
    }
    setDraftItems((current) => replaceDraft(current, nextDraft))
  }, [selectedItem])

  const createCurrentDeckInAnki = async () => {
    const nextDeck = deckInput.trim()
    if (!nextDeck) {
      toast.error('请先填写牌组名称', { description: '先输入你想创建的牌组名称，再执行新建。' })
      return
    }

    await api.anki.createAnkiDeck(nextDeck)
    setDeckPool(rememberDeckName(nextDeck))
    setAnkiState((current) => {
      const decks = [...new Set([...current.decks, nextDeck])].sort((left, right) => left.localeCompare(right, 'zh-CN'))
      return {
        ...current,
        checked: true,
        ok: true,
        title: '已在 Anki 中创建牌组',
        message: `新牌组“${nextDeck}”已经在本机 Anki 中准备好了。`,
        decks,
        level: 'success',
        lastCheckedAt: nowIso(),
      }
    })
    updateStatusTask('anki', { state: 'success', progress: 100, detail: `已在本机 Anki 中创建牌组：${nextDeck}` })
    toast.success('新牌组已创建', { description: `“${nextDeck}”已经出现在本机 Anki 里。` })
    await refreshAnkiConnection({ source: 'create-deck' })
  }

  const importDraftsToAnki = async (targets: DraftListItem[]) => {
    if (targets.length === 0) {
      updateStatusTask('export', { state: 'error', progress: 100, detail: '当前没有可导出的卡片。' })
      toast.error('当前没有可导出的卡片', { description: '先画出遮挡，再打开导出流程逐张确认牌组。' })
      return { successCount: 0, failedCount: 0 }
    }

    const formatPolicy = resolveExportFormatPolicy(targets.map((item) => ({ image: item.image })))
    const exportFormat = pickAvailableExportFormat(workbenchSettings.imageGroupExportFormat, formatPolicy.allowedFormats)

    updateStatusTask('export', { state: 'running', progress: 5, detail: '正在检查模板并准备导出到 Anki。' })

    let result: Awaited<ReturnType<typeof api.anki.importManualDrafts>>
    try {
      result = await api.anki.importManualDrafts({
        items: targets,
        imageFormat: exportFormat,
        imageQuality: quality,
        generationMode: workbenchSettings.cardGenerationMode,
        onProgress: ({ completed, total, label }) => {
          updateStatusTask('export', {
            state: 'running',
            progress: Math.max(10, Math.round((completed / total) * 100)),
            detail: `已处理 ${completed}/${total} 项，最近一项：${label}`,
          })
        },
      })
    } catch (error) {
      updateStatusTask('export', { state: 'error', progress: 100, detail: error instanceof Error ? error.message : '导出到 Anki 失败。' })
      throw error
    }

    const now = nowIso()
    const resultMap = new Map(result.results.map((entry) => [entry.draft_id, entry]))
    setDraftItems((current) =>
      current.map((item) => {
        const matched = resultMap.get(item.draft.id)
        if (!matched) return item
        return {
          ...item,
          draft: {
            ...item.draft,
            review_status: matched.ok ? 'imported' : item.draft.review_status,
            imported_note_id: matched.note_ids[0] ?? item.draft.imported_note_id,
            last_imported_at: matched.ok ? now : item.draft.last_imported_at,
            updated_at: now,
          },
        }
      }),
    )

    const successCount = result.results.filter((entry) => entry.ok).length
    const failedCount = result.results.length - successCount
    updateStatusTask('export', {
      state: failedCount > 0 ? 'error' : 'success',
      progress: 100,
      detail: failedCount > 0 ? `本次成功 ${successCount} 项，失败 ${failedCount} 项。` : `本次已成功导出 ${successCount} 项到 Anki。`,
    })
    if (successCount > 0) {
      toast.success('当前项目导出已完成', {
        description: failedCount > 0 ? `成功 ${successCount} 项，失败 ${failedCount} 项。` : `本次共成功写入 ${successCount} 项。`,
      })
      promptExportCleanup(result.results.filter((entry) => entry.ok).map((entry) => entry.draft_id))
    }
    if (failedCount > 0) {
      const firstFailed = result.results.find((entry) => !entry.ok)
      toast.error('部分图片导出失败', { description: firstFailed?.error || '请检查 AnkiConnect 设置后重试。' })
    }
    return { successCount, failedCount }
  }

  const exportDraftsToApkg = async (targets: DraftListItem[]) => {
    if (targets.length === 0) {
      updateStatusTask('export', { state: 'error', progress: 100, detail: '当前没有可导出的卡片。' })
      toast.error('当前没有可导出的卡片', { description: '先画出遮挡，再打开导出流程逐张确认牌组。' })
      return { successCount: 0, failedCount: 0 }
    }

    const formatPolicy = resolveExportFormatPolicy(targets.map((item) => ({ image: item.image })))
    const exportFormat = pickAvailableExportFormat(workbenchSettings.imageGroupExportFormat, formatPolicy.allowedFormats)

    updateStatusTask('export', { state: 'running', progress: 5, detail: '正在生成 APKG 卡包。' })

    try {
      const { exportDraftsAsApkg, shareOrDownloadApkg } = await import('@/lib/apkg-export')
      const { blob, fileName } = await exportDraftsAsApkg({
        items: targets,
        packageName: `anki-image-cloze-${new Date().toISOString().slice(0, 10)}`,
        imageFormat: exportFormat,
        imageQuality: quality,
        generationMode: workbenchSettings.cardGenerationMode,
        onProgress: ({ completed, total, label }) => {
          updateStatusTask('export', {
            state: 'running',
            progress: Math.max(10, Math.round((completed / total) * 100)),
            detail: `已处理 ${completed}/${total} 项，最近一项：${label}`,
          })
        },
      })

      const delivery = await shareOrDownloadApkg({
        blob,
        fileName,
        preferShare: deviceProfile.isMobileDevice,
        tryOpenAfterDownload: deviceProfile.isMobileDevice,
      })

      const now = nowIso()
      const exportedIds = new Set(targets.map((item) => item.draft.id))
      setDraftItems((current) =>
        current.map((item) =>
          exportedIds.has(item.draft.id)
            ? {
                ...item,
                draft: {
                  ...item.draft,
                  review_status: 'packaged',
                  updated_at: now,
                },
              }
            : item,
        ),
      )

      updateStatusTask('export', {
        state: 'success',
        progress: 100,
        detail:
          delivery === 'shared'
            ? `APKG 卡包已生成，并已打开分享面板。`
            : delivery === 'downloaded-open-attempted'
              ? `APKG 卡包已生成并开始下载，系统也已额外尝试打开它。`
              : `APKG 卡包已生成并开始下载。`,
      })
      toast.success('APKG 卡包已生成', {
        description:
          delivery === 'shared'
            ? '如果系统支持分享，你现在可以直接把卡包交给 Anki 应用。'
            : delivery === 'downloaded-open-attempted'
              ? '下载已经开始，网页也顺手试了一次唤起可接收这个卡包的应用。'
              : '下载完成后，可以手动用 Anki 或 AnkiDroid 导入。',
      })
      promptExportCleanup(targets.map((item) => item.draft.id))
      return { successCount: targets.length, failedCount: 0 }
    } catch (error) {
      updateStatusTask('export', { state: 'error', progress: 100, detail: error instanceof Error ? error.message : '生成 APKG 卡包失败。' })
      throw error
    }
  }

  const exportDraftsToImageGroup = async (targets: DraftListItem[]) => {
    if (targets.length === 0) {
      updateStatusTask('export', { state: 'error', progress: 100, detail: '当前没有可导出的卡片。' })
      toast.error('当前没有可导出的卡片', { description: '先画出遮挡，再打开导出流程逐张确认牌组。' })
      return { successCount: 0, failedCount: 0 }
    }

    const formatPolicy = resolveExportFormatPolicy(targets.map((item) => ({ image: item.image })))
    const exportFormat = pickAvailableExportFormat(workbenchSettings.imageGroupExportFormat, formatPolicy.allowedFormats)

    updateStatusTask('export', { state: 'running', progress: 5, detail: '正在整理纯图像组导出内容。' })

    try {
      const { exportDraftsAsImageGroup, shareOrDownloadFile } = await import('@/lib/image-group-export')
      const imageGroupFormatLabel = exportFormat === 'jpeg' ? 'JPG' : exportFormat.toUpperCase()
      const { blob, fileName } = await exportDraftsAsImageGroup({
        items: targets,
        imageFormat: exportFormat,
        imageQuality: workbenchSettings.imageGroupExportQuality,
        packageName: `anki-image-group-${new Date().toISOString().slice(0, 10)}`,
        generationMode: workbenchSettings.cardGenerationMode,
        onProgress: ({ completed, total, label }) => {
          updateStatusTask('export', {
            state: 'running',
            progress: Math.max(10, Math.round((completed / total) * 100)),
            detail: `已处理 ${completed}/${total} 项，最近一项：${label}`,
          })
        },
      })

      const delivery = await shareOrDownloadFile({
        blob,
        fileName,
        mimeType: 'application/zip',
        preferShare: deviceProfile.isMobileDevice,
      })

      const now = nowIso()
      const exportedIds = new Set(targets.map((item) => item.draft.id))
      setDraftItems((current) =>
        current.map((item) =>
          exportedIds.has(item.draft.id)
            ? {
                ...item,
                draft: {
                  ...item.draft,
                  review_status: 'packaged',
                  updated_at: now,
                },
              }
            : item,
        ),
      )

      updateStatusTask('export', {
        state: 'success',
        progress: 100,
        detail:
          delivery === 'shared'
            ? `纯图像组已生成，并已打开系统分享。`
            : `纯图像组压缩包已生成并开始下载。`,
      })
      toast.success('纯图像组已生成', {
        description:
          delivery === 'shared'
            ? `已按 ${imageGroupFormatLabel} 图片组打开系统分享。`
            : `已按 ${imageGroupFormatLabel} 图片组开始下载压缩包。`,
      })
      promptExportCleanup(targets.map((item) => item.draft.id))
      return { successCount: targets.length, failedCount: 0 }
    } catch (error) {
      updateStatusTask('export', { state: 'error', progress: 100, detail: error instanceof Error ? error.message : '生成纯图像组失败。' })
      throw error
    }
  }

  const exportDrafts = async (targets: DraftListItem[], destination: 'anki' | 'apkg' | 'image-group') => {
    if (destination === 'anki') {
      return importDraftsToAnki(targets)
    }
    if (destination === 'image-group') {
      return exportDraftsToImageGroup(targets)
    }
    return exportDraftsToApkg(targets)
  }

  const {
    exportDialogOpen,
    exportStage,
    exportIndex,
    reviewedDraftIds,
    deckInput,
    tagsInput,
    quality,
    setDeckInput,
    setTagsInput,
    setQuality,
    setExportStage,
    startExportFlow,
    handleExportDialogChange,
    confirmCurrentExportCard,
    saveCurrentExportCardDraft,
    goToPreviousExportCard,
    goToNextExportCard,
    selectExportCardWithAutoSave,
    exportAllFromFlow,
  } = useExportFlow({
    draftItems,
    exportQueue,
    selectedItem,
    loadingKey,
    patchDraft,
    exportDrafts,
    run,
  })

  useEffect(() => {
    if (settingsOpen) {
      setSettingsDialogRequested(true)
    }
  }, [settingsOpen])

  useEffect(() => {
    if (exportDialogOpen) {
      setExportDialogRequested(true)
    }
  }, [exportDialogOpen])

  const summary = useMemo(() => {
    const active = draftItems.filter((item) => !item.image.ignored)
    return {
      images: active.length,
      masks: active.reduce((sum, item) => sum + item.draft.masks.length, 0),
      groupedCards: active.reduce((sum, item) => {
        return sum + countGeneratedCards(item.draft, workbenchSettings.cardGenerationMode)
      }, 0),
      exported: active.filter((item) => item.draft.review_status === 'imported' || item.draft.review_status === 'packaged').length,
    }
  }, [draftItems, workbenchSettings.cardGenerationMode])
  const exportButtonLabel = useMemo(() => {
    if (exportQueue.length === 0) return '导出当前项目全部卡片'
    return exportQueue.length === summary.images ? '导出所有图片' : '导出所有已编辑图片'
  }, [exportQueue.length, summary.images])

  const manualGuide = useMemo(() => {
    if (summary.images === 0) {
      return {
        step: 'import' as const,
        hint: deviceProfile.isMobileLayout ? '先带入一批图片，下面会出现移动端图片列表。' : '先带入一批图片，左侧列表才会出现。',
        action: 'upload' as WorkspaceGuideAction,
        actionLabel: '上传图片',
      }
    }
    if (!selectedItem) {
      return {
        step: 'mask' as const,
        hint: deviceProfile.isMobileLayout ? '先从上方图片区选中一张图，再往下继续。' : '先从左侧选中一张图，再开始框选。',
        action: null as WorkspaceGuideAction,
        actionLabel: null,
      }
    }
    if (selectedItem.draft.masks.length === 0) {
      return {
        step: 'mask' as const,
        hint: deviceProfile.isMobileDevice ? '移动端请先进入聚焦编辑，再开始画遮罩。' : '直接在中间框出要挖空的区域，预览会马上跟着变化。',
        action: null as WorkspaceGuideAction,
        actionLabel: null,
      }
    }
    if (deviceProfile.canDirectAnki && (!ankiState.checked || !ankiState.ok)) {
      return {
        step: 'anki' as const,
        hint: (
          <>
            现在已经可以导出卡片了；如果你想一键写进本机 Anki，可以先检查
            <span className="mx-1 inline-flex">
              <InlineEmphasis onClick={() => setAnkiHelpOpen(true)}>AnkiConnect</InlineEmphasis>
            </span>
            直连状态。
          </>
        ),
        action: 'open-export' as WorkspaceGuideAction,
        actionLabel: '打开导出',
      }
    }
    return {
      step: 'export' as const,
      hint: deviceProfile.isMobileDevice ? (
        <>
          现在可以进入导出确认，生成
          <span className="mx-1 inline-flex">
            <InlineEmphasis hint="下载后可直接交给 AnkiDroid 打开。" touchOptimized>
              APKG
            </InlineEmphasis>
          </span>
          卡包或纯图像组；当前有 {exportQueue.length} 张图片已经就绪。
        </>
      ) : (
        <>现在可以进入导出确认，支持直连 Anki、APKG 或纯图像组；当前有 {exportQueue.length} 张图片已经就绪。</>
      ),
      action: 'open-export' as WorkspaceGuideAction,
      actionLabel: '打开导出',
    }
  }, [ankiState.checked, ankiState.ok, deviceProfile.canDirectAnki, deviceProfile.isMobileDevice, deviceProfile.isMobileLayout, exportQueue.length, selectedItem, summary.images])

  const runGuideAction = async (action: WorkspaceGuideAction) => {
    if (action === 'upload') {
      fileInputRef.current?.click()
      return
    }
    if (action === 'refresh-anki') {
      await run('refresh-anki', () => refreshAnkiConnection({ source: 'manual' }))
      return
    }
    if (action === 'open-export') {
      if (exportQueue.length === 0) {
        updateStatusTask('export', { state: 'error', progress: 100, detail: '当前还没有可以进入导出流程的图片。' })
      }
      startExportFlow()
    }
  }

  const selectPreviousDraft = () => {
    if (selectedDraftIndex <= 0) return
    const previousItem = activeDraftItems[selectedDraftIndex - 1]
    if (previousItem) {
      setSelectedDraftId(previousItem.draft.id)
    }
  }

  const selectNextDraft = () => {
    if (selectedDraftIndex < 0 || selectedDraftIndex >= activeDraftItems.length - 1) return
    const nextItem = activeDraftItems[selectedDraftIndex + 1]
    if (nextItem) {
      setSelectedDraftId(nextItem.draft.id)
    }
  }

  useEffect(() => {
    if (!ENABLE_STARTUP_SAMPLE) return
    if (!storageReady) return
    if (draftItems.some((item) => item.image.source_path === STARTUP_SAMPLE_PATH)) return

    let cancelled = false

    // 这段启动测试图逻辑先保留，但默认通过开关关闭。
    // 若后续需要重新启用，只改 ENABLE_STARTUP_SAMPLE 即可。
    const appendStartupSample = async () => {
      try {
        const sample = await buildDraftItemFromAsset(ankiHelpImage, '启动测试图.webp', STARTUP_SAMPLE_PATH)
        if (cancelled) {
          releaseDraftItems([sample])
          return
        }
        setDraftItems((current) => {
          if (current.some((item) => item.image.source_path === STARTUP_SAMPLE_PATH)) {
            releaseDraftItems([sample])
            return current
          }
          return mergeImportedItems(current, [sample])
        })
        setSelectedDraftId((current) => current ?? sample.draft.id)
      } catch {
        // 内置测试图不是主流程，不打断用户当前工作。
      }
    }

    void appendStartupSample()
    return () => {
      cancelled = true
    }
  }, [draftItems, storageReady])

  return (
    <MotionConfig reducedMotion={workbenchSettings.disableAnimations ? "always" : "user"}>
    <div 
      className="min-h-screen relative bg-[radial-gradient(circle_at_top_left,_rgba(148,163,184,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(255,255,255,0.7),_transparent_18%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] text-foreground"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >

      <input
        ref={fileInputRef}
        type="file"
        accept={MOBILE_IMAGE_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => void onFileInputChange(event)}
      />
      <input
        ref={fileManagerInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => void onFileManagerInputChange(event)}
      />
      <input
        ref={folderInputRef}
        type="file"
        accept={MOBILE_IMAGE_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => void onFolderInputChange(event)}
        {...({ webkitdirectory: '', directory: '' } as DirectoryInputProps)}
      />
      <input
        ref={deckPoolInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => void onDeckPoolBackupInputChange(event)}
      />

      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-4 py-4 md:px-6">
        <div className={!deviceProfile.isMobileDevice && editorHoverActive ? 'transition-[opacity,filter] duration-200 opacity-55 saturate-75' : 'transition-[opacity,filter] duration-200'}>
          <WorkbenchHeader
            workspaceMode={workspaceMode}
            onWorkspaceModeChange={setWorkspaceMode}
            manualGuide={manualGuide}
            loadingKey={loadingKey}
            onUploadImages={() => fileInputRef.current?.click()}
            onImportFiles={() => fileManagerInputRef.current?.click()}
            onImportFolder={() => folderInputRef.current?.click()}
            onRestoreProject={() => void run('restore-project', restoreSavedProject)}
            onRefreshAnki={() => void run('refresh-anki', () => refreshAnkiConnection({ source: 'manual' }))}
            onOptimizeProject={() => void run('optimize-project', optimizeCurrentProjectForSpeed)}
            onClearProject={() => setClearConfirmOpen(true)}
            onExportDeckPoolBackup={deviceProfile.isMobileDevice ? exportDeckPoolBackupFile : undefined}
            onImportDeckPoolBackup={deviceProfile.isMobileDevice ? () => deckPoolInputRef.current?.click() : undefined}
            onGuideAction={(action) => void runGuideAction(action)}
            showAnkiActions={deviceProfile.canDirectAnki}
            mobileOptimized={deviceProfile.isMobileDevice}
            ankiHelpOpen={ankiHelpOpen}
            onAnkiHelpOpenChange={setAnkiHelpOpen}
            onOpenAnkiHelp={() => setAnkiHelpOpen(true)}
            touchOptimized={deviceProfile.isTouchLike}
            settingsAction={(
              <Button
                size="icon-sm"
                variant="ghost"
                className="trs-all-400 rounded-xl text-muted-foreground hover:-translate-y-0.5 hover:text-foreground active:scale-[0.97]"
                onClick={() => {
                  setSettingsDialogRequested(true)
                  setSettingsOpen(true)
                }}
              >
                <Settings2Icon />
                <span className="sr-only">设置</span>
              </Button>
            )}
            showModeTabs={ENABLE_WORKSPACE_MODE_SWITCH}
            projectCompressionState={projectCompressionState}
            projectCompressionCount={projectCompressionCount}
          />
        </div>

        {showWorkspaceLoadingShell ? (
          <WorkspaceLoadingShell mobile={deviceProfile.isMobileLayout} />
        ) : (
          <div className="relative">
            {workspaceMode === 'pipeline' ? (
              <Suspense
                fallback={
                  <Card className="rounded-[28px] border border-border/70 bg-background/90 shadow-lg shadow-slate-900/5">
                    <CardContent className="flex flex-col gap-4 p-5 md:p-6">
                      <Skeleton className="h-7 w-44 rounded-full" />
                      <Skeleton className="h-4 w-full max-w-2xl rounded-full" />
                      <div className="grid gap-3 md:grid-cols-3">
                        <Skeleton className="h-28 w-full rounded-2xl" />
                        <Skeleton className="h-28 w-full rounded-2xl" />
                        <Skeleton className="h-28 w-full rounded-2xl" />
                      </div>
                    </CardContent>
                  </Card>
                }
              >
                <LazyPipelinePlaceholder />
              </Suspense>
            ) : deviceProfile.isMobileLayout ? (
              <div className="flex min-h-[calc(100vh-220px)] flex-col gap-4">
                <ManualDraftList
                  items={draftItems}
                  selectedDraftId={selectedItem?.draft.id ?? null}
                  onSelect={setSelectedDraftId}
                  onRemoveItem={removeDraftItem}
                  mobileLayout
                />
                <div className="min-h-0 rounded-2xl border border-border/70 bg-background/90 shadow-lg shadow-slate-900/5 backdrop-blur">
                    <ManualWorkspace
                      selectedItem={selectedItem}
                      onMasksCommit={commitMasks}
                      onCropCommit={commitCrop}
                      generationMode={workbenchSettings.cardGenerationMode}
                      focusShortcutEnabled={!exportDialogOpen}
                      onEditorHoverChange={setEditorHoverActive}
                      readOnlyInWorkspace={deviceProfile.isMobileDevice}
                      touchOptimized={deviceProfile.isTouchLike}
                      onPreviousItem={selectPreviousDraft}
                      onNextItem={selectNextDraft}
                      canGoPrevious={selectedDraftIndex > 0}
                      canGoNext={selectedDraftIndex >= 0 && selectedDraftIndex < activeDraftItems.length - 1}
                      isGlobalDragActive={isDragActive}
                    />
                </div>
              </div>
            ) : (
              <div ref={manualLayoutRef} className="h-[calc(100vh-220px)] min-h-[calc(100vh-220px)]">
                <ResizablePanelGroup
                  orientation="horizontal"
                  className="h-full min-h-[calc(100vh-220px)] rounded-2xl border border-border/70 bg-background/90 shadow-lg shadow-slate-900/5 backdrop-blur"
                  onLayoutChanged={(sizes) => {
                    if (Array.isArray(sizes) && sizes.length === 2) {
                      setManualPanelLayout((current) =>
                        current[0] === sizes[0] && current[1] === sizes[1] ? current : [sizes[0], sizes[1]],
                      )
                    }
                  }}
                >
                  <ResizablePanel defaultSize={resolvedManualPanelLayout[0]} minSize={manualProjectMinPercent} className="min-h-0">
                    <div
                      className={editorHoverActive ? 'h-full min-h-0 w-full transition-[opacity,filter] duration-200 opacity-55 saturate-75' : 'h-full min-h-0 w-full transition-[opacity,filter] duration-200'}
                    >
                      <ManualDraftList items={draftItems} selectedDraftId={selectedItem?.draft.id ?? null} onSelect={setSelectedDraftId} onRemoveItem={removeDraftItem} />
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={resolvedManualPanelLayout[1]} minSize={100 - Math.min(60, resolvedManualPanelLayout[0])} className="min-h-0">
                    <ManualWorkspace
                      selectedItem={selectedItem}
                      onMasksCommit={commitMasks}
                      onCropCommit={commitCrop}
                      generationMode={workbenchSettings.cardGenerationMode}
                      focusShortcutEnabled={!exportDialogOpen}
                      onEditorHoverChange={setEditorHoverActive}
                      onPreviousItem={selectPreviousDraft}
                      onNextItem={selectNextDraft}
                      canGoPrevious={selectedDraftIndex > 0}
                      canGoNext={selectedDraftIndex >= 0 && selectedDraftIndex < activeDraftItems.length - 1}
                      isGlobalDragActive={isDragActive}
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            )}

            <AnimatePresence>
              {showWorkspaceProcessingOverlay ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, pointerEvents: 'auto' }}
                  exit={{ opacity: 0, pointerEvents: 'none' }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl border border-border/60 bg-background/78 backdrop-blur-sm pointer-events-auto"
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="flex w-full max-w-xl flex-col gap-4 rounded-3xl border border-border/60 bg-background/96 p-5 shadow-xl shadow-slate-900/5 pointer-events-auto"
                  >
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-10 rounded-2xl" />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <Skeleton className="h-5 w-36 rounded-full" />
                        <div className="text-sm text-muted-foreground">{workspaceProcessingText}</div>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Skeleton className="h-28 w-full rounded-2xl" />
                      <Skeleton className="h-28 w-full rounded-2xl" />
                    </div>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )}

        <div className="px-1 pb-1 text-[11px] leading-5 text-muted-foreground/70">
          Web 本地处理。这是基于 React + Vite 的网页工具；图片只会进入当前浏览器内存，处理和导出都在你的设备上完成。支持安装到桌面或主屏。
        </div>
      </div>

      <ImportCompressionOverlay open={showImportCompressionOverlay} progress={importProgress} />
      <ProjectOptimizationOverlay open={loadingKey === 'optimize-project'} progress={optimizeProgress} />

      {settingsDialogRequested ? (
        <Suspense fallback={settingsOpen ? <DeferredDialogFallback title="正在打开设置" description="正在加载设置面板和本地预览。" /> : null}>
          <LazyWorkbenchSettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            settings={workbenchSettings}
            onSettingsChange={(next) => setWorkbenchSettings(normalizeWorkbenchSettings(next))}
            previewBlob={settingsPreviewItem?.image_blob ?? null}
            showTrigger={false}
          />
        </Suspense>
      ) : null}

      {!deviceProfile.isMobileDevice ? <StatusCapsule tasks={orderedStatusTasks} side="left" /> : null}

      {workspaceMode === 'manual' ? (
        <div className={deviceProfile.isMobileLayout ? 'pointer-events-none fixed inset-x-4 bottom-4 z-50' : 'pointer-events-none fixed right-4 bottom-4 z-50'}>
          <Button
            type="button"
            size="lg"
            className={deviceProfile.isMobileLayout ? 'pointer-events-auto h-12 w-full rounded-2xl shadow-lg shadow-slate-900/10 cursor-pointer overflow-hidden bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98] trs-all-400' : 'pointer-events-auto rounded-full shadow-lg shadow-slate-900/10 cursor-pointer overflow-hidden bg-foreground text-background hover:h-12 hover:px-4 hover:bg-foreground/90 hover:-translate-y-0.5 active:scale-[0.98] trs-all-400'}
            onClick={() => {
              if (exportQueue.length === 0) {
                updateStatusTask('export', { state: 'error', progress: 100, detail: '当前还没有可以进入导出流程的图片。' })
              }
              setExportDialogRequested(true)
              startExportFlow()
            }}
            disabled={exportQueue.length === 0}
          >
            <DownloadIcon data-icon="inline-start " />
            {exportButtonLabel}
            <span className="rounded-full bg-background/16 px-2 py-0.5 text-xs text-background">{exportQueue.length}</span>
          </Button>
        </div>
      ) : null}

      {exportDialogRequested ? (
        <ExportFlowDialog
          open={exportDialogOpen}
          onOpenChange={handleExportDialogChange}
          stage={exportStage}
          queue={exportQueue}
          currentIndex={exportIndex}
          reviewedDraftIds={reviewedDraftIds}
          deckInput={deckInput}
          tagsInput={tagsInput}
          onDeckInputChange={setDeckInput}
          onTagsInputChange={setTagsInput}
          deckOptions={deckOptions}
          deckQuickPicks={deckQuickPicks}
          ankiState={ankiState}
          onRefreshDecks={() => void run('refresh-anki', () => refreshAnkiConnection({ source: 'manual' }))}
          onCreateDeck={() => void run('create-deck', createCurrentDeckInAnki)}
          onConfirmCurrent={() => void run('confirm-export-card', confirmCurrentExportCard)}
          onPickDeckInBrowser={(deck) => void run('save-export-card-deck', async () => {
            setDeckInput(deck)
            await saveCurrentExportCardDraft({ deck })
          })}
          onPrevious={goToPreviousExportCard}
          onNext={goToNextExportCard}
          onSelectIndex={(index) => void run('switch-export-card', async () => {
            await selectExportCardWithAutoSave(index)
          })}
          onBackToReview={() => setExportStage('review')}
          quality={quality}
          onQualityChange={setQuality}
          onExportToAnki={() => void exportAllFromFlow('anki')}
          onExportToApkg={() => void exportAllFromFlow('apkg')}
          onExportToImageGroup={() => void exportAllFromFlow('image-group')}
          onMasksCommit={commitMasks}
          onCropCommit={commitCrop}
          isRefreshingDecks={loadingKey === 'refresh-anki' || ankiState.level === 'loading'}
          isCreatingDeck={loadingKey === 'create-deck'}
          isExportingAnki={loadingKey === 'manual-export-anki'}
          isExportingApkg={loadingKey === 'manual-export-apkg'}
          isExportingImageGroup={loadingKey === 'manual-export-image-group'}
          imageGroupFormat={workbenchSettings.imageGroupExportFormat}
          imageGroupQuality={workbenchSettings.imageGroupExportQuality}
          onImageGroupFormatChange={(value) =>
            setWorkbenchSettings((current) => normalizeWorkbenchSettings({ ...current, imageGroupExportFormat: value }))
          }
          onImageGroupQualityChange={(value) =>
            setWorkbenchSettings((current) => normalizeWorkbenchSettings({ ...current, imageGroupExportQuality: value }))
          }
          allowedExportFormats={exportFormatPolicy.allowedFormats}
          exportFormatLockReason={exportFormatPolicy.lockedReason}
          exportFormatSummary={exportFormatPolicy.summary}
          allowDirectAnki={deviceProfile.canDirectAnki}
          deckPickerMode={deviceProfile.canDirectAnki ? 'anki' : 'local'}
          touchOptimized={deviceProfile.isTouchLike}
          onOpenAnkiHelp={() => setAnkiHelpOpen(true)}
          generationMode={workbenchSettings.cardGenerationMode}
        />
      ) : null}

      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清空当前项目？</AlertDialogTitle>
            <AlertDialogDescription>
              这会移除当前浏览器里保存的图片、遮罩、牌组和标签信息。已经导出的内容不会受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>先不清空</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setClearConfirmOpen(false)
                void run('clear-project', clearLocalProject)
              }}
            >
              确认清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={hugeImportPrompt.open} onOpenChange={(open) => setHugeImportPrompt(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量导入文件？</AlertDialogTitle>
            <AlertDialogDescription>
              您一次性选中了 {hugeImportPrompt.files?.length} 个文件。大批量导入因为渲染和压缩处理可能会增加设备发热或导致浏览器暂时响应缓慢。<br/><br/>这完全取决于您的设备性能。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>暂不导入</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (hugeImportPrompt.files) {
                void ingestFiles(hugeImportPrompt.files, hugeImportPrompt.label)
              }
            }}>
              继续导入
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={slowSavePrompt.open}
        onOpenChange={(open) => setSlowSavePrompt((current) => ({ ...current, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>检测到本地保存开始变慢</AlertDialogTitle>
            <AlertDialogDescription>
              最近一次单张图片编辑后的本地保存大约用了 {slowSavePrompt.elapsedMs}ms。
              如果你感觉继续编辑开始变卡，可以直接把当前项目压到默认轻量档位。
            </AlertDialogDescription>
            <div className="text-xs leading-5 text-muted-foreground">
              当前项目已经压缩过 {slowSavePrompt.compressionCount} 次。
              {slowSavePrompt.compressionCount > 0 ? ' 已经压过后，这类提醒会比第一次更克制一些。' : ''}
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setSlowSavePrompt((current) => ({ ...current, open: false }))}
            >
              先不处理
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSlowSavePrompt({ open: false, elapsedMs: 0, itemCount: 0, compressionCount: projectCompressionCount })
                void run('optimize-project', optimizeCurrentProjectForSpeed)
              }}
            >
              立即压缩当前项目
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={exportCleanupPrompt.open}
        onOpenChange={(open) => {
          setExportCleanupPrompt((current) => ({ ...current, open }))
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>导出已完成，要清掉这批项目吗？</AlertDialogTitle>
            <AlertDialogDescription>
              这只会把当前浏览器里刚刚导出的图片从项目列表里移除，不会影响你已经生成的卡包、图像组或已经写进 Anki 的内容。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setExportCleanupPrompt({ open: false, draftIds: [] })}
            >
              先保留
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                removeDraftItemsByIds(exportCleanupPrompt.draftIds)
                setExportCleanupPrompt({ open: false, draftIds: [] })
                toast.success('已清掉刚刚导出的项目', { description: '当前浏览器里的项目列表已经同步收干净。' })
              }}
            >
              清掉已导出项目
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </MotionConfig>
  )
}
