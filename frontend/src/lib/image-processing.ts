import { DEFAULT_WORKBENCH_SETTINGS, importCompressionMimeType } from '@/lib/workbench-settings'
import type { WorkbenchSettings } from '@/types'

interface TransformImageOptions {
  maxDimension?: number | null
  outputType: 'image/webp' | 'image/jpeg' | 'image/png'
  outputQuality?: number
  onProgress?: (progress: { stage: 'decode' | 'draw' | 'encode'; progress: number; label: string }) => void
}

interface TransformedImageResult {
  blob: Blob
  mediaType: string
  width: number
  height: number
}

export interface PreparedImportImage {
  blob: Blob
  mediaType: string
  convertedFromHeif: boolean
}

const HEIF_MIME_TYPES = new Set([
  'image/heic',
  'image/heic-sequence',
  'image/heif',
  'image/heif-sequence',
])

export function resolvedHeifImportMimeType(
  settings: WorkbenchSettings = DEFAULT_WORKBENCH_SETTINGS,
): 'image/webp' | 'image/jpeg' | 'image/png' {
  if (settings.importCompressionEnabled) {
    return importCompressionMimeType(settings.importCompressionFormat)
  }
  return 'image/png'
}

export function isHeifLikeFile(file: Blob, name?: string): boolean {
  const normalizedType = (file.type || '').toLowerCase()
  if (HEIF_MIME_TYPES.has(normalizedType)) return true
  return Boolean(name && /\.(heic|heif)$/i.test(name))
}

export async function prepareImportedImage(
  blob: Blob,
  name?: string,
  settings: WorkbenchSettings = DEFAULT_WORKBENCH_SETTINGS,
): Promise<PreparedImportImage> {
  if (!isHeifLikeFile(blob, name)) {
    return {
      blob,
      mediaType: blob.type || 'image/png',
      convertedFromHeif: false,
    }
  }

  const { default: heic2any } = await import('heic2any')
  const targetMimeType = resolvedHeifImportMimeType(settings)
  const converted = await heic2any({
    blob,
    toType: targetMimeType === 'image/png' ? 'image/png' : 'image/jpeg',
    quality: Math.max(0.1, Math.min(1, settings.importImageQuality / 100)),
  })

  const nextBlob = Array.isArray(converted) ? converted[0] : converted
  if (!(nextBlob instanceof Blob)) {
    throw new Error('HEIF 图片转换失败，请改用 JPG、PNG 或 WebP 后再试。')
  }

  return {
    blob: nextBlob,
    mediaType: nextBlob.type || (targetMimeType === 'image/png' ? 'image/png' : 'image/jpeg'),
    convertedFromHeif: true,
  }
}

export async function normalizeImportedImage(
  blob: Blob,
  settings: WorkbenchSettings,
  onProgress?: (progress: { stage: 'decode' | 'draw' | 'encode'; progress: number; label: string }) => void,
): Promise<{ blob: Blob; mediaType: string }> {
  if (!settings.importCompressionEnabled) {
    return {
      blob,
      mediaType: blob.type || 'image/png',
    }
  }

  const transformed = await transformImageBlob(blob, {
    maxDimension: settings.importMaxDimension,
    outputType: importCompressionMimeType(settings.importCompressionFormat),
    outputQuality: settings.importImageQuality / 100,
    onProgress,
  })

  return {
    blob: transformed.blob,
    mediaType: transformed.mediaType,
  }
}

export async function transformImageBlob(
  blob: Blob,
  options: TransformImageOptions,
): Promise<TransformedImageResult> {
  const imageUrl = URL.createObjectURL(blob)

  try {
    options.onProgress?.({ stage: 'decode', progress: 10, label: '正在读取原图' })
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image()
      next.onload = () => resolve(next)
      next.onerror = () => reject(new Error('图片预处理失败，无法读取原图。'))
      next.src = imageUrl
    })

    const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight, options.maxDimension)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('浏览器不支持导入预处理画布。')
    }

    options.onProgress?.({ stage: 'draw', progress: 55, label: '正在缩放并绘制图片' })
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    if (options.outputType === 'image/jpeg') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
    }
    context.drawImage(image, 0, 0, width, height)

    options.onProgress?.({ stage: 'encode', progress: 85, label: '正在生成压缩结果' })
    const normalizedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (value) resolve(value)
          else reject(new Error('图片预处理失败，无法生成压缩结果。'))
        },
        options.outputType,
        options.outputType === 'image/png'
          ? undefined
          : Math.max(0.1, Math.min(1, options.outputQuality ?? 0.5)),
      )
    })

    return {
      blob: normalizedBlob,
      mediaType: options.outputType,
      width,
      height,
    }
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

export function fitWithin(width: number, height: number, maxDimension?: number | null): { width: number; height: number } {
  if (!maxDimension || maxDimension <= 0) {
    return { width, height }
  }
  const longest = Math.max(width, height)
  if (longest <= maxDimension) {
    return { width, height }
  }

  const scale = maxDimension / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
