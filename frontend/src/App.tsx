import {
  BadgeCheckIcon,
  DownloadIcon,
  Settings2Icon,
} from 'lucide-react'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, startTransition, type ChangeEvent, type InputHTMLAttributes } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { toast } from 'sonner'

import { LandingPage } from '@/components/landing/landing-page'
import { LandingBackground } from '@/components/landing/landing-background'
import {
  DeferredDialogFallback,
  ImportCompressionOverlay,
  ProjectOptimizationOverlay,
  WorkspaceLoadingShell,
  type ProcessingProgressView,
} from '@/components/app/app-support'
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
import { Card, CardContent } from '@/components/ui/card'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Skeleton } from '@/components/ui/skeleton'
import { useAnkiActions } from '@/hooks/use-anki-actions'
import { useExportActions } from '@/hooks/use-export-actions'
import { useExportFlow } from '@/hooks/use-export-flow'
import { useImportWorkflow } from '@/hooks/use-import-workflow'
import { useProjectPersistence } from '@/hooks/use-project-persistence'
import { useProjectOptimization } from '@/hooks/use-project-optimization'
import { useDeviceProfile } from '@/hooks/use-device-profile'
import { countGeneratedCards } from '@/lib/card-generation'
import { downloadDeckPoolBackup, loadDeckPool, loadDeckQuickPicks, readDeckPoolBackup, rememberDeckName, rememberDeckNames, saveDeckPool } from '@/lib/deck-pool'
import ankiHelpImage from '@/assets/ankiHelp-1.webp'
import { buildDraftItemFromAsset, mergeImportedItems, preferredWorkspaceMode } from '@/lib/manual-project'
import { releaseDraftItems } from '@/lib/project-store'
import {
  DEFAULT_WORKBENCH_SETTINGS,
  loadWorkbenchSettings,
  normalizeWorkbenchSettings,
  resolveExportFormatPolicy,
  saveWorkbenchSettings,
} from '@/lib/workbench-settings'
import { createInitialStatusTasks, EMPTY_ANKI_STATE, nowIso, replaceDraft, STATUS_TASK_ORDER, WORKSPACE_MODE_STORAGE_KEY } from '@/lib/workbench-state'
import type { AnkiConnectionState, CardDraft, DraftListItem, WorkspaceMode, WorkbenchSettings } from '@/types'

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
const SLOW_SAVE_THRESHOLD_MS = 120
const SLOW_SAVE_REPEAT_THRESHOLD_MS = 100
const SLOW_SAVE_REPEAT_TRIGGER_COUNT = 3
const AUTO_OPTIMIZE_MAX_DIMENSION = DEFAULT_WORKBENCH_SETTINGS.importMaxDimension
const AUTO_OPTIMIZE_QUALITY = DEFAULT_WORKBENCH_SETTINGS.importImageQuality / 100
const WORKBENCH_MAIN_DELAY_MS = 600
const WORKBENCH_INTRO_END_MS = 2200
const LANDING_BACKGROUND_UNMOUNT_DELAY_MS = 2000
const IMPORT_TRIGGER_SPINNER_RESET_MS = 180
const WORKBENCH_EASE_OUT = [0, 0.43, 0, 0.99] as const
const WORKBENCH_EASE_INOUT = [0.54, 0, 0, 0.99] as const
const MOBILE_PRIMARY_ACTION_TAP = {
  whileTap: { scale: 0.985, y: 2.5 },
  transition: { type: 'spring', stiffness: 520, damping: 30, mass: 0.28 },
} as const

type ProcessingProgress = ProcessingProgressView

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

const editorBarVariants = {
  hidden: { y: 100, opacity: 0 },
  visible: { 
    y: 0, 
      opacity: 1,
      transition: {
        delay: 1.4,
        duration: 1,
        ease: WORKBENCH_EASE_OUT,
      }
    }
}

const workbenchMainVariants = {
  hidden: { opacity: 0, y: 64 },
  visible: {
      opacity: 1,
      y: 0,
      transition: {
        delay: 0.8,
        duration: 1,
        ease: WORKBENCH_EASE_OUT,
      },
    },
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
  const [storageReady, setStorageReady] = useState(true)
  const [optimizeProgress, setOptimizeProgress] = useState<ProcessingProgress | null>(null)
  const [recoverableProjectSummary, setRecoverableProjectSummary] = useState<RecoverableProjectSummary | null>(null)
  const [statusTasks, setStatusTasks] = useState<Record<StatusTaskId, StatusTaskState>>(() => createInitialStatusTasks())
  const [projectCompressionCount, setProjectCompressionCount] = useState(0)
  const [ankiHelpOpen, setAnkiHelpOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workbenchSettings, setWorkbenchSettings] = useState<WorkbenchSettings>(() => loadWorkbenchSettings())
  const deckPoolInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const manualLayoutRef = useRef<HTMLDivElement | null>(null)
  const draftItemsRef = useRef<DraftListItem[]>([])
  const saveSequenceRef = useRef(0)
  const slowSavePromptShownRef = useRef(false)
  const slowSaveStrikeRef = useRef(0)
  const restorePromptToastIdRef = useRef<string | number | null>(null)
  const pendingImageEditSaveMetricRef = useRef<PendingImageEditSaveMetric | null>(null)
  const exportModulesPrefetchedRef = useRef(false)
  const [manualPanelLayout] = useState<[number, number]>(() => {
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
  const [workbenchIntroActive, setWorkbenchIntroActive] = useState(false)
  const [workbenchMainReady, setWorkbenchMainReady] = useState(true)
  const [landingIntroReady, setLandingIntroReady] = useState(false)
  const [shouldRenderLandingBackground, setShouldRenderLandingBackground] = useState(() => !loadWorkbenchSettings().disableAnimations)
  const [pendingImportTrigger, setPendingImportTrigger] = useState<'upload' | 'folder' | 'file-manager' | 'camera' | null>(null)
  const previousShowLandingRef = useRef(true)
  const importTriggerResetTimerRef = useRef<number | null>(null)

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
  const showLanding = draftItems.length === 0 && storageReady
  const suppressOverlayUi = showLanding || workbenchIntroActive
  const shouldRenderWorkbenchMain = workbenchMainReady || !workbenchIntroActive

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.overlaySuppressed = suppressOverlayUi ? '1' : '0'
    return () => {
      delete document.documentElement.dataset.overlaySuppressed
    }
  }, [suppressOverlayUi])

  useEffect(() => {
    if (showLanding) {
      previousShowLandingRef.current = true
      setWorkbenchIntroActive(false)
      setWorkbenchMainReady(true)
      return
    }

    if (!previousShowLandingRef.current) {
      setWorkbenchIntroActive(false)
      setWorkbenchMainReady(true)
      return
    }

    previousShowLandingRef.current = false
    setWorkbenchIntroActive(true)
    setWorkbenchMainReady(false)

    const mainTimer = window.setTimeout(() => setWorkbenchMainReady(true), WORKBENCH_MAIN_DELAY_MS)
    const endTimer = window.setTimeout(() => setWorkbenchIntroActive(false), WORKBENCH_INTRO_END_MS)

    return () => {
      window.clearTimeout(mainTimer)
      window.clearTimeout(endTimer)
    }
  }, [showLanding])

  useEffect(() => {
    if (!showLanding) {
      setLandingIntroReady(false)
      return
    }

    let frameA = 0
    let frameB = 0
    setLandingIntroReady(false)
    frameA = window.requestAnimationFrame(() => {
      frameB = window.requestAnimationFrame(() => {
        setLandingIntroReady(true)
      })
    })

    return () => {
      window.cancelAnimationFrame(frameA)
      window.cancelAnimationFrame(frameB)
    }
  }, [showLanding])

  useEffect(() => {
    if (workbenchSettings.disableAnimations) {
      setShouldRenderLandingBackground(false)
      if (import.meta.env.DEV) {
        console.info('[landing-bg] disabled by settings, unmounted immediately')
      }
      return
    }

    if (showLanding) {
      setShouldRenderLandingBackground(true)
      if (import.meta.env.DEV) {
        console.info('[landing-bg] mounted for landing')
      }
      return
    }

    if (import.meta.env.DEV) {
      console.info(`[landing-bg] scheduled unmount in ${LANDING_BACKGROUND_UNMOUNT_DELAY_MS}ms`)
    }

    const timer = window.setTimeout(() => {
      setShouldRenderLandingBackground(false)
      if (import.meta.env.DEV) {
        console.info('[landing-bg] unmounted after landing handoff')
      }
    }, LANDING_BACKGROUND_UNMOUNT_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [showLanding, workbenchSettings.disableAnimations])

  useEffect(() => {
    if (exportModulesPrefetchedRef.current) return
    if (exportDialogRequested) return
    if (showLanding || workbenchIntroActive || !shouldRenderWorkbenchMain) return
    if (activeDraftItems.length === 0) return

    const browserWindow = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
      cancelIdleCallback?: (handle: number) => void
    }

    const warmModules = () => {
      exportModulesPrefetchedRef.current = true
      setExportDialogRequested(true)
      void import('@/lib/apkg-export')
      void import('@/lib/image-group-export')
    }

    if (typeof browserWindow.requestIdleCallback === 'function') {
      const idleCallbackId = browserWindow.requestIdleCallback(() => {
        warmModules()
      }, { timeout: 1800 })

      return () => browserWindow.cancelIdleCallback?.(idleCallbackId)
    }

    const idleWindow = browserWindow.setTimeout(warmModules, 1200)
    return () => browserWindow.clearTimeout(idleWindow)
  }, [activeDraftItems.length, exportDialogRequested, showLanding, shouldRenderWorkbenchMain, workbenchIntroActive])

  const triggerImportPicker = useCallback(
    (kind: 'upload' | 'folder' | 'file-manager' | 'camera', action: () => void) => {
      setPendingImportTrigger(kind)
      action()
    },
    [],
  )

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
  const updateStatusTask = useCallback((taskId: StatusTaskId, patch: Partial<StatusTaskState>) => {
    setStatusTasks((current) => {
      const currentTask = current[taskId]
      const nextTask = {
        ...currentTask,
        ...patch,
      }

      if (
        nextTask.state === currentTask.state &&
        nextTask.progress === currentTask.progress &&
        nextTask.detail === currentTask.detail &&
        nextTask.label === currentTask.label
      ) {
        return current
      }

      return {
        ...current,
        [taskId]: nextTask,
      }
    })
  }, [])

  const { optimizeCurrentProjectForSpeed } = useProjectOptimization({
    autoOptimizeMaxDimension: AUTO_OPTIMIZE_MAX_DIMENSION,
    autoOptimizeQuality: AUTO_OPTIMIZE_QUALITY,
    draftItemsRef,
    selectedCompressionCount: projectCompressionCount,
    setDraftItems,
    setProjectCompressionCount,
    setOptimizeProgress,
    setSlowSavePrompt,
    slowSavePromptShownRef,
    slowSaveStrikeRef,
    pendingImageEditSaveMetricRef,
    updateStatusTask,
  })

  const dismissAnkiHelpPrompt = useCallback(() => {
    setAnkiHelpPromptDismissed(true)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ANKI_HELP_PROMPT_DISMISSED_KEY, '1')
    }
  }, [])

  const dismissRestoreProjectPrompt = useCallback(() => {
    if (restorePromptToastIdRef.current !== null) {
      const toastId = restorePromptToastIdRef.current
      restorePromptToastIdRef.current = null
      queueMicrotask(() => {
        toast.dismiss(toastId)
      })
    }
  }, [])

  const {
    fileInputRef,
    fileManagerInputRef,
    folderInputRef,
    isImportingFiles,
    importingLabel,
    importProgress,
    isDragActive,
    hugeImportPrompt,
    setHugeImportPrompt,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    onFileInputChange,
    onFolderInputChange,
    onFileManagerInputChange,
    confirmHugeImport,
    safeIngestFiles,
  } = useImportWorkflow({
    workbenchSettings,
    setDraftItems,
    setSelectedDraftId,
    setWorkspaceMode,
    setRecoverableProjectSummary,
    setProjectCompressionCount,
    setSlowSavePrompt,
    dismissRestoreProjectPrompt,
    updateStatusTask,
    slowSavePromptShownRef,
    slowSaveStrikeRef,
    pendingImageEditSaveMetricRef,
  })

  useEffect(() => {
    if (!isImportingFiles) return
    setPendingImportTrigger(null)
  }, [isImportingFiles])

  useEffect(() => {
    if (!pendingImportTrigger || typeof window === 'undefined') return

    const scheduleClearPending = () => {
      if (!isImportingFiles) {
        importTriggerResetTimerRef.current = window.setTimeout(() => {
          setPendingImportTrigger((current) => (current ? null : current))
          importTriggerResetTimerRef.current = null
        }, IMPORT_TRIGGER_SPINNER_RESET_MS)
      }
    }

    window.addEventListener('focus', scheduleClearPending, { once: true })

    return () => {
      window.removeEventListener('focus', scheduleClearPending)
      if (importTriggerResetTimerRef.current !== null) {
        window.clearTimeout(importTriggerResetTimerRef.current)
        importTriggerResetTimerRef.current = null
      }
    }
  }, [pendingImportTrigger, isImportingFiles])

  const showWorkspaceLoadingShell = !storageReady
  const showWorkspaceProcessingOverlay = isImportingFiles || loadingKey === 'restore-project'
  const showImportCompressionOverlay = isImportingFiles && workbenchSettings.importCompressionEnabled
  const workspaceProcessingText =
    isImportingFiles
      ? `${importingLabel}，正在处理图片和预览。`
      : '正在恢复你上次保存在浏览器里的项目。'

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

  const { refreshAnkiConnection, createCurrentDeckInAnki } = useAnkiActions({
    canDirectAnki: deviceProfile.canDirectAnki,
    setAnkiState,
    setDeckPool,
    setDeckQuickPicks,
    updateStatusTask,
    onNeedHelpPrompt: promptAnkiHelpOnFirstFailure,
  })

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
    if (!hasPendingExitGuard || typeof window === 'undefined') return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasPendingExitGuard])

  const run = useCallback(async (key: string, action: () => Promise<void>) => {
    setLoadingKey(key)
    try {
      await action()
    } catch (error) {
      toast.error('操作失败', { description: error instanceof Error ? error.message : '请稍后再试。' })
    } finally {
      setLoadingKey(null)
    }
  }, [])

  const replaceAllItems = useCallback((items: DraftListItem[], nextSelectedDraftId?: string | null) => {
    releaseDraftItems(draftItemsRef.current)
    slowSavePromptShownRef.current = false
    slowSaveStrikeRef.current = 0
    pendingImageEditSaveMetricRef.current = null
    dismissRestoreProjectPrompt()
    setRecoverableProjectSummary(null)
    setSlowSavePrompt({ open: false, elapsedMs: 0, itemCount: 0, compressionCount: 0 })
    setDraftItems(items)
    setSelectedDraftId(nextSelectedDraftId ?? items[0]?.draft.id ?? null)
  }, [dismissRestoreProjectPrompt])

  const handleRestorePromptReady = useCallback((saved: RecoverableProjectSummary, restoreAction: () => Promise<void>) => {
    void saved
    void restoreAction
    return

    // 如果没有项目（在首屏），则不主动弹窗
    if (draftItemsRef.current.length === 0) return

    const savedAtLabel = new Date(saved.savedAt).toLocaleString('zh-CN', { hour12: false })
    queueMicrotask(() => {
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
            void run('restore-project', restoreAction)
          },
        },
        cancel: {
          label: '稍后再说',
          onClick: dismissRestoreProjectPrompt,
        },
      })
    })
  }, [dismissRestoreProjectPrompt, run])

  const { restoreSavedProject, clearLocalProject } = useProjectPersistence({
    draftItems,
    selectedDraftId,
    workspaceMode,
    loadingKey,
    projectCompressionCount,
    storageReady,
    recoverableProjectSummary,
    setStorageReady,
    setRecoverableProjectSummary,
    setProjectCompressionCount,
    setDraftItems,
    setSelectedDraftId,
    setWorkspaceMode,
    setSlowSavePrompt,
    dismissRestoreProjectPrompt,
    restorePromptToastIdRef,
    saveSequenceRef,
    slowSavePromptShownRef,
    slowSaveStrikeRef,
    pendingImageEditSaveMetricRef,
    draftItemsRef,
    slowSaveThresholdMs: SLOW_SAVE_THRESHOLD_MS,
    slowSaveRepeatThresholdMs: SLOW_SAVE_REPEAT_THRESHOLD_MS,
    slowSaveRepeatTriggerCount: SLOW_SAVE_REPEAT_TRIGGER_COUNT,
    updateStatusTask,
    replaceAllItems,
    onRestorePromptReady: handleRestorePromptReady,
  })

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

  const { exportDrafts } = useExportActions({
    setDraftItems,
    workbenchSettings,
    deviceProfile,
    updateStatusTask,
  })

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

  const {
    exportDialogOpen,
    exportStage,
    exportIndex,
    reviewedDraftIds,
    deckInput,
    tagsInput,
    quality,
    exportCleanupDraftIds,
    lastExportDestination,
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
    dismissExportSuccess,
    clearExportedDraftsAndClose,
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

  useEffect(() => {
    if (!exportDialogOpen) return
    setSlowSavePrompt((current) => (current.open ? { ...current, open: false } : current))
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
        className={showLanding ? "relative min-h-screen overflow-hidden text-foreground bg-[#f8fafc]" : "relative min-h-screen text-foreground bg-[#f8fafc]"}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {!workbenchSettings.disableAnimations && shouldRenderLandingBackground ? (
          <LandingBackground introReady={landingIntroReady} workbenchShifted={!showLanding} />
        ) : null}
        <AnimatePresence mode="popLayout">
          {showLanding ? (
            <motion.div 
              key="landing" 
              className="w-full"
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
            >
              <LandingPage 
                onIngest={safeIngestFiles}
                onRestore={() => run('restore-project', restoreSavedProject)}
                isImporting={isImportingFiles || loadingKey === 'restore-project'}
                recoverableSummary={recoverableProjectSummary}
                introReady={landingIntroReady}
                mobileOptimized={deviceProfile.isMobileDevice}
                onCapturePhoto={deviceProfile.canReliableCameraCapture ? () => triggerImportPicker('camera', () => cameraInputRef.current?.click()) : undefined}
                onImportFiles={() => triggerImportPicker('file-manager', () => fileManagerInputRef.current?.click())}
              />
            </motion.div>
          ) : (
            <motion.div
              key="workbench"
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
              className="w-full relative"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, ease: WORKBENCH_EASE_INOUT }}
                className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(148,163,184,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(255,255,255,0.7),_transparent_18%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] pointer-events-none"
              />
              <div className={deviceProfile.isMobileLayout ? 'relative z-10 mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-4 py-4 pb-24 md:px-6' : 'relative z-10 mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-4 py-4 md:px-6'}>
                <div
                  className={!deviceProfile.isMobileDevice && editorHoverActive ? 'transition-[opacity,filter] duration-200 opacity-55 saturate-75' : 'transition-[opacity,filter] duration-200'}
                >
                  <WorkbenchHeader
                    workspaceMode={workspaceMode}
                    onWorkspaceModeChange={setWorkspaceMode}
                    manualGuide={manualGuide}
                    loadingKey={loadingKey}
                    onUploadImages={() => triggerImportPicker('upload', () => fileInputRef.current?.click())}
                    onCapturePhoto={deviceProfile.canReliableCameraCapture ? () => triggerImportPicker('camera', () => cameraInputRef.current?.click()) : undefined}
                    onImportFiles={() => triggerImportPicker('file-manager', () => fileManagerInputRef.current?.click())}
                    onImportFolder={() => triggerImportPicker('folder', () => folderInputRef.current?.click())}
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
                    uploadTriggerPending={pendingImportTrigger === 'upload'}
                    folderTriggerPending={pendingImportTrigger === 'folder'}
                    fileManagerTriggerPending={pendingImportTrigger === 'file-manager'}
                    cameraTriggerPending={pendingImportTrigger === 'camera'}
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
                ) : !shouldRenderWorkbenchMain ? null : (
                  <motion.div
                    variants={workbenchMainVariants}
                    initial="hidden"
                    animate="visible"
                    className="relative"
                  >
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
                        <motion.div
                          initial={{ opacity: 0, y: 26 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.8, duration: 1, ease: WORKBENCH_EASE_OUT }}
                          className="will-change-[opacity,transform]"
                        >
                          <ManualDraftList
                            items={draftItems}
                            selectedDraftId={selectedItem?.draft.id ?? null}
                            onSelect={setSelectedDraftId}
                            onRemoveItem={removeDraftItem}
                            mobileLayout
                          />
                        </motion.div>
                        <motion.div
                          initial={{ opacity: 0, y: 26 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 1.05, duration: 1, ease: WORKBENCH_EASE_OUT }}
                          className="min-h-0 rounded-2xl border border-border/70 bg-background/90 shadow-lg shadow-slate-900/5 backdrop-blur will-change-[opacity,transform]"
                        >
                          <ManualWorkspace
                            selectedItem={selectedItem}
                            onMasksCommit={commitMasks}
                            onCropCommit={commitCrop}
                            generationMode={workbenchSettings.cardGenerationMode}
                            focusShortcutEnabled={!exportDialogOpen}
                            onEditorHoverChange={setEditorHoverActive}
                            readOnlyInWorkspace={deviceProfile.isMobileDevice}
                            touchOptimized={deviceProfile.isTouchLike}
                            workbenchSettings={workbenchSettings}
                            onWorkbenchSettingsChange={(next) => setWorkbenchSettings(normalizeWorkbenchSettings(next))}
                            onPreviousItem={selectPreviousDraft}
                            onNextItem={selectNextDraft}
                            canGoPrevious={selectedDraftIndex > 0}
                            canGoNext={selectedDraftIndex >= 0 && selectedDraftIndex < activeDraftItems.length - 1}
                            isGlobalDragActive={isDragActive}
                            shortcutOverlayReady={!workbenchIntroActive}
                            modernFloatingToolbar={workbenchSettings.modernFloatingToolbar}
                          />
                        </motion.div>
                      </div>
                    ) : (
                      <div ref={manualLayoutRef} className="h-[calc(100vh-220px)] min-h-[calc(100vh-220px)]">
                        <ResizablePanelGroup
                          orientation="horizontal"
                          className="h-full min-h-[calc(100vh-220px)] rounded-2xl border border-border/70 bg-background/90 shadow-lg shadow-slate-900/5 backdrop-blur"
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
                              workbenchSettings={workbenchSettings}
                              onWorkbenchSettingsChange={(next) => setWorkbenchSettings(normalizeWorkbenchSettings(next))}
                              onPreviousItem={selectPreviousDraft}
                              onNextItem={selectNextDraft}
                              canGoPrevious={selectedDraftIndex > 0}
                              canGoNext={selectedDraftIndex >= 0 && selectedDraftIndex < activeDraftItems.length - 1}
                              isGlobalDragActive={isDragActive}
                              shortcutOverlayReady={!workbenchIntroActive}
                              modernFloatingToolbar={workbenchSettings.modernFloatingToolbar}
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
                  </motion.div>
                )}

                {deviceProfile.isMobileLayout ? (
                  shouldRenderWorkbenchMain ? (
                    <motion.div
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.4, duration: 0.8, ease: WORKBENCH_EASE_OUT }}
                      className="flex flex-col gap-1 px-1 pb-1 text-[11px] leading-5 text-muted-foreground/72 will-change-[opacity,transform]"
                    >
                      <div className="flex items-start gap-1.5">
                        <BadgeCheckIcon className="mt-[1px] size-3.5 shrink-0 text-muted-foreground/65" />
                        <span>Web 加载处理库，图片只在当前设备本地处理。</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <BadgeCheckIcon className="mt-[1px] size-3.5 shrink-0 text-muted-foreground/65" />
                        <span>支持 PWA，可安装到桌面或主屏。</span>
                      </div>
                    </motion.div>
                  ) : null
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.4, duration: 0.8, ease: WORKBENCH_EASE_OUT }}
                    className="px-1 pb-1 text-[11px] leading-5 text-muted-foreground/70 will-change-[opacity,transform]"
                  >
                    Web 本地处理。这是基于 React + Vite 的网页工具；图片只会进入当前浏览器内存，处理和导出都在你的设备上完成。支持安装到桌面或主屏。
                  </motion.div>
                )}
              </div>

              {!deviceProfile.isMobileDevice && !suppressOverlayUi ? <StatusCapsule tasks={orderedStatusTasks} side="left" /> : null}

              {workspaceMode === 'manual' ? (
                shouldRenderWorkbenchMain ? (
                  <motion.div 
                    variants={editorBarVariants}
                    initial={workbenchIntroActive ? "hidden" : false}
                    animate="visible"
                    className={deviceProfile.isMobileLayout ? 'pointer-events-none fixed inset-x-4 bottom-4 z-50' : 'pointer-events-none fixed right-4 bottom-4 z-50'}
                  >
                    <motion.div
                      className={deviceProfile.isMobileLayout ? 'w-full' : 'contents'}
                      {...(deviceProfile.isMobileLayout ? MOBILE_PRIMARY_ACTION_TAP : {})}
                    >
                      <Button
                        type="button"
                        size="lg"
                        className={deviceProfile.isMobileLayout ? 'pointer-events-auto h-12 w-full rounded-2xl shadow-lg shadow-slate-900/10 cursor-pointer overflow-hidden bg-foreground text-background hover:bg-foreground/90 trs-all-400' : 'pointer-events-auto rounded-full shadow-lg shadow-slate-900/10 cursor-pointer overflow-hidden bg-foreground text-background hover:h-12 hover:px-4 hover:bg-foreground/90 hover:-translate-y-0.5 active:scale-[0.98] trs-all-400'}
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
                    </motion.div>
                  </motion.div>
                ) : null
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>

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
          ref={cameraInputRef}
          type="file"
          accept={MOBILE_IMAGE_ACCEPT}
          capture="environment"
          className="hidden"
          onChange={(event) => void onFileInputChange(event)}
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
            onCreateDeck={() => void run('create-deck', () => createCurrentDeckInAnki(deckInput))}
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
            workbenchSettings={workbenchSettings}
            onWorkbenchSettingsChange={(next) => setWorkbenchSettings(normalizeWorkbenchSettings(next))}
            exportedDraftIds={exportCleanupDraftIds}
            lastExportDestination={lastExportDestination}
            onKeepExportedItems={dismissExportSuccess}
            onClearExportedItems={() => {
              const draftIds = clearExportedDraftsAndClose()
              removeDraftItemsByIds(draftIds)
              toast.success('已清掉刚刚导出的项目', { description: '当前浏览器里的项目列表已经同步收干净。' })
            }}
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

        <AlertDialog open={hugeImportPrompt.open} onOpenChange={(open) => setHugeImportPrompt((prev) => ({ ...prev, open }))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认批量导入文件？</AlertDialogTitle>
              <AlertDialogDescription>
                您一次性选中了 {hugeImportPrompt.files?.length} 个文件。大批量导入因为渲染和压缩处理可能会增加设备发热或导致浏览器暂时响应缓慢。<br/><br/>这完全取决于您的设备性能。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>暂不导入</AlertDialogCancel>
              <AlertDialogAction onClick={() => void confirmHugeImport()}>
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

      </div>
    </MotionConfig>
  )
}
