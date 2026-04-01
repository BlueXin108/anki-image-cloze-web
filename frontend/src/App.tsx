import {
  DownloadIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react'
import { toast } from 'sonner'

import { ExportFlowDialog } from '@/components/workbench/export-flow-dialog'
import { ManualDraftList } from '@/components/workbench/manual-draft-list'
import { PipelinePlaceholder } from '@/components/workbench/pipeline-placeholder'
import { StatusCapsule, type StatusTaskId, type StatusTaskState } from '@/components/workbench/status-capsule'
import { ManualWorkspace } from '@/components/workbench/manual-workspace'
import { WorkbenchHeader, type WorkspaceGuideAction } from '@/components/workbench/workbench-header'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useExportFlow } from '@/hooks/use-export-flow'
import { api } from '@/lib/api'
import { buildDraftItemsFromFiles, mergeImportedItems, preferredWorkspaceMode } from '@/lib/manual-project'
import { releaseDraftItems } from '@/lib/project-store'
import { ankiLoadingState, classifyAnkiFailure, createInitialStatusTasks, EMPTY_ANKI_STATE, nowIso, replaceDraft, STATUS_TASK_ORDER, WORKSPACE_MODE_STORAGE_KEY } from '@/lib/workbench-state'
import type { AnkiConnectionState, CardDraft, DraftListItem, WorkspaceMode } from '@/types'

type DirectoryInputProps = InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory?: string
  directory?: string
}

const MANUAL_PROJECT_MIN_SIZE = 340

export default function App() {
  const [draftItems, setDraftItems] = useState<DraftListItem[]>([])
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [editorHoverActive, setEditorHoverActive] = useState(false)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() => {
    if (typeof window === 'undefined') return 'manual'
    return preferredWorkspaceMode(window.localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY) as WorkspaceMode | null)
  })
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [ankiState, setAnkiState] = useState<AnkiConnectionState>(EMPTY_ANKI_STATE)
  const [storageReady, setStorageReady] = useState(false)
  const [statusTasks, setStatusTasks] = useState<Record<StatusTaskId, StatusTaskState>>(() => createInitialStatusTasks())
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const draftItemsRef = useRef<DraftListItem[]>([])
  const saveSequenceRef = useRef(0)
  const manualLayoutRef = useRef<HTMLDivElement | null>(null)
  const [manualLayoutWidth, setManualLayoutWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : Math.max(window.innerWidth - 80, MANUAL_PROJECT_MIN_SIZE),
  )

  const selectedItem = useMemo(
    () => draftItems.find((item) => item.draft.id === selectedDraftId) ?? draftItems[0] ?? null,
    [draftItems, selectedDraftId],
  )

  const deckOptions = useMemo(() => {
    const localDecks = draftItems
      .map((item) => item.draft.deck?.trim())
      .filter((value): value is string => Boolean(value))
    return [...new Set([...ankiState.decks, ...localDecks])].sort((left, right) => left.localeCompare(right, 'zh-CN'))
  }, [ankiState.decks, draftItems])

  const exportQueue = useMemo(
    () => draftItems.filter((item) => !item.image.ignored && item.draft.masks.length > 0),
    [draftItems],
  )

  const orderedStatusTasks = useMemo(() => STATUS_TASK_ORDER.map((taskId) => statusTasks[taskId]), [statusTasks])
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
    void refreshAnkiConnection({ source: 'startup' })
  }, [])

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
    updateStatusTask('files', { state: 'running', progress: 5, detail: `正在整理 ${sourceLabel} 里的图片。` })

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
    toast.success(`${sourceLabel} 已完成`, {
      description:
        addedCount === items.length
          ? `本次带入 ${items.length} 张图片。`
          : `新带入 ${addedCount} 张图片，跳过了 ${items.length - addedCount} 张重复图片。`,
    })
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
    exportAllFromFlow,
  } = useExportFlow({
    draftItems,
    exportQueue,
    selectedItem,
    loadingKey,
    patchDraft,
    importDraftsToAnki,
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
      exported: active.filter((item) => item.draft.review_status === 'imported').length,
    }
  }, [draftItems])

  const manualGuide = useMemo(() => {
    if (summary.images === 0) {
      return {
        step: 'import' as const,
        hint: '先带入一批图片，左侧列表才会出现。',
        action: 'upload' as WorkspaceGuideAction,
        actionLabel: '上传图片',
      }
    }
    if (!selectedItem) {
      return {
        step: 'mask' as const,
        hint: '先从左侧选中一张图，再开始框选。',
        action: null as WorkspaceGuideAction,
        actionLabel: null,
      }
    }
    if (selectedItem.draft.masks.length === 0) {
      return {
        step: 'mask' as const,
        hint: '直接在中间框出要挖空的区域，预览会马上跟着变化。',
        action: null as WorkspaceGuideAction,
        actionLabel: null,
      }
    }
    if (!ankiState.checked || !ankiState.ok) {
      return {
        step: 'anki' as const,
        hint: '导出前先确认网页已经连到你本机的 Anki。',
        action: 'refresh-anki' as WorkspaceGuideAction,
        actionLabel: '检查 Anki',
      }
    }
    return {
      step: 'export' as const,
      hint: `现在可以进入导出确认，当前有 ${exportQueue.length} 张图片已经就绪。`,
      action: 'open-export' as WorkspaceGuideAction,
      actionLabel: '打开导出',
    }
  }, [ankiState.checked, ankiState.ok, exportQueue.length, selectedItem, summary.images])

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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(148,163,184,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(255,255,255,0.7),_transparent_18%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] text-foreground">
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void onFileInputChange(event)} />
      <input
        ref={folderInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => void onFolderInputChange(event)}
        {...({ webkitdirectory: '', directory: '' } as DirectoryInputProps)}
      />

      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-4 py-4 md:px-6">
        <div className={editorHoverActive ? 'transition-[opacity,filter] duration-200 opacity-55 saturate-75' : 'transition-[opacity,filter] duration-200'}>
          <WorkbenchHeader
            workspaceMode={workspaceMode}
            onWorkspaceModeChange={setWorkspaceMode}
            manualGuide={manualGuide}
            loadingKey={loadingKey}
            onUploadImages={() => fileInputRef.current?.click()}
            onImportFolder={() => folderInputRef.current?.click()}
            onRestoreProject={() => void run('restore-project', restoreSavedProject)}
            onRefreshAnki={() => void run('refresh-anki', () => refreshAnkiConnection({ source: 'manual' }))}
            onClearProject={() => void run('clear-project', clearLocalProject)}
            onGuideAction={(action) => void runGuideAction(action)}
          />
        </div>

        {workspaceMode === 'pipeline' ? (
          <PipelinePlaceholder />
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
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        )}
      </div>

      <StatusCapsule tasks={orderedStatusTasks} side="left" />

      {workspaceMode === 'manual' ? (
        <div className="pointer-events-none fixed right-4 bottom-4 z-50">
          <Button
            type="button"
            size="lg"
            className="pointer-events-auto rounded-full shadow-lg shadow-slate-900/10 cursor-pointer hover:translate-y-1 hover:h-12 hover:px-4 hover:bg-white hover:text-black active:scale-[0.99]"
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
        ankiState={ankiState}
        onRefreshDecks={() => void run('refresh-anki', () => refreshAnkiConnection({ source: 'manual' }))}
        onCreateDeck={() => void run('create-deck', createCurrentDeckInAnki)}
        onConfirmCurrent={() => void run('confirm-export-card', confirmCurrentExportCard)}
        onPrevious={goToPreviousExportCard}
        onBackToReview={() => setExportStage('review')}
        quality={quality}
        onQualityChange={setQuality}
        onExportAll={exportAllFromFlow}
        onMasksCommit={commitMasks}
        onCropCommit={commitCrop}
        isRefreshingDecks={loadingKey === 'refresh-anki' || ankiState.level === 'loading'}
        isCreatingDeck={loadingKey === 'create-deck'}
        isExporting={loadingKey === 'manual-export-all'}
      />
    </div>
  )
}
