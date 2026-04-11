import type { CardGenerationMode, DraftListItem, ImageExportFormat, ImportCompressionFormat, WorkbenchSettings } from '@/types'

export const WORKBENCH_SETTINGS_STORAGE_KEY = 'anki-cloze:workbench-settings'

export const DEFAULT_WORKBENCH_SETTINGS: WorkbenchSettings = {
  importCompressionEnabled: true,
  importCompressionFormat: 'webp',
  importImageQuality: 50,
  importMaxDimension: 1920,
  imageGroupExportFormat: 'webp',
  imageGroupExportQuality: 50,
  cardGenerationMode: 'hide-all-reveal-current',
  disableAnimations: false,
  modernFloatingToolbar: true,
}

export function normalizeWorkbenchSettings(
  value?: Partial<WorkbenchSettings> | null,
): WorkbenchSettings {
  return {
    importCompressionEnabled: Boolean(value?.importCompressionEnabled ?? DEFAULT_WORKBENCH_SETTINGS.importCompressionEnabled),
    importCompressionFormat: normalizeImportCompressionFormat(value?.importCompressionFormat),
    importImageQuality: clampInt(value?.importImageQuality, 1, 100, DEFAULT_WORKBENCH_SETTINGS.importImageQuality),
    importMaxDimension: clampInt(value?.importMaxDimension, 480, 4096, DEFAULT_WORKBENCH_SETTINGS.importMaxDimension),
    imageGroupExportFormat: normalizeImageExportFormat(value?.imageGroupExportFormat),
    imageGroupExportQuality: clampInt(value?.imageGroupExportQuality, 1, 100, DEFAULT_WORKBENCH_SETTINGS.imageGroupExportQuality),
    cardGenerationMode: normalizeCardGenerationMode(value?.cardGenerationMode),
    disableAnimations: Boolean(value?.disableAnimations ?? DEFAULT_WORKBENCH_SETTINGS.disableAnimations),
    modernFloatingToolbar: Boolean(value?.modernFloatingToolbar ?? DEFAULT_WORKBENCH_SETTINGS.modernFloatingToolbar),
  }
}

export function loadWorkbenchSettings(): WorkbenchSettings {
  if (typeof window === 'undefined') return DEFAULT_WORKBENCH_SETTINGS
  try {
    const raw = window.localStorage.getItem(WORKBENCH_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_WORKBENCH_SETTINGS
    return normalizeWorkbenchSettings(JSON.parse(raw) as Partial<WorkbenchSettings>)
  } catch {
    return DEFAULT_WORKBENCH_SETTINGS
  }
}

export function saveWorkbenchSettings(settings: WorkbenchSettings): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(WORKBENCH_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeWorkbenchSettings(settings)))
}

export function exportMimeType(format: ImageExportFormat): 'image/jpeg' | 'image/png' | 'image/webp' {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    default:
      return 'image/webp'
  }
}

export function exportFileExtension(format: ImageExportFormat): string {
  switch (format) {
    case 'jpeg':
      return 'jpg'
    default:
      return format
  }
}

export interface ExportFormatPolicy {
  allowedFormats: ImageExportFormat[]
  lockedReason: string | null
  summary: string
}

export function resolveExportFormatPolicy(items: Array<Pick<DraftListItem, 'image'>>): ExportFormatPolicy {
  if (items.length === 0) {
    return {
      allowedFormats: ['webp', 'jpeg', 'png'],
      lockedReason: null,
      summary: '当前会基于原图重新生成导出结果，可选 WebP、JPG 或 PNG。',
    }
  }

  const hasProjectOptimized = items.some((item) => item.image.source_quality === 'project-optimized')
  if (hasProjectOptimized) {
    return {
      allowedFormats: ['webp'],
      lockedReason: '这批图片里包含已执行过项目压缩的图片。为了避免把压缩后的图再包装成 PNG 或 JPG，当前只保留 WebP。',
      summary: '这批图片里包含已经压缩过的项目图片，导出只保留 WebP。',
    }
  }

  const hasImportCompressed = items.some((item) => item.image.source_quality === 'import-compressed')
  if (hasImportCompressed) {
    return {
      allowedFormats: ['webp'],
      lockedReason: '这批图片在导入时已经启用了压缩。为了避免把压缩后的图重新生成为 PNG 或 JPG，当前只保留 WebP。',
      summary: '这批图片在导入时已经压缩过，导出只保留 WebP。',
    }
  }

  const hasHeifConverted = items.some((item) => item.image.source_quality === 'heif-converted')
  if (hasHeifConverted) {
    return {
      allowedFormats: ['webp'],
      lockedReason: '这批图片里包含从 HEIF / HEIC 转成可编辑格式的图片。为了避免把转换后的结果再包装成 PNG 或 JPG，当前只保留 WebP。',
      summary: '这批图片里包含已从 HEIF / HEIC 转换过的图片，导出只保留 WebP。',
    }
  }

  const hasLegacyUnknown = items.some((item) => item.image.source_quality === 'legacy-unknown')
  if (hasLegacyUnknown) {
    return {
      allowedFormats: ['webp'],
      lockedReason: '这批图片来自旧版本地项目，当前无法严格确认是否仍是原图。为了避免误导，当前只保留 WebP。若要导出 PNG 或 JPG，请重新导入原图。',
      summary: '这批图片来自旧版本地项目，当前只保留 WebP，避免把未知来源的图片误当作原图导出。',
    }
  }

  return {
    allowedFormats: ['webp', 'jpeg', 'png'],
    lockedReason: null,
    summary: '当前会基于原图重新生成导出结果，可选 WebP、JPG 或 PNG。',
  }
}

export function pickAvailableExportFormat(
  preferredFormat: ImageExportFormat,
  allowedFormats: ImageExportFormat[],
): ImageExportFormat {
  if (allowedFormats.includes(preferredFormat)) {
    return preferredFormat
  }
  return allowedFormats[0] ?? 'webp'
}

export function importCompressionMimeType(format: ImportCompressionFormat): 'image/webp' | 'image/jpeg' {
  return format === 'jpeg' ? 'image/jpeg' : 'image/webp'
}

function normalizeImageExportFormat(value: string | null | undefined): ImageExportFormat {
  if (value === 'jpeg' || value === 'png' || value === 'webp') {
    return value
  }
  return DEFAULT_WORKBENCH_SETTINGS.imageGroupExportFormat
}

function normalizeImportCompressionFormat(value?: string | null): ImportCompressionFormat {
  return value === 'jpeg' || value === 'webp' ? value : DEFAULT_WORKBENCH_SETTINGS.importCompressionFormat
}

function normalizeCardGenerationMode(value?: string | null): CardGenerationMode {
  if (value === 'hide-all-reveal-current' || value === 'hide-current-only' || value === 'single-card-toggle') {
    return value
  }
  return DEFAULT_WORKBENCH_SETTINGS.cardGenerationMode
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.round(Math.max(min, Math.min(max, value as number)))
}
