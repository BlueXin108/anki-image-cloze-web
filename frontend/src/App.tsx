import {
  DownloadIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react'
import { toast } from 'sonner'

import { ExportFlowDialog } from '@/components/workbench/export-flow-dialog'
import { InlineEmphasis } from '@/components/workbench/inline-emphasis'
import { ManualDraftList } from '@/components/workbench/manual-draft-list'
import { PipelinePlaceholder } from '@/components/workbench/pipeline-placeholder'
import { StatusCapsule, type StatusTaskId, type StatusTaskState } from '@/components/workbench/status-capsule'
import { ManualWorkspace } from '@/components/workbench/manual-workspace'
import { WorkbenchHeader, type WorkspaceGuideAction } from '@/components/workbench/workbench-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useExportFlow } from '@/hooks/use-export-flow'
import { useDeviceProfile } from '@/hooks/use-device-profile'
import { api } from '@/lib/api'
import { exportDraftsAsApkg, shareOrDownloadApkg } from '@/lib/apkg-export'
import { downloadDeckPoolBackup, loadDeckPool, loadDeckQuickPicks, readDeckPoolBackup, rememberDeckName, rememberDeckNames, saveDeckPool } from '@/lib/deck-pool'
import ankiHelpImage from '@/assets/ankiHelp-1.webp'
import { buildDraftItemFromAsset, buildDraftItemsFromFiles, mergeImportedItems, preferredWorkspaceMode } from '@/lib/manual-project'
import { releaseDraftItems } from '@/lib/project-store'
import { ankiLoadingState, classifyAnkiFailure, createInitialStatusTasks, EMPTY_ANKI_STATE, nowIso, replaceDraft, STATUS_TASK_ORDER, WORKSPACE_MODE_STORAGE_KEY } from '@/lib/workbench-state'
import type { AnkiConnectionState, CardDraft, DraftListItem, WorkspaceMode } from '@/types'

type DirectoryInputProps = InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory?: string
  directory?: string
}

const MANUAL_PROJECT_MIN_SIZE = 340
const STARTUP_SAMPLE_PATH = '内置示例/启动测试图.png'
const MOBILE_IMAGE_ACCEPT = 'image/*'
const ANKI_HELP_PROMPT_DISMISSED_KEY = 'anki-cloze:anki-help-prompt-dismissed'

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
  const [statusTasks, setStatusTasks] = useState<Record<StatusTaskId, StatusTaskState>>(() => createInitialStatusTasks())
  const [ankiHelpOpen, setAnkiHelpOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const fileManagerInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const deckPoolInputRef = useRef<HTMLInputElement | null>(null)
  const draftItemsRef = useRef<DraftListItem[]>([])
  const saveSequenceRef = useRef(0)
  const ankiHelpPromptedRef = useRef(false)
  const manualLayoutRef = useRef<HTMLDivElement | null>(null)
  const [manualLayoutWidth, setManualLayoutWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : Math.max(window.innerWidth - 80, MANUAL_PROJECT_MIN_SIZE),
  )
  const [ankiHelpPromptDismissed, setAnkiHelpPromptDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(ANKI_HELP_PROMPT_DISMISSED_KEY) === '1'
  })

  const selectedItem = useMemo(
    () => draftItems.find((item) => item.draft.id === selectedDraftId) ?? draftItems[0] ?? null,
    [draftItems, selectedDraftId],
  )
  const activeDraftItems = useMemo(() => draftItems.filter((item) => !item.image.ignored), [draftItems])
  const selectedDraftIndex = useMemo(
    () => activeDraftItems.findIndex((item) => item.draft.id === selectedItem?.draft.id),
    [activeDraftItems, selectedItem?.draft.id],
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

  const orderedStatusTasks = useMemo(
    () => STATUS_TASK_ORDER.filter((taskId) => deviceProfile.canDirectAnki || taskId !== 'anki').map((taskId) => statusTasks[taskId]),
    [deviceProfile.canDirectAnki, statusTasks],
  )
  const showWorkspaceLoadingShell = !storageReady
  const showWorkspaceProcessingOverlay = isImportingFiles || loadingKey === 'restore-project'
  const workspaceProcessingText = isImportingFiles ? `${importingLabel}，正在处理图片和预览。` : '正在恢复你上次保存在浏览器里的项目。'
  const manualProjectPanelPercent = useMemo(() => {
    const nextPercent = (MANUAL_PROJECT_MIN_SIZE / Math.max(manualLayoutWidth, MANUAL_PROJECT_MIN_SIZE)) * 100
    return Number(Math.max(18, Math.min(38, nextPercent)).toFixed(2))
  }, [manualLayoutWidth])

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

  const promptAnkiHelpOnFirstFailure = useCallback(() => {
    if (deviceProfile.isMobileDevice || ankiHelpPromptDismissed || ankiHelpPromptedRef.current) return

    ankiHelpPromptedRef.current = true
    toast('是否已安装 AnkiConnect？', {
      description: '它可以提供牌组直连服务；如果你只想导出 APKG，可以忽略这一步。',
      duration: Infinity,
      action: {
        label: 'AnkiConnect',
        onClick: () => {
          dismissAnkiHelpPrompt()
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
    if (workspaceMode !== 'manual') return
    const container = manualLayoutRef.current
    if (!container) return

    const measure = () => {
      setManualLayoutWidth(Math.max(container.clientWidth, MANUAL_PROJECT_MIN_SIZE))
    }

    measure()
    const observer = new ResizeObserver(() => {
      measure()
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [workspaceMode])

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
    let cancelled = false

    const restore = async () => {
      updateStatusTask('restore', { state: 'running', progress: 20, detail: '正在检查浏览器里是否有上次保存的项目。' })
      try {
        const saved = await api.projectStore.loadProject()
        if (cancelled) return
        if (!saved) {
          updateStatusTask('restore', { state: 'idle', progress: 0, detail: '当前浏览器里还没有可恢复的项目。' })
          return
        }
        setDraftItems(saved.items)
        setSelectedDraftId(saved.selectedDraftId ?? saved.items[0]?.draft.id ?? null)
        setWorkspaceMode(preferredWorkspaceMode(saved.workspaceMode))
        updateStatusTask('restore', { state: 'success', progress: 100, detail: `已恢复 ${saved.items.length} 张图片的本地项目。` })
        if (saved.items.length > 0) {
          toast.success('已恢复上次的本地项目', { description: `共恢复 ${saved.items.length} 张图片。` })
        }
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
    }
  }, [])

  useEffect(() => {
    if (!storageReady) return
    const sequence = ++saveSequenceRef.current
    const handle = window.setTimeout(() => {
      void (async () => {
        updateStatusTask('save', {
          state: 'running',
          progress: 35,
          detail: draftItems.length > 0 ? `正在保存 ${draftItems.length} 张图片的当前进度。` : '正在同步浏览器里的空项目状态。',
        })

        try {
          if (draftItems.length === 0) {
            await api.projectStore.clearProject()
          } else {
            await api.projectStore.saveProject({ items: draftItems, selectedDraftId, workspaceMode })
          }

          if (saveSequenceRef.current !== sequence) return
          updateStatusTask('save', {
            state: 'success',
            progress: 100,
            detail: draftItems.length > 0 ? `最近一次自动保存已完成，共 ${draftItems.length} 张图片。` : '当前浏览器里没有待保存的项目。',
          })
        } catch (error) {
          if (saveSequenceRef.current !== sequence) return
          updateStatusTask('save', { state: 'error', progress: 100, detail: error instanceof Error ? error.message : '浏览器本地保存失败。' })
          toast.error('浏览器本地保存失败', { description: error instanceof Error ? error.message : '请检查当前浏览器是否允许本地存储。' })
        }
      })()
    }, 1600)
    return () => window.clearTimeout(handle)
  }, [draftItems, selectedDraftId, storageReady, workspaceMode])

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

  const replaceAllItems = (items: DraftListItem[], nextSelectedDraftId?: string | null) => {
    releaseDraftItems(draftItemsRef.current)
    setDraftItems(items)
    setSelectedDraftId(nextSelectedDraftId ?? items[0]?.draft.id ?? null)
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
        if (options?.source === 'startup') {
          promptAnkiHelpOnFirstFailure()
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
      if (options?.source === 'startup') {
        promptAnkiHelpOnFirstFailure()
      }
      if (options?.source === 'manual' || options?.source === 'create-deck') {
        throw error
      }
    }
  }

  const restoreSavedProject = async () => {
    updateStatusTask('restore', { state: 'running', progress: 25, detail: '正在读取你上次保存在浏览器里的项目。' })
    try {
      const saved = await api.projectStore.loadProject()
      if (!saved) {
        updateStatusTask('restore', { state: 'idle', progress: 0, detail: '当前浏览器里没有可恢复的项目。' })
        toast.error('当前没有可恢复的本地项目', { description: '先导入图片并编辑一次，浏览器才会保存这份项目。' })
        return
      }
      replaceAllItems(saved.items, saved.selectedDraftId)
      setWorkspaceMode(preferredWorkspaceMode(saved.workspaceMode))
      updateStatusTask('restore', { state: 'success', progress: 100, detail: `已恢复 ${saved.items.length} 张图片的本地项目。` })
      toast.success('已恢复上次的本地项目', { description: `共恢复 ${saved.items.length} 张图片。` })
    } catch (error) {
      updateStatusTask('restore', { state: 'error', progress: 100, detail: error instanceof Error ? error.message : '本地项目恢复失败。' })
      throw error
    }
  }

  const clearLocalProject = async () => {
    if (!window.confirm('这会清空当前浏览器里的项目数据和图片缓存，确定继续吗？')) return
    releaseDraftItems(draftItemsRef.current)
    draftItemsRef.current = []
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
    const loadingToastId = toast.loading(`${sourceLabel}处理中`, {
      description: '正在整理图片并加入列表，请稍等一下。',
    })
    updateStatusTask('files', { state: 'running', progress: 5, detail: `正在整理 ${sourceLabel} 里的图片。` })

    try {
      const items = await buildDraftItemsFromFiles(files, {
        onProgress: ({ completed, total, fileName }) => {
          updateStatusTask('files', {
            state: 'running',
            progress: Math.max(5, Math.round((completed / total) * 100)),
            detail: `正在处理 ${fileName}（${completed}/${total}）。`,
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
    }
  }

  const onFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    await ingestFiles(files, '图片上传')
    event.target.value = ''
  }

  const onFolderInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    await ingestFiles(files, '文件夹导入')
    event.target.value = ''
  }

  const onFileManagerInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    await ingestFiles(files, '文件管理器导入')
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

  const commitMasks = useCallback(async (masks: CardDraft['masks']) => {
    if (!selectedItem) return
    const nextDraft: CardDraft = { ...selectedItem.draft, masks, updated_at: nowIso() }
    setDraftItems((current) => replaceDraft(current, nextDraft))
  }, [selectedItem])

  const commitCrop = useCallback(async (bbox: [number, number, number, number]) => {
    if (!selectedItem) return
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

    updateStatusTask('export', { state: 'running', progress: 5, detail: '正在检查模板并准备导出到 Anki。' })

    let result: Awaited<ReturnType<typeof api.anki.importManualDrafts>>
    try {
      result = await api.anki.importManualDrafts({
        items: targets,
        webpQuality: quality,
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

    updateStatusTask('export', { state: 'running', progress: 5, detail: '正在生成 APKG 卡包。' })

    try {
      const { blob, fileName } = await exportDraftsAsApkg({
        items: targets,
        packageName: `anki-image-cloze-${new Date().toISOString().slice(0, 10)}`,
        imageQuality: quality,
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
      return { successCount: targets.length, failedCount: 0 }
    } catch (error) {
      updateStatusTask('export', { state: 'error', progress: 100, detail: error instanceof Error ? error.message : '生成 APKG 卡包失败。' })
      throw error
    }
  }

  const exportDrafts = async (targets: DraftListItem[], destination: 'anki' | 'apkg') => {
    if (destination === 'anki') {
      return importDraftsToAnki(targets)
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
    goToPreviousExportCard,
    goToNextExportCard,
    goToExportCard,
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

  const summary = useMemo(() => {
    const active = draftItems.filter((item) => !item.image.ignored)
    return {
      images: active.length,
      masks: active.reduce((sum, item) => sum + item.draft.masks.length, 0),
      groupedCards: active.reduce((sum, item) => {
        const groups = new Set(item.draft.masks.map((mask) => mask.card_group_id || mask.id))
        return sum + groups.size
      }, 0),
      exported: active.filter((item) => item.draft.review_status === 'imported' || item.draft.review_status === 'packaged').length,
    }
  }, [draftItems])

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
          卡包；当前有 {exportQueue.length} 张图片已经就绪。
        </>
      ) : (
        <>现在可以进入导出确认，当前有 {exportQueue.length} 张图片已经就绪。</>
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
    if (!storageReady) return
    if (draftItems.some((item) => item.image.source_path === STARTUP_SAMPLE_PATH)) return

    let cancelled = false

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(148,163,184,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(255,255,255,0.7),_transparent_18%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] text-foreground">
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
            onClearProject={() => void run('clear-project', clearLocalProject)}
            onExportDeckPoolBackup={deviceProfile.isMobileDevice ? exportDeckPoolBackupFile : undefined}
            onImportDeckPoolBackup={deviceProfile.isMobileDevice ? () => deckPoolInputRef.current?.click() : undefined}
            onGuideAction={(action) => void runGuideAction(action)}
            showAnkiActions={deviceProfile.canDirectAnki}
            mobileOptimized={deviceProfile.isMobileDevice}
            ankiHelpOpen={ankiHelpOpen}
            onAnkiHelpOpenChange={setAnkiHelpOpen}
            onOpenAnkiHelp={() => setAnkiHelpOpen(true)}
            touchOptimized={deviceProfile.isTouchLike}
          />
        </div>

        {showWorkspaceLoadingShell ? (
          <WorkspaceLoadingShell mobile={deviceProfile.isMobileLayout} />
        ) : (
          <div className="relative">
            {workspaceMode === 'pipeline' ? (
              <PipelinePlaceholder />
            ) : deviceProfile.isMobileLayout ? (
              <div className="flex min-h-[calc(100vh-220px)] flex-col gap-4">
                <ManualDraftList
                  items={draftItems}
                  selectedDraftId={selectedItem?.draft.id ?? null}
                  onSelect={setSelectedDraftId}
                  mobileLayout
                />
                <div className="rounded-2xl border border-border/70 bg-background/90 shadow-lg shadow-slate-900/5 backdrop-blur">
                  <ManualWorkspace
                    selectedItem={selectedItem}
                    onMasksCommit={commitMasks}
                    onCropCommit={commitCrop}
                    focusShortcutEnabled={!exportDialogOpen}
                    onEditorHoverChange={setEditorHoverActive}
                    readOnlyInWorkspace={deviceProfile.isMobileDevice}
                    touchOptimized={deviceProfile.isTouchLike}
                    onPreviousItem={selectPreviousDraft}
                    onNextItem={selectNextDraft}
                    canGoPrevious={selectedDraftIndex > 0}
                    canGoNext={selectedDraftIndex >= 0 && selectedDraftIndex < activeDraftItems.length - 1}
                  />
                </div>
              </div>
            ) : (
              <div ref={manualLayoutRef} className="min-h-[calc(100vh-220px)]">
                <ResizablePanelGroup orientation="horizontal" className="min-h-[calc(100vh-220px)] rounded-2xl border border-border/70 bg-background/90 shadow-lg shadow-slate-900/5 backdrop-blur">
                  <ResizablePanel defaultSize={manualProjectPanelPercent} minSize={manualProjectPanelPercent}>
                    <div
                      className={editorHoverActive ? 'h-full min-w-[340px] transition-[opacity,filter] duration-200 opacity-55 saturate-75' : 'h-full min-w-[340px] transition-[opacity,filter] duration-200'}
                    >
                      <ManualDraftList items={draftItems} selectedDraftId={selectedItem?.draft.id ?? null} onSelect={setSelectedDraftId} />
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={100 - manualProjectPanelPercent} minSize={60}>
                    <ManualWorkspace
                      selectedItem={selectedItem}
                      onMasksCommit={commitMasks}
                      onCropCommit={commitCrop}
                      focusShortcutEnabled={!exportDialogOpen}
                      onEditorHoverChange={setEditorHoverActive}
                      onPreviousItem={selectPreviousDraft}
                      onNextItem={selectNextDraft}
                      canGoPrevious={selectedDraftIndex > 0}
                      canGoNext={selectedDraftIndex >= 0 && selectedDraftIndex < activeDraftItems.length - 1}
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            )}

            {showWorkspaceProcessingOverlay ? (
              <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl border border-border/60 bg-background/78 backdrop-blur-sm">
                <div className="flex w-full max-w-xl flex-col gap-4 rounded-3xl border border-border/60 bg-background/96 p-5 shadow-xl shadow-slate-900/5">
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
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {!deviceProfile.isMobileDevice ? <StatusCapsule tasks={orderedStatusTasks} side="left" /> : null}

      {workspaceMode === 'manual' ? (
        <div className={deviceProfile.isMobileLayout ? 'pointer-events-none fixed inset-x-4 bottom-4 z-50' : 'pointer-events-none fixed right-4 bottom-4 z-50'}>
          <Button
            type="button"
            size="lg"
            className={deviceProfile.isMobileLayout ? 'pointer-events-auto h-12 w-full rounded-2xl shadow-lg shadow-slate-900/10' : 'pointer-events-auto rounded-full shadow-lg shadow-slate-900/10 cursor-pointer hover:translate-y-1 hover:h-12 hover:px-4 hover:bg-white hover:text-black active:scale-[0.99]'}
            onClick={() => {
              if (exportQueue.length === 0) {
                updateStatusTask('export', { state: 'error', progress: 100, detail: '当前还没有可以进入导出流程的图片。' })
              }
              startExportFlow()
            }}
            disabled={exportQueue.length === 0}
          >
            <DownloadIcon data-icon="inline-start " />
            导出当前项目全部卡片
            <span className="rounded-full bg-background/16 px-2 py-0.5 text-xs">{exportQueue.length}</span>
          </Button>
        </div>
      ) : null}

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
        onPrevious={goToPreviousExportCard}
        onNext={goToNextExportCard}
        onSelectIndex={goToExportCard}
        onBackToReview={() => setExportStage('review')}
        quality={quality}
        onQualityChange={setQuality}
        onExportToAnki={() => void exportAllFromFlow('anki')}
        onExportToApkg={() => void exportAllFromFlow('apkg')}
        onMasksCommit={commitMasks}
        onCropCommit={commitCrop}
        isRefreshingDecks={loadingKey === 'refresh-anki' || ankiState.level === 'loading'}
        isCreatingDeck={loadingKey === 'create-deck'}
        isExportingAnki={loadingKey === 'manual-export-anki'}
        isExportingApkg={loadingKey === 'manual-export-apkg'}
        allowDirectAnki={deviceProfile.canDirectAnki}
        deckPickerMode={deviceProfile.canDirectAnki ? 'anki' : 'local'}
        touchOptimized={deviceProfile.isTouchLike}
        onOpenAnkiHelp={() => setAnkiHelpOpen(true)}
      />
    </div>
  )
}
