from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

BBox = list[int]
DraftStatus = Literal["route_review", "route_ready", "llm_review", "approved", "blocked", "imported"]
ImageStatus = Literal["scanned", "ocr_ready", "needs_rule", "blocked", "imported"]
AnalysisMode = Literal["ocr_only", "hybrid"]
PromptPreset = Literal["anki_focus", "concept_map", "formula_focus", "custom"]
ImageUploadFormat = Literal["webp"]
RoutingMode = Literal["folder_name", "semantic"]
MaskDensity = Literal["few", "medium", "many", "complete"]


class RulePayload(BaseModel):
    id: str | None = None
    folder_pattern: str
    deck_name: str
    tags: list[str] = Field(default_factory=list)
    enabled: bool = True


class RuleSetPayload(BaseModel):
    rules: list[RulePayload]


class RuleRecord(RulePayload):
    id: str


class RoutingSettingsPayload(BaseModel):
    mode: RoutingMode | None = None
    semantic_max_depth: int | None = None
    semantic_batch_size: int | None = None
    semantic_request_token_limit: int | None = None


class RoutingSettingsRecord(BaseModel):
    mode: RoutingMode
    semantic_max_depth: int
    semantic_batch_size: int
    semantic_request_token_limit: int


class LLMSettingsPayload(BaseModel):
    enabled: bool | None = None
    base_url: str | None = None
    api_key: str | None = None
    model: str | None = None
    timeout_ms: int | None = None
    analysis_mode_default: AnalysisMode | None = None
    batch_size_default: int | None = None
    send_image_default: bool | None = None
    send_ocr_default: bool | None = None
    temperature: float | None = None
    max_output_tokens: int | None = None
    request_token_limit: int | None = None
    prompt_preset: PromptPreset | None = None
    custom_prompt: str | None = None
    mask_density: MaskDensity | None = None


class LLMSettingsRecord(BaseModel):
    enabled: bool
    base_url: str
    api_key_present: bool
    model: str
    timeout_ms: int
    analysis_mode_default: AnalysisMode
    batch_size_default: int
    send_image_default: bool
    send_ocr_default: bool
    temperature: float
    max_output_tokens: int
    request_token_limit: int
    prompt_preset: PromptPreset
    custom_prompt: str
    mask_density: MaskDensity


class ImageProcessingSettingsPayload(BaseModel):
    llm_image_compress_enabled: bool | None = None
    llm_image_format: ImageUploadFormat | None = None
    llm_image_quality: int | None = None


class ImageProcessingSettingsRecord(BaseModel):
    llm_image_compress_enabled: bool
    llm_image_format: ImageUploadFormat
    llm_image_quality: int


class ImageCompressionPreviewRequest(BaseModel):
    image_id: str
    llm_image_compress_enabled: bool | None = None
    llm_image_format: ImageUploadFormat | None = None
    llm_image_quality: int | None = None


class ImageCompressionPreviewResponse(BaseModel):
    image_id: str
    media_type: str
    byte_size: int
    original_byte_size: int
    width: int
    height: int
    format: str
    quality: int
    using_compressed_image: bool
    preview_data_url: str


class LLMModelRecord(BaseModel):
    id: str
    owned_by: str | None = None
    label: str


class LLMModelListResponse(BaseModel):
    items: list[LLMModelRecord]


class PromptPresetRecord(BaseModel):
    id: PromptPreset
    label: str
    prompt_preview: str


class PromptPresetListResponse(BaseModel):
    items: list[PromptPresetRecord]


class ModelDiscoveryPayload(BaseModel):
    base_url: str | None = None
    api_key: str | None = None
    model: str | None = None


class ModelConnectionTestResponse(BaseModel):
    ok: bool
    model_count: int
    model_found: bool
    message: str


class DirectoryEntry(BaseModel):
    name: str
    path: str
    kind: Literal["directory", "file"]


class DirectoryListRequest(BaseModel):
    path: str | None = None
    include_files: bool = False


class DirectoryListResponse(BaseModel):
    current_path: str
    parent_path: str | None = None
    items: list[DirectoryEntry]


class MaskRect(BaseModel):
    id: str
    bbox: BBox
    label: str = ""
    reason: str | None = None
    confidence: float = 0.0
    source: str = "manual"
    manual: bool = False
    card_group_id: str | None = None
    card_order: int | None = None

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, value: BBox) -> BBox:
        if len(value) != 4:
            raise ValueError("bbox must contain four integers")
        x1, y1, x2, y2 = value
        if x2 <= x1 or y2 <= y1:
            raise ValueError("bbox must define a positive rectangle")
        return value


class DetectedRegion(BaseModel):
    id: str
    bbox: BBox
    text: str = ""
    confidence: float = 0.0
    region_type: str = "text"


class CropSuggestion(BaseModel):
    bbox: BBox
    padding: int = 24
    confidence: float = 0.0
    source: str = "ocr"


class ImageItem(BaseModel):
    id: str
    source_path: str
    folder_path: str
    file_hash: str
    width: int
    height: int
    status: ImageStatus
    ignored: bool = False
    deck: str | None = None
    tags: list[str] = Field(default_factory=list)
    source_url: str | None = None


class CardDraft(BaseModel):
    id: str
    image_id: str
    deck: str | None = None
    tags: list[str] = Field(default_factory=list)
    review_status: DraftStatus = "route_review"
    route_reason: str | None = None
    route_source: str | None = None
    route_request_log: str | None = None
    route_response_log: str | None = None
    front_image_path: str | None = None
    back_image_path: str | None = None
    front_image_url: str | None = None
    back_image_url: str | None = None
    crop: CropSuggestion | None = None
    masks: list[MaskRect] = Field(default_factory=list)
    ocr_regions: list[DetectedRegion] = Field(default_factory=list)
    ocr_text: str | None = None
    ocr_request_log: str | None = None
    ocr_response_log: str | None = None
    llm_summary: str | None = None
    llm_observed_text: str | None = None
    llm_cloze_targets: list[str] = Field(default_factory=list)
    llm_warnings: list[str] = Field(default_factory=list)
    llm_request_log: str | None = None
    llm_response_log: str | None = None
    render_fingerprint: str | None = None
    last_error: str | None = None
    source_image_url: str | None = None
    imported_note_id: int | None = None
    updated_at: datetime


class DraftListItem(BaseModel):
    image: ImageItem
    draft: CardDraft


class DraftListResponse(BaseModel):
    items: list[DraftListItem]


class ScanFolderRequest(BaseModel):
    root_path: str


class ScanFolderResponse(BaseModel):
    scanned_count: int
    matched_count: int
    blocked_count: int
    items: list[DraftListItem]


class PickFolderRequest(BaseModel):
    initial_path: str | None = None


class PickFolderResponse(BaseModel):
    path: str | None = None


class RevealPathPayload(BaseModel):
    path: str


class ImageBatchRequest(BaseModel):
    image_ids: list[str]


class ImageIgnoreBatchPayload(BaseModel):
    image_ids: list[str]
    ignored: bool


class DraftBatchRequest(BaseModel):
    draft_ids: list[str]
    analysis_mode: AnalysisMode = "hybrid"
    batch_size: int = 3
    include_image: bool = True
    include_ocr: bool = True
    prompt_preset: PromptPreset | None = None
    custom_prompt: str | None = None
    mask_density: MaskDensity | None = None


class RouteBatchRequest(BaseModel):
    draft_ids: list[str]
    analysis_mode: AnalysisMode = "hybrid"
    include_image: bool = True
    include_ocr: bool = True


class DraftPatchPayload(BaseModel):
    review_status: DraftStatus | None = None
    deck: str | None = None
    tags: list[str] | None = None
    route_reason: str | None = None


class CropUpdatePayload(BaseModel):
    bbox: BBox
    padding: int = 24
    confidence: float = 1.0
    source: str = "manual"


class MaskUpdatePayload(BaseModel):
    masks: list[MaskRect]


class RenderResponse(BaseModel):
    draft: CardDraft


class ImportApprovedRequest(BaseModel):
    draft_ids: list[str] | None = None


class ImportResult(BaseModel):
    draft_id: str
    ok: bool
    note_id: int | None = None
    error: str | None = None


class ImportApprovedResponse(BaseModel):
    results: list[ImportResult]


class ManualImportRequest(BaseModel):
    draft_ids: list[str] | None = None
    webp_quality: int = 80


class ManualImportResult(BaseModel):
    draft_id: str
    ok: bool
    note_ids: list[int] = Field(default_factory=list)
    created_count: int = 0
    template_name: str | None = None
    error: str | None = None


class ManualImportResponse(BaseModel):
    results: list[ManualImportResult]


class AnkiTemplateStatusResponse(BaseModel):
    base_template_name: str
    active_template_name: str
    exact_exists: bool
    using_copy: bool


class DeckListResponse(BaseModel):
    items: list[str]


class LLMItemSuggestion(BaseModel):
    image_id: str
    summary: str | None = None
    observed_text: str | None = None
    cloze_targets: list[str] = Field(default_factory=list)
    crop: dict[str, Any] | None = None
    masks: list[dict[str, Any]] = Field(default_factory=list)
    hints: Any = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class LLMBatchSuggestion(BaseModel):
    version: str
    items: list[LLMItemSuggestion]


class RouteItemSuggestion(BaseModel):
    image_id: str
    deck_name: str
    tags: list[str] = Field(default_factory=list)
    used_existing: bool = False
    reason: str | None = None


class RouteBatchSuggestion(BaseModel):
    version: str
    items: list[RouteItemSuggestion]

