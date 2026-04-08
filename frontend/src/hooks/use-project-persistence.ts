import { useEffect } from 'react'
import { toast } from 'sonner'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import { api } from '@/lib/api'
import { releaseDraftItems } from '@/lib/project-store'
import type { DraftListItem, WorkspaceMode } from '@/types'

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

type UseProjectPersistenceOptions = {
  draftItems: DraftListItem[]
  selectedDraftId: string | null
  workspaceMode: WorkspaceMode
  loadingKey: string | null
  projectCompressionCount: number
  storageReady: boolean
  recoverableProjectSummary: RecoverableProjectSummary | null
  setStorageReady: Dispatch<SetStateAction<boolean>>
  setRecoverableProjectSummary: Dispatch<SetStateAction<RecoverableProjectSummary | null>>
  setProjectCompressionCount: Dispatch<SetStateAction<number>>
  setDraftItems: Dispatch<SetStateAction<DraftListItem[]>>
  setSelectedDraftId: Dispatch<SetStateAction<string | null>>
  setWorkspaceMode: Dispatch<SetStateAction<WorkspaceMode>>
  setSlowSavePrompt: Dispatch<SetStateAction<{ open: boolean; elapsedMs: number; itemCount: number; compressionCount: number }>>
  dismissRestoreProjectPrompt: () => void
  restorePromptToastIdRef: MutableRefObject<string | number | null>
  saveSequenceRef: MutableRefObject<number>
  slowSavePromptShownRef: MutableRefObject<boolean>
  slowSaveStrikeRef: MutableRefObject<number>
  pendingImageEditSaveMetricRef: MutableRefObject<PendingImageEditSaveMetric | null>
  draftItemsRef: MutableRefObject<DraftListItem[]>
  slowSaveThresholdMs: number
  slowSaveRepeatThresholdMs: number
  slowSaveRepeatTriggerCount: number
  updateStatusTask: (
    taskId: 'restore' | 'save',
    patch: { state?: 'idle' | 'running' | 'success' | 'error'; progress?: number; detail?: string },
  ) => void
  replaceAllItems: (items: DraftListItem[], nextSelectedDraftId?: string | null) => void
  onRestorePromptReady: (saved: RecoverableProjectSummary, restoreAction: () => Promise<void>) => void
}

export function useProjectPersistence({
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
  slowSaveThresholdMs,
  slowSaveRepeatThresholdMs,
  slowSaveRepeatTriggerCount,
  updateStatusTask,
  replaceAllItems,
  onRestorePromptReady,
}: UseProjectPersistenceOptions) {
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
        onRestorePromptReady(saved, restoreSavedProject)
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
      if (restorePromptToastIdRef.current !== null) {
        toast.dismiss(restorePromptToastIdRef.current)
        restorePromptToastIdRef.current = null
      }
      dismissRestoreProjectPrompt()
    }
  }, [dismissRestoreProjectPrompt, onRestorePromptReady, restorePromptToastIdRef, setRecoverableProjectSummary, setStorageReady, updateStatusTask])

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
                ? roundedElapsedMs >= slowSaveRepeatThresholdMs
                : roundedElapsedMs >= slowSaveThresholdMs

            if (shouldAccumulateSlowSave) {
              slowSaveStrikeRef.current += 1
            } else {
              slowSaveStrikeRef.current = 0
            }

            const shouldShowSlowSavePrompt =
              !slowSavePromptShownRef.current &&
              (
                (projectCompressionCount === 0 && roundedElapsedMs >= slowSaveThresholdMs) ||
                (projectCompressionCount > 0 && slowSaveStrikeRef.current >= slowSaveRepeatTriggerCount)
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
  }, [
    draftItems,
    loadingKey,
    projectCompressionCount,
    recoverableProjectSummary,
    saveSequenceRef,
    selectedDraftId,
    setSlowSavePrompt,
    slowSavePromptShownRef,
    slowSaveRepeatThresholdMs,
    slowSaveRepeatTriggerCount,
    slowSaveStrikeRef,
    slowSaveThresholdMs,
    storageReady,
    updateStatusTask,
    workspaceMode,
    pendingImageEditSaveMetricRef,
  ])

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
      setWorkspaceMode(saved.workspaceMode)
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

  return {
    restoreSavedProject,
    clearLocalProject,
  }
}
