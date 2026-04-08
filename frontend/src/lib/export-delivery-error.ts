export type ExportDeliveryStage = 'share' | 'download' | 'open-after-download'

type ExportDeliveryCopy = {
  title: string
  description: string
}

const COPY_BY_STAGE: Record<ExportDeliveryStage, ExportDeliveryCopy> = {
  share: {
    title: '系统分享没有打开',
    description: '当前浏览器或系统拒绝分享此类文件。在 Chrome Android 上，部分文件类型可能不被系统分享面板接受。系统会自动降级到直接下载。',
  },
  download: {
    title: '浏览器拦住了文件下载',
    description: '浏览器没有放行这次下载，可能是因为生成耗时过长导致操作权限过期。你可以通过弹出的"手动保存"按钮再次触发下载。',
  },
  'open-after-download': {
    title: '系统没有接过这个文件',
    description: '文件已经开始下载，但当前浏览器没有成功把它继续交给可打开它的应用。下载完成后请手动用文件管理器打开。',
  },
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return ''
}

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase()
}

function isPermissionStyleError(message: string): boolean {
  const normalized = normalizeMessage(message)
  return (
    normalized.includes('permission denied') ||
    normalized.includes('not allowed') ||
    normalized.includes('denied') ||
    normalized.includes('securityerror') ||
    normalized.includes('the request is not allowed')
  )
}

function isAbortStyleError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export class ExportDeliveryError extends Error {
  readonly stage: ExportDeliveryStage
  readonly title: string
  readonly description: string
  readonly rawMessage: string

  constructor(stage: ExportDeliveryStage, message?: string) {
    const copy = COPY_BY_STAGE[stage]
    const safeMessage = message ?? ''
    super(copy.description)
    this.name = 'ExportDeliveryError'
    this.stage = stage
    this.title = copy.title
    this.description = safeMessage && !isPermissionStyleError(safeMessage)
      ? `${copy.description} 浏览器返回：${safeMessage}`
      : copy.description
    this.rawMessage = safeMessage
  }
}

export function toExportDeliveryError(stage: ExportDeliveryStage, error: unknown): ExportDeliveryError | null {
  if (isAbortStyleError(error)) return null
  const rawMessage = readErrorMessage(error)
  return new ExportDeliveryError(stage, rawMessage)
}

export function describeActionError(error: unknown): ExportDeliveryCopy {
  if (error instanceof ExportDeliveryError) {
    return {
      title: error.title,
      description: error.description,
    }
  }

  return {
    title: '操作失败',
    description: error instanceof Error ? error.message : '请稍后再试。',
  }
}
