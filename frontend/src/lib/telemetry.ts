import { track } from '@vercel/analytics'
import type { ImageSourceQuality } from '@/types'

type DeviceKind = 'mobile' | 'desktop'
type ImageOperationType = 'masks-commit' | 'crop-commit'
type FlushReason = 'manual' | 'interval' | 'hidden' | 'pagehide' | 'image-switch'

type ClickCounterEntry = {
  controlId: string
  category: string
  section: string
  label: string
  count: number
}

type EditingSession = {
  startedAt: number
  sourceQuality: ImageSourceQuality
  initialMaskCount: number
  currentMaskCount: number
  totalOperations: number
  maskCommitOperations: number
  maskAddOperations: number
  maskRemoveOperations: number
  maskAdjustOperations: number
  cropCommitOperations: number
  focusOpenCount: number
  focusCloseCount: number
}

type TelemetryContext = {
  deviceKind: DeviceKind
  canDirectAnki: boolean
}

const CLICK_FLUSH_INTERVAL_MS = 45_000
const MAX_TRACKED_CONTROLS = 80
const DIALOG_SECTIONS = new Set(['export-flow', 'focus-editor', 'preview-dialog', 'deck-picker'])

const telemetryState: {
  context: TelemetryContext
  sessionStartedAt: number
  importedAt: number | null
  firstEditAt: number | null
  exportOpenedAt: number | null
  exportCompletedAt: number | null
  importedImageCount: number
  totalOperations: number
  masksCommitOperations: number
  cropCommitOperations: number
  focusOpenCount: number
  focusCloseCount: number
  exportOpenCount: number
  exportCompleteCount: number
  slowSaveSignalCount: number
  slowSavePromptCount: number
  asyncActionCount: number
  totalClickCount: number
  uniqueControlKeys: Set<string>
  clickCounters: Map<string, ClickCounterEntry>
  clickFlushTimer: number | null
  currentEditingSession: EditingSession | null
  currentEditingDraftId: string | null
  visibilityListenerBound: boolean
  lastWorkspaceSummaryAt: number | null
} = {
  context: {
    deviceKind: 'desktop',
    canDirectAnki: true,
  },
  sessionStartedAt: Date.now(),
  importedAt: null,
  firstEditAt: null,
  exportOpenedAt: null,
  exportCompletedAt: null,
  importedImageCount: 0,
  totalOperations: 0,
  masksCommitOperations: 0,
  cropCommitOperations: 0,
  focusOpenCount: 0,
  focusCloseCount: 0,
  exportOpenCount: 0,
  exportCompleteCount: 0,
  slowSaveSignalCount: 0,
  slowSavePromptCount: 0,
  asyncActionCount: 0,
  totalClickCount: 0,
  uniqueControlKeys: new Set(),
  clickCounters: new Map(),
  clickFlushTimer: null,
  currentEditingSession: null,
  currentEditingDraftId: null,
  visibilityListenerBound: false,
  lastWorkspaceSummaryAt: null,
}

function safeTrack(name: string, properties: Record<string, string | number | boolean | null | undefined>) {
  const sanitized = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  ) as Record<string, string | number | boolean | null>

  try {
    track(name, sanitized)
  } catch {
    // Vercel analytics should not break the product flow.
  }
}

function roundDurationMs(value: number): number {
  return Math.max(0, Math.round(value))
}

function secondsSince(timestamp: number | null): number | null {
  if (!timestamp) return null
  return Math.max(0, Math.round((Date.now() - timestamp) / 1000))
}

function normalizeText(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return fallback
  return normalized.slice(0, 48)
}

function detectSection(element: HTMLElement | null): string {
  if (!element) return 'unknown'
  const sectionOwner = element.closest<HTMLElement>('[data-telemetry-section]')
  return sectionOwner?.dataset.telemetrySection ?? 'unknown'
}

function resolveControlId(element: HTMLElement, section: string): string {
  const explicitId = element.dataset.telemetryId
  if (explicitId) return explicitId

  if (section === 'image-list') {
    if (element.dataset.draftId) return 'image-select-item'
    if (element.closest('[data-draft-id]')) return 'image-select-item'
  }

  if (section === 'export-flow') {
    if (element.dataset.draftId || element.closest('[data-draft-id]')) return 'export-queue-item'
  }

  const ariaLabel = element.getAttribute('aria-label')
  if (ariaLabel) return normalizeText(ariaLabel, 'unnamed-control')

  const title = element.getAttribute('title')
  if (title) return normalizeText(title, 'unnamed-control')

  const text = normalizeText(element.textContent, '')
  if (text) return text

  if (element.getAttribute('role') === 'tab') return 'tab-trigger'
  if (element.getAttribute('role') === 'menuitem') return 'menu-item'
  if (element.tagName.toLowerCase() === 'button') return 'button'
  if (element.tagName.toLowerCase() === 'a') return 'link'

  return 'unnamed-control'
}

function resolveCategory(element: HTMLElement): string {
  const role = element.getAttribute('role')
  if (role === 'menuitem') return 'menu-item'
  if (role === 'tab') return 'tab'
  if (role === 'switch') return 'switch'
  if (element.tagName.toLowerCase() === 'button') return 'button'
  if (element.tagName.toLowerCase() === 'a') return 'link'
  return 'component'
}

function flushClickCounters(reason: FlushReason) {
  if (telemetryState.clickCounters.size === 0) return

  telemetryState.clickCounters.forEach((entry) => {
    safeTrack('ui_click_counter', {
      control_id: entry.controlId,
      control_category: entry.category,
      section: entry.section,
      control_label: entry.label,
      click_count: entry.count,
      flush_reason: reason,
      device_kind: telemetryState.context.deviceKind,
    })
  })
  telemetryState.clickCounters.clear()
}

function scheduleClickFlush() {
  if (telemetryState.clickFlushTimer !== null) return
  telemetryState.clickFlushTimer = window.setTimeout(() => {
    telemetryState.clickFlushTimer = null
    flushClickCounters('interval')
  }, CLICK_FLUSH_INTERVAL_MS)
}

function ensureLifecycleListeners() {
  if (telemetryState.visibilityListenerBound || typeof document === 'undefined') return
  telemetryState.visibilityListenerBound = true

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      finalizeCurrentImageSession('hidden')
      flushClickCounters('hidden')
      flushWorkspaceSummary('hidden')
    }
  })

  window.addEventListener('pagehide', () => {
    finalizeCurrentImageSession('pagehide')
    flushClickCounters('pagehide')
    flushWorkspaceSummary('pagehide')
  })
}

export function initializeTelemetry(context: TelemetryContext) {
  telemetryState.context = context
  ensureLifecycleListeners()
}

export function updateTelemetryContext(context: Partial<TelemetryContext>) {
  telemetryState.context = {
    ...telemetryState.context,
    ...context,
  }
}

export function recordUiClick(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return
  const interactive = target.closest<HTMLElement>('[data-telemetry-id], [data-slot="button"], button, [role="button"], [role="menuitem"], [role="tab"], a')
  if (!interactive) return

  const section = detectSection(interactive)
  const controlId = resolveControlId(interactive, section)
  const category = resolveCategory(interactive)
  const label = normalizeText(interactive.textContent || interactive.getAttribute('aria-label') || controlId, controlId)
  const counterKey = `${section}::${category}::${controlId}`

  if (!telemetryState.clickCounters.has(counterKey) && telemetryState.clickCounters.size >= MAX_TRACKED_CONTROLS) {
    return
  }

  const existing = telemetryState.clickCounters.get(counterKey)
  telemetryState.totalClickCount += 1
  telemetryState.uniqueControlKeys.add(counterKey)
  if (existing) {
    existing.count += 1
  } else {
    telemetryState.clickCounters.set(counterKey, {
      controlId,
      category,
      section,
      label,
      count: 1,
    })
  }

  scheduleClickFlush()
}

export function recordImportCompleted(payload: {
  sourceLabel: string
  inputCount: number
  importedCount: number
  skippedCount: number
  durationMs: number
  importCompressionEnabled: boolean
}) {
  telemetryState.importedAt = Date.now()
  telemetryState.importedImageCount += payload.importedCount

  safeTrack('project_import_completed', {
    source_label: payload.sourceLabel,
    input_count: payload.inputCount,
    imported_count: payload.importedCount,
    skipped_count: payload.skippedCount,
    duration_ms: roundDurationMs(payload.durationMs),
    compressed_on_import: payload.importCompressionEnabled,
    device_kind: telemetryState.context.deviceKind,
  })
}

export function beginImageEditingSession(payload: {
  draftId: string | null
  maskCount: number
  sourceQuality: ImageSourceQuality
}) {
  if (!payload.draftId) {
    finalizeCurrentImageSession('manual')
    return
  }

  if (telemetryState.currentEditingDraftId === payload.draftId && telemetryState.currentEditingSession) {
    telemetryState.currentEditingSession.currentMaskCount = payload.maskCount
    telemetryState.currentEditingSession.sourceQuality = payload.sourceQuality
    return
  }

  finalizeCurrentImageSession('image-switch')
  telemetryState.currentEditingDraftId = payload.draftId
  telemetryState.currentEditingSession = {
    startedAt: Date.now(),
    sourceQuality: payload.sourceQuality,
    initialMaskCount: payload.maskCount,
    currentMaskCount: payload.maskCount,
    totalOperations: 0,
    maskCommitOperations: 0,
    maskAddOperations: 0,
    maskRemoveOperations: 0,
    maskAdjustOperations: 0,
    cropCommitOperations: 0,
    focusOpenCount: 0,
    focusCloseCount: 0,
  }
}

export function finalizeCurrentImageSession(reason: FlushReason | 'export-open' | 'manual') {
  const session = telemetryState.currentEditingSession
  if (!session || !telemetryState.currentEditingDraftId) return

  safeTrack('image_editing_summary', {
    duration_sec: secondsSince(session.startedAt),
    end_reason: reason,
    source_quality: session.sourceQuality,
    initial_mask_count: session.initialMaskCount,
    final_mask_count: session.currentMaskCount,
    total_operations: session.totalOperations,
    mask_commit_operations: session.maskCommitOperations,
    mask_add_operations: session.maskAddOperations,
    mask_remove_operations: session.maskRemoveOperations,
    mask_adjust_operations: session.maskAdjustOperations,
    crop_commit_operations: session.cropCommitOperations,
    focus_open_count: session.focusOpenCount,
    focus_close_count: session.focusCloseCount,
    device_kind: telemetryState.context.deviceKind,
  })

  telemetryState.currentEditingDraftId = null
  telemetryState.currentEditingSession = null
}

export function recordImageOperation(payload: {
  draftId: string
  type: ImageOperationType
  previousMaskCount: number
  nextMaskCount: number
  sourceQuality: ImageSourceQuality
}) {
  if (!telemetryState.firstEditAt) {
    telemetryState.firstEditAt = Date.now()
  }

  if (telemetryState.currentEditingDraftId !== payload.draftId || !telemetryState.currentEditingSession) {
    beginImageEditingSession({
      draftId: payload.draftId,
      maskCount: payload.previousMaskCount,
      sourceQuality: payload.sourceQuality,
    })
  }

  const session = telemetryState.currentEditingSession
  if (!session) return

  telemetryState.totalOperations += 1
  session.totalOperations += 1
  session.currentMaskCount = payload.nextMaskCount
  session.sourceQuality = payload.sourceQuality

  if (payload.type === 'masks-commit') {
    const delta = payload.nextMaskCount - payload.previousMaskCount
    telemetryState.masksCommitOperations += 1
    session.maskCommitOperations += 1
    if (delta > 0) session.maskAddOperations += 1
    else if (delta < 0) session.maskRemoveOperations += 1
    else session.maskAdjustOperations += 1
    return
  }

  telemetryState.cropCommitOperations += 1
  session.cropCommitOperations += 1
}

export function recordFocusEditorState(open: boolean) {
  const session = telemetryState.currentEditingSession
  if (!session) return

  if (open) {
    telemetryState.focusOpenCount += 1
    session.focusOpenCount += 1
  } else {
    telemetryState.focusCloseCount += 1
    session.focusCloseCount += 1
  }
}

export function recordAsyncAction(payload: {
  actionKey: string
  durationMs: number
  success: boolean
}) {
  telemetryState.asyncActionCount += 1
  safeTrack('workspace_async_action', {
    action_key: payload.actionKey,
    duration_ms: roundDurationMs(payload.durationMs),
    success: payload.success,
    device_kind: telemetryState.context.deviceKind,
  })
}

export function recordImageEditSave(payload: {
  action: 'masks' | 'crop'
  elapsedMs: number
  compressionCount: number
  projectImageCount: number
  strikeCount: number
  signaledSlowSave: boolean
  showedPrompt: boolean
}) {
  if (payload.signaledSlowSave) {
    telemetryState.slowSaveSignalCount += 1
  }
  if (payload.showedPrompt) {
    telemetryState.slowSavePromptCount += 1
  }

  if (!payload.signaledSlowSave && !payload.showedPrompt) return

  safeTrack(payload.showedPrompt ? 'slow_save_prompt_shown' : 'slow_save_signal', {
    action: payload.action,
    elapsed_ms: roundDurationMs(payload.elapsedMs),
    compression_count: payload.compressionCount,
    project_image_count: payload.projectImageCount,
    strike_count: payload.strikeCount,
    device_kind: telemetryState.context.deviceKind,
  })
}

export function recordExportFlowOpened(payload: {
  queueCount: number
  readyCount: number
  generationMode: string
}) {
  telemetryState.exportOpenedAt = Date.now()
  telemetryState.exportOpenCount += 1
  finalizeCurrentImageSession('export-open')
  safeTrack('export_flow_opened', {
    queue_count: payload.queueCount,
    ready_count: payload.readyCount,
    generation_mode: payload.generationMode,
    seconds_since_import: secondsSince(telemetryState.importedAt),
    seconds_since_first_edit: secondsSince(telemetryState.firstEditAt),
    device_kind: telemetryState.context.deviceKind,
  })
}

export function recordExportCardConfirmed(payload: {
  hasTags: boolean
}) {
  safeTrack('export_card_confirmed', {
    has_tags: payload.hasTags,
    device_kind: telemetryState.context.deviceKind,
  })
}

export function recordExportCompleted(payload: {
  destination: 'anki' | 'apkg' | 'image-group'
  targetCount: number
  successCount: number
  failedCount: number
  durationMs: number
  generationMode: string
}) {
  telemetryState.exportCompletedAt = Date.now()
  telemetryState.exportCompleteCount += 1
  safeTrack('export_completed', {
    destination: payload.destination,
    target_count: payload.targetCount,
    success_count: payload.successCount,
    failed_count: payload.failedCount,
    duration_ms: roundDurationMs(payload.durationMs),
    generation_mode: payload.generationMode,
    seconds_since_import: secondsSince(telemetryState.importedAt),
    seconds_since_first_edit: secondsSince(telemetryState.firstEditAt),
    device_kind: telemetryState.context.deviceKind,
  })
}

export function flushWorkspaceSummary(reason: FlushReason | 'manual') {
  const now = Date.now()
  if (telemetryState.lastWorkspaceSummaryAt && now - telemetryState.lastWorkspaceSummaryAt < 5_000) {
    return
  }
  telemetryState.lastWorkspaceSummaryAt = now

  safeTrack('workspace_session_summary', {
    flush_reason: reason,
    dwell_sec: secondsSince(telemetryState.sessionStartedAt),
    seconds_to_first_import: telemetryState.importedAt ? Math.max(0, Math.round((telemetryState.importedAt - telemetryState.sessionStartedAt) / 1000)) : null,
    seconds_import_to_first_edit:
      telemetryState.importedAt && telemetryState.firstEditAt
        ? Math.max(0, Math.round((telemetryState.firstEditAt - telemetryState.importedAt) / 1000))
        : null,
    seconds_import_to_export_open:
      telemetryState.importedAt && telemetryState.exportOpenedAt
        ? Math.max(0, Math.round((telemetryState.exportOpenedAt - telemetryState.importedAt) / 1000))
        : null,
    seconds_import_to_export_complete:
      telemetryState.importedAt && telemetryState.exportCompletedAt
        ? Math.max(0, Math.round((telemetryState.exportCompletedAt - telemetryState.importedAt) / 1000))
        : null,
    imported_image_count: telemetryState.importedImageCount,
    total_operations: telemetryState.totalOperations,
    masks_commit_operations: telemetryState.masksCommitOperations,
    crop_commit_operations: telemetryState.cropCommitOperations,
    focus_open_count: telemetryState.focusOpenCount,
    focus_close_count: telemetryState.focusCloseCount,
    export_open_count: telemetryState.exportOpenCount,
    export_complete_count: telemetryState.exportCompleteCount,
    async_action_count: telemetryState.asyncActionCount,
    slow_save_signal_count: telemetryState.slowSaveSignalCount,
    slow_save_prompt_count: telemetryState.slowSavePromptCount,
    total_click_count: telemetryState.totalClickCount,
    tracked_control_count: telemetryState.uniqueControlKeys.size,
    device_kind: telemetryState.context.deviceKind,
    can_direct_anki: telemetryState.context.canDirectAnki,
  })
}

export function detectTelemetrySection(target: EventTarget | null): string {
  if (!(target instanceof HTMLElement)) return 'unknown'
  return detectSection(target)
}

export function isDialogSection(section: string): boolean {
  return DIALOG_SECTIONS.has(section)
}
