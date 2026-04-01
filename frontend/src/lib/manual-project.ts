import type { CropSuggestion, DraftListItem, WorkspaceMode } from '@/types'

const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/bmp',
  'image/gif',
])

export interface BuildDraftProgress {
  completed: number
  total: number
  fileName: string
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

async function sha256(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buffer)
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

export async function buildDraftItemFromFile(file: File): Promise<DraftListItem> {
  const extended = file as File & { webkitRelativePath?: string }
  const relativePath = extended.webkitRelativePath?.trim() || file.name
  const { sourcePath, folderPath } = normalizeFolderPath(relativePath)
  const sourceUrl = URL.createObjectURL(file)
  const { width, height } = await readImageSize(sourceUrl)
  const fileHash = await sha256(file)
  const imageId = crypto.randomUUID()
  const draftId = crypto.randomUUID()
  const now = new Date().toISOString()
  return {
    image: {
      id: imageId,
      source_path: sourcePath,
      folder_path: folderPath,
      file_hash: fileHash,
      width,
      height,
      status: 'manual_ready',
      ignored: false,
      deck: null,
      tags: [],
      source_url: sourceUrl,
      media_type: file.type || 'image/png',
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
    image_blob: file,
  }
}

export async function buildDraftItemsFromFiles(
  files: FileList | File[],
  options?: {
    onProgress?: (progress: BuildDraftProgress) => void
  },
): Promise<DraftListItem[]> {
  const list = [...files].filter((file) => IMAGE_TYPES.has(file.type) || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name))
  const items: DraftListItem[] = []

  for (const [index, file] of list.entries()) {
    const item = await buildDraftItemFromFile(file)
    items.push(item)
    options?.onProgress?.({
      completed: index + 1,
      total: list.length,
      fileName: file.name,
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
