import { buildGeneratedCardTargets, isInteractiveCardMode } from '@/lib/card-generation'
import JSZip from 'jszip'

import { renderDraftPreviewAssets } from '@/lib/manual-preview'
import { exportFileExtension, exportMimeType } from '@/lib/workbench-settings'
import type { CardGenerationMode, DraftListItem, ImageExportFormat } from '@/types'

interface ExportDraftImagesOptions {
  items: DraftListItem[]
  imageFormat: ImageExportFormat
  imageQuality: number
  generationMode: CardGenerationMode
  packageName?: string
  onProgress?: (progress: {
    completed: number
    total: number
    label: string
  }) => void
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-')
}

export async function exportDraftsAsImageGroup(options: ExportDraftImagesOptions): Promise<{
  blob: Blob
  fileName: string
}> {
  const zip = new JSZip()
  const imageFormat = options.imageFormat
  const mimeType = exportMimeType(imageFormat)
  const extension = exportFileExtension(imageFormat)
  const quality = Math.max(0.1, Math.min(1, options.imageQuality / 100))
  const packageName = sanitizeFileName(options.packageName?.trim() || `anki-image-group-${new Date().toISOString().slice(0, 10)}`)

  for (const [itemIndex, item] of options.items.entries()) {
    const targets = buildGeneratedCardTargets(item.draft.masks, options.generationMode)
    const fileBaseName = sanitizeFileName(item.image.source_path.split(/[\\/]/).pop() || item.image.source_path)

    for (const target of targets) {
      const preview = await renderDraftPreviewAssets({
        draft: item.draft,
        sourceUrl: item.image.source_url || '',
        imageWidth: item.image.width,
        imageHeight: item.image.height,
        selectedGroupId: isInteractiveCardMode(options.generationMode) ? null : target.groupId,
        generationMode: options.generationMode,
        outputType: mimeType,
        outputQuality: imageFormat === 'png' ? undefined : quality,
      })

      if (!preview.frontBlob || !preview.backBlob) continue

      const prefix = `${fileBaseName}-card-${target.order}`
      zip.file(`${prefix}-front.${extension}`, preview.frontBlob)
      zip.file(`${prefix}-back.${extension}`, preview.backBlob)
    }

    options.onProgress?.({
      completed: itemIndex + 1,
      total: options.items.length,
      label: item.image.source_path.split(/[\\/]/).pop() || item.image.source_path,
    })
  }

  return {
    blob: await zip.generateAsync({ type: 'blob' }),
    fileName: `${packageName}.zip`,
  }
}

export async function shareOrDownloadFile(options: {
  blob: Blob
  fileName: string
  mimeType: string
  preferShare?: boolean
}): Promise<'shared' | 'downloaded'> {
  const file = new File([options.blob], options.fileName, {
    type: options.mimeType,
  })

  if (
    options.preferShare &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: options.fileName,
      })
      return 'shared'
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'AbortError') {
        throw error
      }
    }
  }

  const url = URL.createObjectURL(options.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = options.fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}
