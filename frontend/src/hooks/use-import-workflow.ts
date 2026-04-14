import { useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ChangeEvent, Dispatch, MutableRefObject, SetStateAction } from 'react'

import { isHeifLikeFile } from '@/lib/image-processing'
import { buildDraftItemFromImportedFile, buildDraftItemsFromFiles, buildPendingDraftItemFromFile, mergeImportedItems } from '@/lib/manual-project'
import type { DraftListItem, WorkspaceMode, WorkbenchSettings } from '@/types'

type ProcessingProgress = {
  percent: number
  completed: number
  total: number
  fileName: string
  stageLabel: string
}

type PendingImageEditSaveMetric = {
  draftId: string
  fileLabel: string
  action: 'masks' | 'crop'
}

type RecoverableProjectSummary = {
  itemCount: number
  savedAt: string
  workspaceMode: WorkspaceMode
  compressionCount: number
}

type WebkitEntry = {
  isFile?: boolean
  isDirectory?: boolean
  file?: (callback: (file: File) => void, error?: (error: DOMException) => void) => void
  createReader?: () => {
    readEntries: (
      callback: (entries: WebkitEntry[]) => void,
      error?: (error: DOMException) => void,
    ) => void
  }
}

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => WebkitEntry | null
}

type UseImportWorkflowOptions = {
  workbenchSettings: WorkbenchSettings
  setDraftItems: Dispatch<SetStateAction<DraftListItem[]>>
  setSelectedDraftId: Dispatch<SetStateAction<string | null>>
  setWorkspaceMode: Dispatch<SetStateAction<WorkspaceMode>>
  setRecoverableProjectSummary: Dispatch<SetStateAction<RecoverableProjectSummary | null>>
  setProjectCompressionCount: Dispatch<SetStateAction<number>>
  setSlowSavePrompt: Dispatch<SetStateAction<{ open: boolean; elapsedMs: number; itemCount: number; compressionCount: number }>>
  dismissRestoreProjectPrompt: () => void
  updateStatusTask: (
    taskId: 'files',
    patch: { state?: 'idle' | 'running' | 'success' | 'error'; progress?: number; detail?: string },
  ) => void
  slowSavePromptShownRef: MutableRefObject<boolean>
  slowSaveStrikeRef: MutableRefObject<number>
  pendingImageEditSaveMetricRef: MutableRefObject<PendingImageEditSaveMetric | null>
}

export function useImportWorkflow({
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
}: UseImportWorkflowOptions) {
  const readEntryFile = async (entry: WebkitEntry): Promise<File[]> => {
    if (entry.isFile && entry.file) {
      const file = await new Promise<File>((resolve, reject) => {
        entry.file?.(resolve, reject)
      })
      return file ? [file] : []
    }

    if (entry.isDirectory && entry.createReader) {
      const reader = entry.createReader()
      const nestedEntries: WebkitEntry[] = []

      while (true) {
        const batch = await new Promise<WebkitEntry[]>((resolve, reject) => {
          reader.readEntries(resolve, reject)
        })
        if (!batch.length) break
        nestedEntries.push(...batch)
      }

      const nestedFiles = await Promise.all(nestedEntries.map((item) => readEntryFile(item)))
      return nestedFiles.flat()
    }

    return []
  }

  const collectDroppedFiles = async (event: React.DragEvent): Promise<File[]> => {
    const directFiles = Array.from(event.dataTransfer.files ?? [])
    const items = Array.from(event.dataTransfer.items ?? [])
    if (directFiles.length > 0 && items.length === 0) return directFiles

    const collectedFiles: File[] = []
    for (const item of items) {
      if (item.kind !== 'file') continue
      const entry = (item as DataTransferItemWithEntry).webkitGetAsEntry?.()
      if (entry) {
        const nestedFiles = await readEntryFile(entry)
        collectedFiles.push(...nestedFiles)
        continue
      }
      const file = item.getAsFile()
      if (file) collectedFiles.push(file)
    }

    return collectedFiles.length > 0 ? collectedFiles : directFiles
  }

  const resetAfterImport = () => {
    dismissRestoreProjectPrompt()
    setRecoverableProjectSummary(null)
    slowSavePromptShownRef.current = false
    slowSaveStrikeRef.current = 0
    pendingImageEditSaveMetricRef.current = null
    setSlowSavePrompt({ open: false, elapsedMs: 0, itemCount: 0, compressionCount: 0 })
    setProjectCompressionCount(0)
    setWorkspaceMode('manual')
  }

  const [isImportingFiles, setIsImportingFiles] = useState(false)
  const [importingLabel, setImportingLabel] = useState('正在准备项目')
  const [importProgress, setImportProgress] = useState<ProcessingProgress | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const fileManagerInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const [hugeImportPrompt, setHugeImportPrompt] = useState<{ open: boolean; files: File[] | null; label: string }>({
    open: false,
    files: null,
    label: '',
  })
  const dragCounterRef = useRef(0)

  const ingestFiles = async (files: FileList | File[], sourceLabel: string) => {
    const acceptedFiles = Array.from(files).filter((file) =>
      Boolean(file) && (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif|heic|heif)$/i.test(file.name)),
    )
    const regularFiles = acceptedFiles.filter((file) => !isHeifLikeFile(file, file.name))
    const heifFiles = acceptedFiles.filter((file) => isHeifLikeFile(file, file.name))
    const pendingHeifItems = heifFiles.map((file) => buildPendingDraftItemFromFile(file, workbenchSettings))

    if (acceptedFiles.length === 0) {
      updateStatusTask('files', { state: 'error', progress: 100, detail: '没有找到可用的图片文件。' })
      toast.error('没有找到可导入的图片', { description: '支持 png、jpg、jpeg、webp、bmp、gif、heif、heic。' })
      return
    }

    setIsImportingFiles(true)
    setImportingLabel(sourceLabel)
    setImportProgress(null)
    const loadingToastId = toast.loading(`${sourceLabel}处理中`, {
      description: '正在整理图片并加入列表，请稍等一下。',
    })
    updateStatusTask('files', { state: 'running', progress: 5, detail: `正在整理 ${sourceLabel} 里的图片。` })

    try {
      const failedFiles: { fileName: string; message: string }[] = []

      if (heifFiles.length > 0) {
        toast.info('检测到 HEIF 图片', {
          description: '这类图片不推荐直接编辑，转换通常需要 1 到 5 秒。会先让常规图片进入项目，再在后台继续转换 HEIF。',
        })

        if (regularFiles.length === 0) {
          setDraftItems((current) => mergeImportedItems(current, pendingHeifItems))
          setSelectedDraftId((current) => current ?? pendingHeifItems[0]?.draft.id ?? null)
        }
      }

      const items = await buildDraftItemsFromFiles(regularFiles, {
        settings: workbenchSettings,
        onFileFailure: (failure) => {
          failedFiles.push(failure)
        },
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

      if (items.length === 0 && heifFiles.length === 0) {
        updateStatusTask('files', { state: 'error', progress: 100, detail: '没有找到可用的图片文件。' })
        toast.dismiss(loadingToastId)
        toast.error('没有成功导入任何图片', {
          description: failedFiles[0]?.message ?? '支持 png、jpg、jpeg、webp、bmp、gif、heif、heic。',
        })
        return
      }

      let addedCount = 0
      if (items.length > 0) {
        setDraftItems((current) => {
          const merged = mergeImportedItems(current, items)
          addedCount = merged.length - current.length
          return merged
        })
        setSelectedDraftId((current) => current ?? items[0]?.draft.id ?? null)
      }
      if (heifFiles.length > 0 && regularFiles.length > 0) {
        setDraftItems((current) => mergeImportedItems(current, pendingHeifItems))
      }
      resetAfterImport()
      updateStatusTask('files', {
        state: 'success',
        progress: 100,
        detail: heifFiles.length > 0
          ? `${sourceLabel} 已完成，常规图片已先进入项目，剩余 ${heifFiles.length} 张 HEIF 会继续在后台转换。`
          : addedCount === items.length
            ? `${sourceLabel} 已完成，本次带入 ${items.length} 张图片。`
            : `${sourceLabel} 已完成，新带入 ${addedCount} 张图片，跳过了 ${items.length - addedCount} 张重复图片。`,
      })
      toast.dismiss(loadingToastId)
      if (heifFiles.length > 0) {
        toast.success(`${sourceLabel} 已开始`, {
          description: regularFiles.length > 0
            ? `常规图片已经先加入项目，${heifFiles.length} 张 HEIF 正在后台转换。`
            : `${heifFiles.length} 张 HEIF 已进入后台转换，转换完成后会自动开放编辑。`,
        })
      } else {
        toast.success(`${sourceLabel} 已完成`, {
          description:
            addedCount === items.length
              ? `本次带入 ${items.length} 张图片。`
              : `新带入 ${addedCount} 张图片，跳过了 ${items.length - addedCount} 张重复图片。`,
        })
      }

      if (failedFiles.length > 0) {
        toast.error('有部分图片没能导入', {
          description:
            failedFiles.length === 1
              ? `${failedFiles[0]?.fileName ?? '其中 1 张图片'} 处理失败：${failedFiles[0]?.message ?? '请重试或换个格式。'}`
              : `共有 ${failedFiles.length} 张图片处理失败，其余图片已经先加入项目。`,
        })
      }

      if (heifFiles.length > 0) {
        setIsImportingFiles(false)
        setImportProgress(null)

        let convertedCount = 0
        for (const [index, file] of heifFiles.entries()) {
          const pendingItem = pendingHeifItems[index]
          if (!pendingItem) continue
          try {
            const result = await buildDraftItemFromImportedFile(file, {
              settings: workbenchSettings,
              imageId: pendingItem.image.id,
              draftId: pendingItem.draft.id,
            })
            convertedCount += 1
            setDraftItems((current) =>
              current.map((item) => (item.draft.id === pendingItem.draft.id ? result.item : item)),
            )
            setSelectedDraftId((current) => current ?? pendingItem.draft.id)
          } catch (error) {
            setDraftItems((current) =>
              current.map((item) =>
                item.draft.id === pendingItem.draft.id
                  ? {
                      ...item,
                      image: {
                        ...item.image,
                        status: 'manual_failed',
                      },
                    }
                  : item,
              ),
            )
            toast.error('有一张 HEIF 图片转换失败', {
              description: error instanceof Error ? error.message : '这张 HEIF 图片没能顺利转换，可以稍后单独重试。',
            })
          }
        }

        updateStatusTask('files', {
          state: 'success',
          progress: 100,
          detail: `后台 HEIF 转换已完成，共处理 ${convertedCount}/${heifFiles.length} 张。`,
        })
        toast.success('HEIF 图片已转换完成', {
          description: `共处理 ${convertedCount} 张，转换完成后已自动开放编辑。`,
        })
        return
      }
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
    const normalizedFiles = Array.from(files)

    if (normalizedFiles.length > 20) {
      setHugeImportPrompt({ open: true, files: normalizedFiles, label })
    } else {
      await ingestFiles(normalizedFiles, label)
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    if (e.dataTransfer.items?.length && Array.from(e.dataTransfer.items).some((item) => item.kind === 'file')) {
      setIsDragActive(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current -= 1
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

    void (async () => {
      const files = await collectDroppedFiles(e)
      if (files.length > 0) {
        await safeIngestFiles(files, '拖入图片')
      }
    })()
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

  const confirmHugeImport = async () => {
    const pendingFiles = hugeImportPrompt.files
    const label = hugeImportPrompt.label
    setHugeImportPrompt({ open: false, files: null, label: '' })
    if (pendingFiles) {
      await ingestFiles(pendingFiles, label)
    }
  }

  return {
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
  }
}
