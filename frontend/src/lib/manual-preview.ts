import type { BBox, CardDraft, ManualPreviewSet, MaskRect } from '@/types'

export interface MaskGroupPreview {
  groupId: string
  order: number
  masks: MaskRect[]
}

function clampBox([x1, y1, x2, y2]: BBox, width: number, height: number): BBox {
  const nx1 = Math.max(0, Math.min(x1, width - 1))
  const ny1 = Math.max(0, Math.min(y1, height - 1))
  const nx2 = Math.max(nx1 + 1, Math.min(x2, width))
  const ny2 = Math.max(ny1 + 1, Math.min(y2, height))
  return [Math.round(nx1), Math.round(ny1), Math.round(nx2), Math.round(ny2)]
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
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('预览图片加载失败。'))
    image.src = url
  })
}

function drawMaskRect(
  context: CanvasRenderingContext2D,
  mask: MaskRect,
  crop: BBox,
  selectedGroupId: string | null,
  mode: 'front' | 'back',
) {
  const groupId = maskGroupId(mask)
  if (mode === 'back' && selectedGroupId && groupId === selectedGroupId) {
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
  context.fillStyle = highlighted && mode === 'front' ? 'rgba(250, 236, 180, 0.98)' : 'rgba(255, 255, 255, 0.96)'
  context.strokeStyle = highlighted ? 'rgba(217, 119, 6, 0.98)' : 'rgba(115, 115, 115, 0.86)'
  context.lineWidth = 3
  context.beginPath()
  context.roundRect(relative[0], relative[1], width, height, 10)
  context.fill()
  context.stroke()
  context.restore()
}

async function renderPreviewUrl(options: {
  sourceUrl: string
  imageWidth: number
  imageHeight: number
  crop: BBox
  masks: MaskRect[]
  selectedGroupId: string | null
  mode: 'front' | 'back'
  outputType?: string
  outputQuality?: number
}): Promise<string> {
  const image = await loadImage(options.sourceUrl)
  const crop = clampBox(options.crop, options.imageWidth, options.imageHeight)
  const canvas = document.createElement('canvas')
  canvas.width = crop[2] - crop[0]
  canvas.height = crop[3] - crop[1]
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器不支持预览画布。')

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

  options.masks.forEach((mask) => drawMaskRect(context, mask, crop, options.selectedGroupId, options.mode))
  const outputType = options.outputType || 'image/png'
  const outputQuality = typeof options.outputQuality === 'number'
    ? Math.max(0.1, Math.min(1, options.outputQuality))
    : undefined
  return canvas.toDataURL(outputType, outputQuality)
}

export async function renderDraftPreviewSet(options: {
  draft: CardDraft
  sourceUrl: string
  imageWidth: number
  imageHeight: number
  selectedGroupId: string | null
  outputType?: string
  outputQuality?: number
}): Promise<ManualPreviewSet> {
  const crop = options.draft.crop?.bbox ?? [0, 0, options.imageWidth, options.imageHeight]
  const selectedGroupId = options.selectedGroupId ?? groupMasksByCard(options.draft.masks)[0]?.groupId ?? null
  const [frontUrl, backUrl] = await Promise.all([
    renderPreviewUrl({
      sourceUrl: options.sourceUrl,
      imageWidth: options.imageWidth,
      imageHeight: options.imageHeight,
      crop,
      masks: options.draft.masks,
      selectedGroupId,
      mode: 'front',
      outputType: options.outputType,
      outputQuality: options.outputQuality,
    }),
    renderPreviewUrl({
      sourceUrl: options.sourceUrl,
      imageWidth: options.imageWidth,
      imageHeight: options.imageHeight,
      crop,
      masks: options.draft.masks,
      selectedGroupId,
      mode: 'back',
      outputType: options.outputType,
      outputQuality: options.outputQuality,
    }),
  ])
  return { frontUrl, backUrl }
}
