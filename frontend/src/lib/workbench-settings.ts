import type { ImageExportFormat, ImportCompressionFormat, WorkbenchSettings } from '@/types'

export const WORKBENCH_SETTINGS_STORAGE_KEY = 'anki-cloze:workbench-settings'

export const DEFAULT_WORKBENCH_SETTINGS: WorkbenchSettings = {
  importCompressionEnabled: true,
  importCompressionFormat: 'webp',
  importImageQuality: 50,
  importMaxDimension: 1920,
  imageGroupExportFormat: 'webp',
  imageGroupExportQuality: 50,
}

export function normalizeWorkbenchSettings(
  value?: Partial<WorkbenchSettings> | null,
): WorkbenchSettings {
  const importCompressionEnabled = Boolean(value?.importCompressionEnabled ?? DEFAULT_WORKBENCH_SETTINGS.importCompressionEnabled)
  const importCompressionFormat = normalizeImportCompressionFormat(value?.importCompressionFormat)
  return {
    importCompressionEnabled,
    importCompressionFormat,
    importImageQuality: clampInt(value?.importImageQuality, 1, 100, DEFAULT_WORKBENCH_SETTINGS.importImageQuality),
    importMaxDimension: clampInt(value?.importMaxDimension, 480, 4096, DEFAULT_WORKBENCH_SETTINGS.importMaxDimension),
    imageGroupExportFormat: normalizeImageExportFormat(
      value?.imageGroupExportFormat,
      importCompressionEnabled,
      importCompressionFormat,
    ),
    imageGroupExportQuality: clampInt(value?.imageGroupExportQuality, 1, 100, DEFAULT_WORKBENCH_SETTINGS.imageGroupExportQuality),
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

export function allowedImageExportFormats(settings: Pick<WorkbenchSettings, 'importCompressionEnabled' | 'importCompressionFormat'>): ImageExportFormat[] {
  if (!settings.importCompressionEnabled) {
    return ['webp', 'jpeg', 'png']
  }
  if (settings.importCompressionFormat === 'jpeg') {
    return ['webp', 'jpeg']
  }
  return ['webp']
}

export function importCompressionMimeType(format: ImportCompressionFormat): 'image/webp' | 'image/jpeg' {
  return format === 'jpeg' ? 'image/jpeg' : 'image/webp'
}

function normalizeImageExportFormat(
  value: string | null | undefined,
  importCompressionEnabled: boolean,
  importCompressionFormat: ImportCompressionFormat,
): ImageExportFormat {
  const allowed = allowedImageExportFormats({ importCompressionEnabled, importCompressionFormat })
  if (value === 'jpeg' || value === 'png' || value === 'webp') {
    return allowed.includes(value) ? value : allowed[0]
  }
  return allowed[0]
}

function normalizeImportCompressionFormat(value?: string | null): ImportCompressionFormat {
  return value === 'jpeg' || value === 'webp' ? value : DEFAULT_WORKBENCH_SETTINGS.importCompressionFormat
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.round(Math.max(min, Math.min(max, value as number)))
}
