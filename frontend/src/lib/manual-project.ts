import type { CropSuggestion, DraftListItem, ImageSourceQuality, WorkspaceMode, WorkbenchSettings } from '@/types'
import { normalizeImportedImage, prepareImportedImage, resolvedHeifImportMimeType } from '@/lib/image-processing'

const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/bmp',
  'image/gif',
  'image/heic',
  'image/heic-sequence',
  'image/heif',
  'image/heif-sequence',
])

export interface BuildDraftProgress {
  completed: number
  total: number
  fileName: string
  percent: number
  stageLabel: string
}

export interface BuildDraftFailure {
  fileName: string
  message: string
}

interface DraftBlobSource {
  blob: Blob
  name: string
  relativePath?: string
  mediaType?: string
  sourceQuality?: ImageSourceQuality
}

interface DraftIdentityOptions {
  imageId?: string
  draftId?: string
  status?: string
}

interface BuildDraftItemFromFileOptions extends DraftIdentityOptions {
  settings?: WorkbenchSettings
  onProgress?: (progress: { stage: 'decode' | 'draw' | 'encode'; progress: number; label: string }) => void
}

function mediaTypeToExtension(mediaType: string): string {
  switch (mediaType) {
    case 'image/webp':
      return 'webp'
    case 'image/png':
      return 'png'
    case 'image/jpeg':
    default:
      return 'jpg'
  }
}

function replaceFileExtension(value: string, nextExtension: string): string {
  return value.replace(/\.[^.]+$/u, `.${nextExtension}`)
}

function normalizeFolderPath(relativePath: string): { sourcePath: string; folderPath: string } {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length <= 1) {
    return {
      sourcePath: segments[0] ?? relativePath,
      folderPath: '',
    }
  }
  return {
    sourcePath: normalized,
    folderPath: segments.slice(0, -1).join('/'),
  }
}

function readImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('图片读取失败。'))
    image.src = url
  })
}

async function createFileFingerprint(file: Blob): Promise<string> {
  const chunkSize = 64 * 1024
  const head = new Uint8Array(await file.slice(0, chunkSize).arrayBuffer())
  const tailStart = Math.max(0, file.size - chunkSize)
  const tail = tailStart === 0 ? new Uint8Array() : new Uint8Array(await file.slice(tailStart).arrayBuffer())
  const encoder = new TextEncoder()
  const meta = encoder.encode(`${file.size}:${file.type || 'application/octet-stream'}`)
  const sample = new Uint8Array(meta.length + head.length + tail.length)
  sample.set(meta, 0)
  sample.set(head, meta.length)
  sample.set(tail, meta.length + head.length)
  const hash = await crypto.subtle.digest('SHA-256', sample)
  return [...new Uint8Array(hash)].map((item) => item.toString(16).padStart(2, '0')).join('')
}

export function defaultManualCrop(width: number, height: number): CropSuggestion {
  return {
    bbox: [0, 0, width, height],
    padding: 0,
    confidence: 1,
    source: 'manual',
  }
}

async function buildDraftItemFromBlob(source: DraftBlobSource, options?: DraftIdentityOptions): Promise<DraftListItem> {
  const relativePath = source.relativePath?.trim() || source.name
  const { sourcePath, folderPath } = normalizeFolderPath(relativePath)
  const sourceUrl = URL.createObjectURL(source.blob)
  const { width, height } = await readImageSize(sourceUrl)
  const fileHash = await createFileFingerprint(source.blob)
  const imageId = options?.imageId ?? crypto.randomUUID()
  const draftId = options?.draftId ?? crypto.randomUUID()
  const now = new Date().toISOString()
  return {
    image: {
      id: imageId,
      source_path: sourcePath,
      folder_path: folderPath,
      file_hash: fileHash,
      width,
      height,
      status: options?.status ?? 'manual_ready',
      ignored: false,
      deck: null,
      tags: [],
      source_url: sourceUrl,
      media_type: source.mediaType || source.blob.type || 'image/png',
      source_quality: source.sourceQuality ?? 'original',
    },
    draft: {
      id: draftId,
      image_id: imageId,
      deck: null,
      tags: [],
      review_status: 'draft',
      route_reason: null,
      crop: defaultManualCrop(width, height),
      masks: [],
      ocr_regions: [],
      ocr_text: null,
      llm_summary: null,
      llm_observed_text: null,
      llm_cloze_targets: [],
      llm_warnings: [],
      render_fingerprint: null,
      source_image_url: sourceUrl,
      imported_note_id: null,
      updated_at: now,
      last_imported_at: null,
    },
    image_blob: source.blob,
  }
}

export async function buildDraftItemFromFile(file: File): Promise<DraftListItem> {
  const result = await buildDraftItemFromImportedFile(file)
  return result.item
}

export function buildPendingDraftItemFromFile(file: File, settings?: WorkbenchSettings): DraftListItem {
  const imageId = crypto.randomUUID()
  const draftId = crypto.randomUUID()
  const now = new Date().toISOString()
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath?.trim() || file.name
  const finalMediaType = resolvedHeifImportMimeType(settings)
  const sourcePath = replaceFileExtension(relativePath, mediaTypeToExtension(finalMediaType))
  const normalized = normalizeFolderPath(sourcePath)

  return {
    image: {
      id: imageId,
      source_path: normalized.sourcePath,
      folder_path: normalized.folderPath,
      file_hash: `${file.name}:${file.size}:pending`,
      width: 0,
      height: 0,
      status: 'preparing',
      ignored: false,
      deck: null,
      tags: [],
      source_url: null,
      media_type: finalMediaType,
      source_quality: settings?.importCompressionEnabled ? 'import-compressed' : 'heif-converted',
    },
    draft: {
      id: draftId,
      image_id: imageId,
      deck: null,
      tags: [],
      review_status: 'draft',
      route_reason: null,
      crop: null,
      masks: [],
      ocr_regions: [],
      ocr_text: null,
      llm_summary: null,
      llm_observed_text: null,
      llm_cloze_targets: [],
      llm_warnings: [],
      render_fingerprint: null,
      source_image_url: null,
      imported_note_id: null,
      updated_at: now,
      last_imported_at: null,
    },
  }
}

export async function buildDraftItemFromImportedFile(
  file: File,
  options?: BuildDraftItemFromFileOptions,
): Promise<{ item: DraftListItem; convertedFromHeif: boolean }> {
  const prepared = await prepareImportedImage(file, file.name, options?.settings)
  const extended = file as File & { webkitRelativePath?: string }
  const originalRelativePath = extended.webkitRelativePath?.trim() || file.name

  const normalized = options?.settings
    ? await normalizeImportedImage(prepared.blob, options.settings, options.onProgress)
    : { blob: prepared.blob, mediaType: prepared.mediaType }
  const finalExtension = mediaTypeToExtension(normalized.mediaType)
  const shouldRewriteExtension =
    prepared.convertedFromHeif ||
    Boolean(options?.settings?.importCompressionEnabled && normalized.mediaType !== (file.type || prepared.mediaType || 'image/png'))
  const normalizedRelativePath = shouldRewriteExtension
    ? replaceFileExtension(originalRelativePath, finalExtension)
    : originalRelativePath

  const item = await buildDraftItemFromBlob(
    {
      blob: normalized.blob,
      name: shouldRewriteExtension ? replaceFileExtension(file.name, finalExtension) : file.name,
      relativePath: normalizedRelativePath,
      mediaType: normalized.mediaType,
      sourceQuality: options?.settings?.importCompressionEnabled
        ? 'import-compressed'
        : prepared.convertedFromHeif
          ? 'heif-converted'
          : 'original',
    },
    {
      imageId: options?.imageId,
      draftId: options?.draftId,
      status: 'manual_ready',
    },
  )

  return {
    item,
    convertedFromHeif: prepared.convertedFromHeif,
  }
}

export async function buildDraftItemFromAsset(assetUrl: string, name: string, relativePath?: string): Promise<DraftListItem> {
  const response = await fetch(assetUrl)
  if (!response.ok) {
    throw new Error('内置测试图片读取失败。')
  }
  const blob = await response.blob()
  return buildDraftItemFromBlob({
    blob,
    name,
    relativePath: relativePath || name,
    mediaType: blob.type || 'image/png',
    sourceQuality: 'original',
  })
}

export async function buildDraftItemsFromFiles(
  files: FileList | File[],
  options?: {
    onProgress?: (progress: BuildDraftProgress) => void
    settings?: WorkbenchSettings
    onHeifConverted?: (payload: { count: number; fileNames: string[] }) => void
    onFileFailure?: (failure: BuildDraftFailure) => void
  },
): Promise<DraftListItem[]> {
  const list = [...files].filter((file) => IMAGE_TYPES.has(file.type) || /\.(png|jpe?g|webp|bmp|gif|heic|heif)$/i.test(file.name))
  const items: DraftListItem[] = []
  const heifConvertedFiles: string[] = []

  for (const [index, file] of list.entries()) {
    try {
      const result = await buildDraftItemFromImportedFile(file, {
        settings: options?.settings,
        onProgress: (progress) => {
          options?.onProgress?.({
            completed: index,
            total: list.length,
            fileName: file.name,
            percent: Math.max(1, Math.round(((index + progress.progress / 100) / Math.max(list.length, 1)) * 100)),
            stageLabel: progress.label,
          })
        },
      })
      if (result.convertedFromHeif) {
        heifConvertedFiles.push(file.name)
      }
      const item = result.item
      items.push(item)
      options?.onProgress?.({
        completed: index + 1,
        total: list.length,
        fileName: file.name,
        percent: Math.max(1, Math.round(((index + 1) / Math.max(list.length, 1)) * 100)),
        stageLabel: options?.settings?.importCompressionEnabled ? '当前图片处理完成' : '当前图片已加入项目',
      })
    } catch (error) {
      options?.onFileFailure?.({
        fileName: file.name,
        message: error instanceof Error ? error.message : '图片处理失败。',
      })
    }
  }

  if (heifConvertedFiles.length > 0) {
    options?.onHeifConverted?.({
      count: heifConvertedFiles.length,
      fileNames: heifConvertedFiles,
    })
  }

  return items.sort((left, right) => left.image.source_path.localeCompare(right.image.source_path, 'zh-CN'))
}

export function mergeImportedItems(current: DraftListItem[], incoming: DraftListItem[]): DraftListItem[] {
  const seen = new Set(current.map((item) => `${item.image.file_hash}:${item.image.source_path}`))
  const deduped = incoming.filter((item) => {
    const key = `${item.image.file_hash}:${item.image.source_path}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return [...current, ...deduped]
}

export function preferredWorkspaceMode(mode: WorkspaceMode | null | undefined): WorkspaceMode {
  return mode === 'pipeline' ? 'pipeline' : 'manual'
}
