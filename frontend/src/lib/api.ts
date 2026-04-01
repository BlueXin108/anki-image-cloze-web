import type {
  AnalysisMode,
  AnkiTemplateStatus,
  CardDraft,
  DeckListResponse,
  DirectoryListResponse,
  DraftListResponse,
  DraftStatus,
  ImageCompressionPreview,
  ImageProcessingSettings,
  ImportResult,
  ManualImportResponse,
  ModelConnectionTestResponse,
  LLMModelListResponse,
  LLMSettings,
  MaskRect,
  MaskDensity,
  PromptPresetListResponse,
  PromptPreset,
  RoutingSettings,
  RuleRecord,
  ScanFolderResponse,
} from '@/types'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

function extractErrorMessage(raw: string): string {
  if (!raw) return 'Request failed.'

  try {
    const parsed = JSON.parse(raw) as { detail?: string }
    if (typeof parsed.detail === 'string' && parsed.detail.trim()) {
      return parsed.detail
    }
  } catch {
    // Fall back to the raw response body when it is not JSON.
  }

  return raw
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      ...init,
    })
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : 'Unknown network error.'
    throw new Error(`无法连接到后端服务。请确认后端已启动，并检查 ${API_BASE} 是否可访问。原始信息：${message}`)
  }

  if (!response.ok) {
    const payload = await response.text()
    throw new Error(extractErrorMessage(payload) || `HTTP ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export const api = {
  baseUrl: API_BASE,
  health: () => request<{ status: string }>('/health'),
  getDrafts: () => request<DraftListResponse>('/drafts'),
  resetWorkspace: () =>
    request<{ ok: boolean }>('/workspace/reset', {
      method: 'POST',
    }),
  scanFolder: (rootPath: string) =>
    request<ScanFolderResponse>('/scan-folder', {
      method: 'POST',
      body: JSON.stringify({ root_path: rootPath }),
    }),
  pickFolder: (initialPath?: string) =>
    request<{ path: string | null }>('/system/pick-folder', {
      method: 'POST',
      body: JSON.stringify({ initial_path: initialPath || null }),
    }),
  listDirectory: (path?: string, includeFiles = false) =>
    request<DirectoryListResponse>('/system/list-directory', {
      method: 'POST',
      body: JSON.stringify({ path: path || null, include_files: includeFiles }),
    }),
  revealPath: (path: string) =>
    request<{ ok: boolean }>('/system/reveal-path', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  runOcr: (imageIds: string[]) =>
    request<DraftListResponse>('/ocr/run', {
      method: 'POST',
      body: JSON.stringify({ image_ids: imageIds }),
    }),
  patchIgnoredImages: (imageIds: string[], ignored: boolean) =>
    request<DraftListResponse>('/images/ignore', {
      method: 'PATCH',
      body: JSON.stringify({ image_ids: imageIds, ignored }),
    }),
  runRuleSuggestions: (imageIds: string[]) =>
    request<DraftListResponse>('/suggest/rules', {
      method: 'POST',
      body: JSON.stringify({ image_ids: imageIds }),
    }),
  runLlmSuggestions: (payload: {
    draftIds: string[]
    analysisMode: AnalysisMode
    batchSize: number
    includeImage: boolean
    includeOcr: boolean
    promptPreset?: PromptPreset
    customPrompt?: string
    maskDensity?: MaskDensity
  }) =>
    request<DraftListResponse>('/suggest/llm', {
      method: 'POST',
      body: JSON.stringify({
        draft_ids: payload.draftIds,
        analysis_mode: payload.analysisMode,
        batch_size: payload.batchSize,
        include_image: payload.includeImage,
        include_ocr: payload.includeOcr,
        prompt_preset: payload.promptPreset ?? null,
        custom_prompt: payload.customPrompt ?? null,
        mask_density: payload.maskDensity ?? null,
      }),
    }),
  runRouteSuggestions: (payload: {
    draftIds: string[]
    analysisMode: AnalysisMode
    includeImage: boolean
    includeOcr: boolean
  }) =>
    request<DraftListResponse>('/suggest/routes', {
      method: 'POST',
      body: JSON.stringify({
        draft_ids: payload.draftIds,
        analysis_mode: payload.analysisMode,
        include_image: payload.includeImage,
        include_ocr: payload.includeOcr,
      }),
    }),
  patchDraft: (payload: { draftId: string; reviewStatus?: DraftStatus; deck?: string | null; tags?: string[]; routeReason?: string | null }) =>
    request<CardDraft>(`/drafts/${payload.draftId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        review_status: payload.reviewStatus ?? null,
        deck: payload.deck ?? null,
        tags: payload.tags ?? null,
        route_reason: payload.routeReason ?? null,
      }),
    }),
  patchCrop: (draftId: string, bbox: [number, number, number, number]) =>
    request<CardDraft>(`/drafts/${draftId}/crop`, {
      method: 'PATCH',
      body: JSON.stringify({
        bbox,
        padding: 24,
        confidence: 1,
        source: 'manual',
      }),
    }),
  patchMasks: (draftId: string, masks: MaskRect[]) =>
    request<CardDraft>(`/drafts/${draftId}/masks`, {
      method: 'PATCH',
      body: JSON.stringify({ masks }),
    }),
  resetDraftAnalysis: (draftId: string) =>
    request<CardDraft>(`/drafts/${draftId}/reset-analysis`, {
      method: 'POST',
    }),
  renderDraft: (draftId: string) =>
    request<{ draft: CardDraft }>(`/drafts/${draftId}/render`, {
      method: 'POST',
    }),
  importApproved: (draftIds?: string[]) =>
    request<{ results: ImportResult[] }>('/drafts/import-approved', {
      method: 'POST',
      body: JSON.stringify({ draft_ids: draftIds ?? null }),
    }),
  importManual: (payload?: { draftIds?: string[]; webpQuality?: number }) =>
    request<ManualImportResponse>('/drafts/import-manual', {
      method: 'POST',
      body: JSON.stringify({
        draft_ids: payload?.draftIds ?? null,
        webp_quality: payload?.webpQuality ?? 80,
      }),
    }),
  getManualTemplateStatus: () =>
    request<AnkiTemplateStatus>('/anki/manual-template'),
  getDecks: () =>
    request<DeckListResponse>('/anki/decks'),
  getRules: () => request<{ rules: RuleRecord[] }>('/rules'),
  patchRules: (rules: RuleRecord[]) =>
    request<{ rules: RuleRecord[] }>('/rules', {
      method: 'PATCH',
      body: JSON.stringify({ rules }),
    }),
  getLlmSettings: () => request<LLMSettings>('/settings/llm'),
  getImageProcessingSettings: () => request<ImageProcessingSettings>('/settings/image-processing'),
  getImageCompressionPreview: (payload: {
    imageId: string
    llmImageCompressEnabled?: boolean
    llmImageFormat?: 'webp'
    llmImageQuality?: number
  }) =>
    request<ImageCompressionPreview>('/settings/image-processing/preview', {
      method: 'POST',
      body: JSON.stringify({
        image_id: payload.imageId,
        llm_image_compress_enabled: payload.llmImageCompressEnabled ?? null,
        llm_image_format: payload.llmImageFormat ?? null,
        llm_image_quality: payload.llmImageQuality ?? null,
      }),
    }),
  getRoutingSettings: () => request<RoutingSettings>('/settings/routing'),
  getLlmModels: (payload?: { baseUrl?: string; apiKey?: string }) =>
    request<LLMModelListResponse>('/settings/llm/models', {
      method: 'POST',
      body: JSON.stringify({
        base_url: payload?.baseUrl || null,
        api_key: payload?.apiKey || null,
      }),
    }),
  testLlmConnection: (payload?: { baseUrl?: string; apiKey?: string; model?: string }) =>
    request<ModelConnectionTestResponse>('/settings/llm/test', {
      method: 'POST',
      body: JSON.stringify({
        base_url: payload?.baseUrl || null,
        api_key: payload?.apiKey || null,
        model: payload?.model || null,
      }),
    }),
  getPromptPresets: () => request<PromptPresetListResponse>('/settings/llm/prompt-presets'),
  patchLlmSettings: (payload: Partial<LLMSettings> & { api_key?: string }) =>
    request<LLMSettings>('/settings/llm', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  patchImageProcessingSettings: (payload: Partial<ImageProcessingSettings>) =>
    request<ImageProcessingSettings>('/settings/image-processing', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  patchRoutingSettings: (payload: Partial<RoutingSettings>) =>
    request<RoutingSettings>('/settings/routing', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
}
