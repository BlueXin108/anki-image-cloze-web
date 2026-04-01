export type AnalysisMode = 'ocr_only' | 'hybrid'
export type DraftStatus = 'route_review' | 'route_ready' | 'llm_review' | 'approved' | 'blocked' | 'imported'
export type BBox = [number, number, number, number]
export type PromptPreset = 'anki_focus' | 'concept_map' | 'formula_focus' | 'custom'
export type RoutingMode = 'folder_name' | 'semantic'
export type MaskDensity = 'few' | 'medium' | 'many' | 'complete'
export type WorkspaceMode = 'pipeline' | 'manual'

export interface RuleRecord {
  id: string
  folder_pattern: string
  deck_name: string
  tags: string[]
  enabled: boolean
}

export interface RoutingSettings {
  mode: RoutingMode
  semantic_max_depth: number
  semantic_batch_size: number
  semantic_request_token_limit: number
}

export interface LLMSettings {
  enabled: boolean
  base_url: string
  api_key_present: boolean
  model: string
  timeout_ms: number
  analysis_mode_default: AnalysisMode
  batch_size_default: number
  send_image_default: boolean
  send_ocr_default: boolean
  temperature: number
  max_output_tokens: number
  request_token_limit: number
  prompt_preset: PromptPreset
  custom_prompt: string
  mask_density: MaskDensity
}

export interface ImageProcessingSettings {
  llm_image_compress_enabled: boolean
  llm_image_format: 'webp'
  llm_image_quality: number
}

export interface ImageCompressionPreview {
  image_id: string
  media_type: string
  byte_size: number
  original_byte_size: number
  width: number
  height: number
  format: string
  quality: number
  using_compressed_image: boolean
  preview_data_url: string
}

export interface LLMModelRecord {
  id: string
  owned_by?: string | null
  label: string
}

export interface LLMModelListResponse {
  items: LLMModelRecord[]
}

export interface PromptPresetRecord {
  id: PromptPreset
  label: string
  prompt_preview: string
}

export interface PromptPresetListResponse {
  items: PromptPresetRecord[]
}

export interface ModelConnectionTestResponse {
  ok: boolean
  model_count: number
  model_found: boolean
  message: string
}

export interface DirectoryEntry {
  name: string
  path: string
  kind: 'directory' | 'file'
}

export interface DirectoryListResponse {
  current_path: string
  parent_path?: string | null
  items: DirectoryEntry[]
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

export interface CropSuggestion {
  bbox: BBox
  padding: number
  confidence: number
  source: string
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
}

export interface CardDraft {
  id: string
  image_id: string
  deck?: string | null
  tags: string[]
  review_status: DraftStatus
  route_reason?: string | null
  route_source?: string | null
  route_request_log?: string | null
  route_response_log?: string | null
  front_image_path?: string | null
  back_image_path?: string | null
  front_image_url?: string | null
  back_image_url?: string | null
  crop?: CropSuggestion | null
  masks: MaskRect[]
  ocr_regions: DetectedRegion[]
  ocr_text?: string | null
  ocr_request_log?: string | null
  ocr_response_log?: string | null
  llm_summary?: string | null
  llm_observed_text?: string | null
  llm_cloze_targets: string[]
  llm_warnings: string[]
  llm_request_log?: string | null
  llm_response_log?: string | null
  render_fingerprint?: string | null
  last_error?: string | null
  source_image_url?: string | null
  imported_note_id?: number | null
  updated_at: string
}

export interface DraftListItem {
  image: ImageItem
  draft: CardDraft
}

export interface DraftListResponse {
  items: DraftListItem[]
}

export interface ScanFolderResponse extends DraftListResponse {
  scanned_count: number
  matched_count: number
  blocked_count: number
}

export interface ImportResult {
  draft_id: string
  ok: boolean
  note_id?: number | null
  error?: string | null
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

export interface AnkiTemplateStatus {
  base_template_name: string
  active_template_name: string
  exact_exists: boolean
  using_copy: boolean
}

export interface DeckListResponse {
  items: string[]
}
