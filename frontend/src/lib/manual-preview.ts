import type { BBox, CardDraft, CardGenerationMode, ManualPreviewSet, MaskRect } from '@/types'

export interface MaskGroupPreview {
  groupId: string
  order: number
  masks: MaskRect[]
}

interface RenderPreviewOptions {
  sourceUrl: string
  imageWidth: number
  imageHeight: number
  crop: BBox
  masks: MaskRect[]
  selectedGroupId: string | null
  generationMode: CardGenerationMode
  mode: 'front' | 'back'
  outputType?: string
  outputQuality?: number
}

export interface RenderedPreviewAssets extends ManualPreviewSet {
  frontBlob: Blob | null
  backBlob: Blob | null
}

const imageLoadCache = new Map<string, Promise<HTMLImageElement>>()
const previewAssetCache = new Map<string, { assets: RenderedPreviewAssets; bytes: number }>()
const PREVIEW_CACHE_MAX_ENTRIES = 48
const PREVIEW_CACHE_MAX_BYTES = 64 * 1024 * 1024

function clampBox([x1, y1, x2, y2]: BBox, width: number, height: number): BBox {
  const nx1 = Math.max(0, Math.min(x1, width - 1))
  const ny1 = Math.max(0, Math.min(y1, height - 1))
  const nx2 = Math.max(nx1 + 1, Math.min(x2, width))
  const ny2 = Math.max(ny1 + 1, Math.min(y2, height))
  return [Math.round(nx1), Math.round(ny1), Math.round(nx2), Math.round(ny2)]
}

function normalizeOutputQuality(value?: number): number | undefined {
  if (typeof value !== 'number') return undefined
  return Math.max(0.1, Math.min(1, value))
}

function buildPreviewCacheKey(options: {
  sourceUrl: string
  imageWidth: number
  imageHeight: number
  crop: BBox
  masks: MaskRect[]
  selectedGroupId: string | null
  generationMode: CardGenerationMode
  outputType: string
  outputQuality?: number
}): string {
  return JSON.stringify({
    sourceUrl: options.sourceUrl,
    imageWidth: options.imageWidth,
    imageHeight: options.imageHeight,
    crop: options.crop,
    selectedGroupId: options.selectedGroupId,
    generationMode: options.generationMode,
    outputType: options.outputType,
    outputQuality: options.outputQuality ?? null,
    masks: options.masks.map((mask) => ({
      id: mask.id,
      bbox: mask.bbox,
      groupId: mask.card_group_id ?? null,
      order: mask.card_order ?? null,
    })),
  })
}

function releasePreviewAssets(assets: RenderedPreviewAssets): void {
  if (assets.frontUrl) URL.revokeObjectURL(assets.frontUrl)
  if (assets.backUrl) URL.revokeObjectURL(assets.backUrl)
}

function rememberPreviewAssets(key: string, assets: RenderedPreviewAssets): RenderedPreviewAssets {
  const bytes = (assets.frontBlob?.size ?? 0) + (assets.backBlob?.size ?? 0)
  const existing = previewAssetCache.get(key)
  if (existing) {
    previewAssetCache.delete(key)
    releasePreviewAssets(existing.assets)
  }
  previewAssetCache.set(key, { assets, bytes })

  let totalBytes = 0
  previewAssetCache.forEach((entry) => {
    totalBytes += entry.bytes
  })

  while (previewAssetCache.size > PREVIEW_CACHE_MAX_ENTRIES || totalBytes > PREVIEW_CACHE_MAX_BYTES) {
    const oldestKey = previewAssetCache.keys().next().value as string | undefined
    if (!oldestKey) break
    const oldest = previewAssetCache.get(oldestKey)
    previewAssetCache.delete(oldestKey)
    if (!oldest) continue
    totalBytes -= oldest.bytes
    releasePreviewAssets(oldest.assets)
  }

  return assets
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  outputType: string,
  outputQuality?: number,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (value) {
          resolve(value)
          return
        }
        reject(new Error('浏览器没有成功生成预览图片。'))
      },
      outputType,
      outputType === 'image/png' ? undefined : outputQuality,
    )
  })
}

export function maskGroupId(mask: MaskRect): string {
  return mask.card_group_id || mask.id
}

export function groupMasksByCard(masks: MaskRect[]): MaskGroupPreview[] {
  const grouped = new Map<string, MaskGroupPreview>()
  masks.forEach((mask, index) => {
    const groupId = maskGroupId(mask)
    const order = mask.card_order ?? index + 1
    const current = grouped.get(groupId)
    if (current) {
      current.masks.push(mask)
      current.order = Math.min(current.order, order)
      return
    }
    grouped.set(groupId, { groupId, order, masks: [mask] })
  })
  return [...grouped.values()].sort((left, right) => left.order - right.order)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageLoadCache.get(url)
  if (cached) return cached

  const task = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => {
      imageLoadCache.delete(url)
      reject(new Error('预览图片加载失败。'))
    }
    image.src = url
  })

  imageLoadCache.set(url, task)
  return task
}

function drawMaskRect(
  context: CanvasRenderingContext2D,
  mask: MaskRect,
  crop: BBox,
  selectedGroupId: string | null,
  generationMode: CardGenerationMode,
  mode: 'front' | 'back',
) {
  const groupId = maskGroupId(mask)
  if (generationMode === 'hide-all-reveal-current') {
    if (mode === 'back' && selectedGroupId && groupId === selectedGroupId) {
      return
    }
  } else if (generationMode === 'hide-current-only') {
    if (mode === 'front' && selectedGroupId && groupId !== selectedGroupId) {
      return
    }
    if (mode === 'back') {
      return
    }
  } else if (mode === 'back') {
    return
  }

  const relative: BBox = [
    mask.bbox[0] - crop[0],
    mask.bbox[1] - crop[1],
    mask.bbox[2] - crop[0],
    mask.bbox[3] - crop[1],
  ]
  const width = Math.max(1, relative[2] - relative[0])
  const height = Math.max(1, relative[3] - relative[1])
  const highlighted = selectedGroupId !== null && groupId === selectedGroupId
  context.save()
  context.fillStyle = highlighted && mode === 'front' ? 'rgba(250, 236, 180, 0.98)' : generationMode === 'single-card-toggle' ? 'rgba(255, 255, 255, 0.92)' : 'rgba(255, 255, 255, 0.96)'
  context.strokeStyle = highlighted ? 'rgba(217, 119, 6, 0.98)' : generationMode === 'single-card-toggle' ? 'rgba(45, 45, 45, 0.92)' : 'rgba(115, 115, 115, 0.86)'
  context.lineWidth = 3
  context.beginPath()
  context.roundRect(relative[0], relative[1], width, height, 10)
  context.fill()
  context.stroke()
  context.restore()
}

async function renderPreviewBlob(options: RenderPreviewOptions): Promise<Blob> {
  const image = await loadImage(options.sourceUrl)
  const crop = clampBox(options.crop, options.imageWidth, options.imageHeight)
  const canvas = document.createElement('canvas')
  canvas.width = crop[2] - crop[0]
  canvas.height = crop[3] - crop[1]
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器不支持预览画布。')

  if (options.outputType === 'image/jpeg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  context.drawImage(
    image,
    crop[0],
    crop[1],
    crop[2] - crop[0],
    crop[3] - crop[1],
    0,
    0,
    canvas.width,
    canvas.height,
  )

  options.masks.forEach((mask) => drawMaskRect(context, mask, crop, options.selectedGroupId, options.generationMode, options.mode))
  return canvasToBlob(canvas, options.outputType || 'image/png', normalizeOutputQuality(options.outputQuality))
}

export async function renderDraftPreviewAssets(options: {
  draft: CardDraft
  sourceUrl: string
  imageWidth: number
  imageHeight: number
  selectedGroupId: string | null
  generationMode?: CardGenerationMode
  outputType?: string
  outputQuality?: number
}): Promise<RenderedPreviewAssets> {
  const crop = options.draft.crop?.bbox ?? [0, 0, options.imageWidth, options.imageHeight]
  const generationMode = options.generationMode ?? 'hide-all-reveal-current'
  const selectedGroupId = options.selectedGroupId ?? groupMasksByCard(options.draft.masks)[0]?.groupId ?? null
  const outputType = options.outputType || 'image/png'
  const outputQuality = normalizeOutputQuality(options.outputQuality)
  const cacheKey = buildPreviewCacheKey({
    sourceUrl: options.sourceUrl,
    imageWidth: options.imageWidth,
    imageHeight: options.imageHeight,
    crop,
    masks: options.draft.masks,
    selectedGroupId,
    generationMode,
    outputType,
    outputQuality,
  })
  const cached = previewAssetCache.get(cacheKey)
  if (cached) {
    previewAssetCache.delete(cacheKey)
    previewAssetCache.set(cacheKey, cached)
    return cached.assets
  }

  const [frontBlob, backBlob] = await Promise.all([
    renderPreviewBlob({
      sourceUrl: options.sourceUrl,
      imageWidth: options.imageWidth,
      imageHeight: options.imageHeight,
      crop,
      masks: options.draft.masks,
      selectedGroupId,
      generationMode,
      mode: 'front',
      outputType,
      outputQuality,
    }),
    renderPreviewBlob({
      sourceUrl: options.sourceUrl,
      imageWidth: options.imageWidth,
      imageHeight: options.imageHeight,
      crop,
      masks: options.draft.masks,
      selectedGroupId,
      generationMode,
      mode: 'back',
      outputType,
      outputQuality,
    }),
  ])

  return rememberPreviewAssets(cacheKey, {
    frontBlob,
    backBlob,
    frontUrl: URL.createObjectURL(frontBlob),
    backUrl: URL.createObjectURL(backBlob),
  })
}

export async function renderDraftPreviewSet(options: {
  draft: CardDraft
  sourceUrl: string
  imageWidth: number
  imageHeight: number
  selectedGroupId: string | null
  generationMode?: CardGenerationMode
  outputType?: string
  outputQuality?: number
}): Promise<ManualPreviewSet> {
  const assets = await renderDraftPreviewAssets(options)
  return {
    frontUrl: assets.frontUrl,
    backUrl: assets.backUrl,
  }
}
