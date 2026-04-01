export type BBox = [number, number, number, number]
export type WorkspaceMode = 'pipeline' | 'manual'
export type DraftReviewStatus = 'draft' | 'imported'

export interface CropSuggestion {
  bbox: BBox
  padding: number
  confidence: number
  source: string
}

export interface MaskRect {
  id: string
  bbox: BBox
  label: string
  reason?: string | null
  confidence: number
  source: string
  manual: boolean
  card_group_id?: string | null
  card_order?: number | null
}

export interface DetectedRegion {
  id: string
  bbox: BBox
  text: string
  confidence: number
  region_type: string
}

export interface ImageItem {
  id: string
  source_path: string
  folder_path: string
  file_hash: string
  width: number
  height: number
  status: string
  ignored: boolean
  deck?: string | null
  tags: string[]
  source_url?: string | null
  media_type: string
}

export interface CardDraft {
  id: string
  image_id: string
  deck?: string | null
  tags: string[]
  review_status: DraftReviewStatus
  route_reason?: string | null
  crop?: CropSuggestion | null
  masks: MaskRect[]
  ocr_regions: DetectedRegion[]
  ocr_text?: string | null
  llm_summary?: string | null
  llm_observed_text?: string | null
  llm_cloze_targets: string[]
  llm_warnings: string[]
  render_fingerprint?: string | null
  source_image_url?: string | null
  imported_note_id?: number | null
  updated_at: string
  last_imported_at?: string | null
}

export interface DraftListItem {
  image: ImageItem
  draft: CardDraft
  image_blob?: Blob
}

export interface PersistedDraftListItem {
  image: Omit<ImageItem, 'source_url'>
  draft: Omit<CardDraft, 'source_image_url'>
  image_blob: Blob
}

export interface PersistedProjectRecord {
  version: 1
  saved_at: string
  workspace_mode: WorkspaceMode
  selected_draft_id: string | null
  items: PersistedDraftListItem[]
}

export interface ManualPreviewSet {
  frontUrl: string | null
  backUrl: string | null
}

export interface ImportQueueItemView {
  draftId: string
  label: string
  status: 'pending' | 'running' | 'success' | 'failed'
  message: string
}

export interface AnkiTemplateStatus {
  base_template_name: string
  active_template_name: string
  exact_exists: boolean
  using_copy: boolean
}

export interface DeckListResponse {
  items: string[]
}

export interface ManualImportResult {
  draft_id: string
  ok: boolean
  note_ids: number[]
  created_count: number
  template_name?: string | null
  error?: string | null
}

export interface ManualImportResponse {
  results: ManualImportResult[]
}

export interface AnkiConnectionCheck {
  ok: boolean
  message: string
}

export type AnkiStateLevel = 'idle' | 'loading' | 'success' | 'warning' | 'error'

export interface AnkiConnectionState {
  checked: boolean
  ok: boolean
  title: string
  message: string
  decks: string[]
  level: AnkiStateLevel
  lastCheckedAt?: string | null
  templateStatus?: AnkiTemplateStatus | null
}
