import { toast } from 'sonner'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import { transformImageBlob } from '@/lib/image-processing'
import { releaseDraftItems } from '@/lib/project-store'
import { nowIso } from '@/lib/workbench-state'
import type { BBox, DraftListItem } from '@/types'

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

type UseProjectOptimizationOptions = {
  autoOptimizeMaxDimension: number
  autoOptimizeQuality: number
  draftItemsRef: MutableRefObject<DraftListItem[]>
  selectedCompressionCount: number
  setDraftItems: Dispatch<SetStateAction<DraftListItem[]>>
  setProjectCompressionCount: Dispatch<SetStateAction<number>>
  setOptimizeProgress: Dispatch<SetStateAction<ProcessingProgress | null>>
  setSlowSavePrompt: Dispatch<SetStateAction<{ open: boolean; elapsedMs: number; itemCount: number; compressionCount: number }>>
  slowSavePromptShownRef: MutableRefObject<boolean>
  slowSaveStrikeRef: MutableRefObject<number>
  pendingImageEditSaveMetricRef: MutableRefObject<PendingImageEditSaveMetric | null>
  updateStatusTask: (taskId: 'save', patch: { state?: 'idle' | 'running' | 'success' | 'error'; progress?: number; detail?: string }) => void
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

export function useProjectOptimization({
  autoOptimizeMaxDimension,
  autoOptimizeQuality,
  draftItemsRef,
  selectedCompressionCount,
  setDraftItems,
  setProjectCompressionCount,
  setOptimizeProgress,
  setSlowSavePrompt,
  slowSavePromptShownRef,
  slowSaveStrikeRef,
  pendingImageEditSaveMetricRef,
  updateStatusTask,
}: UseProjectOptimizationOptions) {
  const optimizeDraftItemForSpeed = async (item: DraftListItem): Promise<DraftListItem> => {
    const sourceBlob = item.image_blob as Blob
    const transformed = await transformImageBlob(sourceBlob, {
      maxDimension: autoOptimizeMaxDimension,
      outputType: 'image/webp',
      outputQuality: autoOptimizeQuality,
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

    setSlowSavePrompt({ open: false, elapsedMs: 0, itemCount: 0, compressionCount: selectedCompressionCount })
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
      pendingImageEditSaveMetricRef.current = null
      updateStatusTask('save', { state: 'error', progress: 100, detail: error instanceof Error ? error.message : '当前项目压缩失败。' })
      toast.dismiss(loadingToastId)
      throw error
    } finally {
      setOptimizeProgress(null)
    }
  }

  return {
    optimizeCurrentProjectForSpeed,
  }
}
