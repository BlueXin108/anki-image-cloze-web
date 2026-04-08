import { toast } from 'sonner'
import type { Dispatch, SetStateAction } from 'react'

import { api } from '@/lib/api'
import { pickAvailableExportFormat, resolveExportFormatPolicy } from '@/lib/workbench-settings'
import { nowIso } from '@/lib/workbench-state'
import type { DraftListItem, WorkbenchSettings } from '@/types'

type DeviceProfileLike = {
  isMobileDevice: boolean
}

type ExportResult = {
  successCount: number
  failedCount: number
}

type UseExportActionsOptions = {
  setDraftItems: Dispatch<SetStateAction<DraftListItem[]>>
  workbenchSettings: WorkbenchSettings
  deviceProfile: DeviceProfileLike
  updateStatusTask: (
    taskId: 'export',
    patch: { state?: 'idle' | 'running' | 'success' | 'error'; progress?: number; detail?: string },
  ) => void
  promptExportCleanup: (draftIds: string[]) => void
}

export function useExportActions({
  setDraftItems,
  workbenchSettings,
  deviceProfile,
  updateStatusTask,
  promptExportCleanup,
}: UseExportActionsOptions) {
  const importDraftsToAnki = async (targets: DraftListItem[], quality: number): Promise<ExportResult> => {
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

  const exportDraftsToApkg = async (targets: DraftListItem[], quality: number): Promise<ExportResult> => {
    if (targets.length === 0) {
      updateStatusTask('export', { state: 'error', progress: 100, detail: '当前没有可导出的卡片。' })
      toast.error('当前没有可导出的卡片', { description: '先画出遮挡，再打开导出流程逐张确认牌组。' })
      return { successCount: 0, failedCount: 0 }
    }

    const formatPolicy = resolveExportFormatPolicy(targets.map((item) => ({ image: item.image })))
    const exportFormat = pickAvailableExportFormat(workbenchSettings.imageGroupExportFormat, formatPolicy.allowedFormats)

    updateStatusTask('export', { state: 'running', progress: 5, detail: '正在生成 APKG 卡包。' })

    try {
      let exportDraftsAsApkg: typeof import('@/lib/apkg-export').exportDraftsAsApkg
      let shareOrDownloadApkg: typeof import('@/lib/apkg-export').shareOrDownloadApkg

      try {
        const apkgModule = await import('@/lib/apkg-export')
        exportDraftsAsApkg = apkgModule.exportDraftsAsApkg
        shareOrDownloadApkg = apkgModule.shareOrDownloadApkg
      } catch (error) {
        throw new Error(`加载 APKG 导出模块失败：${error instanceof Error ? error.message : '浏览器没有成功载入导出代码。'}`)
      }

      let blob: Blob
      let fileName: string

      try {
        const result = await exportDraftsAsApkg({
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

        blob = result.blob
        fileName = result.fileName
      } catch (error) {
        throw new Error(`生成 APKG 内容失败：${error instanceof Error ? error.message : '浏览器没有成功整理卡包内容。'}`)
      }

      let delivery: Awaited<ReturnType<typeof shareOrDownloadApkg>>

      try {
        delivery = await shareOrDownloadApkg({
          blob,
          fileName,
          preferShare: false,
          tryOpenAfterDownload: false,
        })
      } catch (error) {
        throw new Error(`触发 APKG 下载失败：${error instanceof Error ? error.message : '浏览器没有成功接住卡包文件。'}`)
      }

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
          delivery.result === 'downloaded'
            ? 'APKG 卡包已生成并开始下载。'
            : 'APKG 卡包已生成，请手动保存文件。',
      })
      toast.success('APKG 卡包已生成', {
        description:
          delivery.result === 'downloaded'
            ? '下载完成后，可以手动用 Anki 或 AnkiDroid 导入。'
            : '当前浏览器没有自动触发下载，请使用下方保存入口手动处理。',
      })
      promptExportCleanup(targets.map((item) => item.draft.id))
      return { successCount: targets.length, failedCount: 0 }
    } catch (error) {
      updateStatusTask('export', { state: 'error', progress: 100, detail: error instanceof Error ? error.message : '生成 APKG 卡包失败。' })
      throw error
    }
  }

  const exportDraftsToImageGroup = async (targets: DraftListItem[], _quality: number): Promise<ExportResult> => {
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
        tryOpenAfterDownload: false,
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
          delivery.result === 'shared'
            ? '纯图像组已生成，并已打开系统分享。'
            : delivery.result === 'downloaded'
              ? '纯图像组压缩包已生成并开始下载。'
              : '纯图像组已生成，请手动保存压缩包。',
      })
      toast.success('纯图像组已生成', {
        description:
          delivery.result === 'shared'
            ? `已按 ${imageGroupFormatLabel} 图片组打开系统分享。`
            : delivery.result === 'downloaded'
              ? `已按 ${imageGroupFormatLabel} 图片组开始下载压缩包。`
              : `已按 ${imageGroupFormatLabel} 图片组准备好手动保存入口。`,
      })
      promptExportCleanup(targets.map((item) => item.draft.id))
      return { successCount: targets.length, failedCount: 0 }
    } catch (error) {
      updateStatusTask('export', { state: 'error', progress: 100, detail: error instanceof Error ? error.message : '生成纯图像组失败。' })
      throw error
    }
  }

  const exportDrafts = async (targets: DraftListItem[], destination: 'anki' | 'apkg' | 'image-group', quality: number): Promise<ExportResult> => {
    if (destination === 'anki') {
      return importDraftsToAnki(targets, quality)
    }
    if (destination === 'image-group') {
      return exportDraftsToImageGroup(targets, quality)
    }
    return exportDraftsToApkg(targets, quality)
  }

  return {
    exportDrafts,
  }
}
