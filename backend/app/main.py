from __future__ import annotations

from pathlib import Path
from typing import Any
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image

from .models import (
    AnkiTemplateStatusResponse,
    CardDraft,
    CropSuggestion,
    CropUpdatePayload,
    DirectoryEntry,
    DirectoryListRequest,
    DirectoryListResponse,
    DeckListResponse,
    DraftBatchRequest,
    DraftListResponse,
    DraftPatchPayload,
    ImageCompressionPreviewRequest,
    ImageCompressionPreviewResponse,
    ImportApprovedRequest,
    ImportApprovedResponse,
    ImportResult,
    ManualImportRequest,
    ManualImportResponse,
    ImageProcessingSettingsPayload,
    ImageProcessingSettingsRecord,
    ImageBatchRequest,
    ImageIgnoreBatchPayload,
    LLMModelListResponse,
    ModelConnectionTestResponse,
    LLMSettingsPayload,
    LLMSettingsRecord,
    MaskRect,
    MaskUpdatePayload,
    ModelDiscoveryPayload,
    PromptPresetListResponse,
    PickFolderRequest,
    PickFolderResponse,
    RevealPathPayload,
    RenderResponse,
    RouteBatchRequest,
    RoutingSettingsPayload,
    RoutingSettingsRecord,
    RuleSetPayload,
    ScanFolderRequest,
    ScanFolderResponse,
)
from .services import (
    build_import_error,
    classify_folder,
    current_items,
    detect_regions,
    encode_image_base64,
    fetch_available_models,
    file_hash,
    folder_path_to_deck,
    get_ocr_engine,
    get_prompt_presets,
    ensure_manual_anki_template,
    import_to_anki,
    import_manual_masks_to_anki,
    list_anki_decks,
    merge_generated_masks,
    list_directory,
    LLMRequestError,
    pick_folder,
    reveal_path,
    render_draft_assets,
    request_llm_routing,
    request_llm_suggestions,
    suggest_masks_from_regions,
    test_model_connection,
    build_candidate_decks,
    estimate_llm_request_tokens,
    estimate_route_request_tokens,
    estimate_text_span_bbox,
)
from .storage import (
    RENDER_DIR,
    connect,
    ensure_storage,
    get_draft_row,
    get_image_processing_settings,
    get_image_row,
    get_llm_settings,
    get_routing_settings,
    init_db,
    json_dump,
    json_load,
    list_rules,
    replace_rules,
    clear_workspace_state,
    update_routing_settings,
    update_images_ignored,
    update_draft_fields,
    update_image_processing_settings,
    update_llm_settings,
    upsert_image,
    ensure_draft,
)

ensure_storage()

app = FastAPI(title="Anki Image Cloze Prototype")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/renders", StaticFiles(directory=RENDER_DIR), name="renders")


def manual_crop_from_json(crop_json: str | None) -> CropSuggestion | None:
    if not crop_json:
        return None
    crop = CropSuggestion.model_validate(json_load(crop_json, {}))
    return crop if crop.source == "manual" else None


def infer_scan_root_name(source_path: str, folder_path: str) -> str:
    path = Path(source_path)
    relative_parts = [segment for segment in folder_path.replace("\\", "/").split("/") if segment]
    root = path.parent
    for _ in relative_parts:
        root = root.parent
    return root.name or "Scanned"


@app.on_event("startup")
async def on_startup() -> None:
    init_db()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/drafts", response_model=DraftListResponse)
async def list_drafts() -> DraftListResponse:
    return DraftListResponse(items=current_items())


@app.post("/workspace/reset")
async def reset_workspace() -> dict[str, bool]:
    clear_workspace_state()
    return {"ok": True}


@app.get("/drafts/{draft_id}", response_model=CardDraft)
async def get_draft(draft_id: str) -> CardDraft:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT
              i.id AS image_id,
              i.source_path,
              i.folder_path,
              i.file_hash,
              i.width,
              i.height,
              i.status AS image_status,
              i.ignored AS image_ignored,
              i.deck AS image_deck,
              i.tags_json AS image_tags_json,
              d.id AS draft_id,
              d.deck AS draft_deck,
              d.tags_json AS draft_tags_json,
              d.review_status,
              d.route_reason,
              d.route_source,
              d.route_request_log,
              d.route_response_log,
              d.crop_json,
              d.masks_json,
              d.ocr_regions_json,
              d.front_image_path,
              d.back_image_path,
              d.ocr_text,
              d.ocr_request_log,
              d.ocr_response_log,
              d.llm_summary,
              d.llm_observed_text,
              d.llm_cloze_targets_json,
              d.llm_warnings_json,
              d.llm_request_log,
              d.llm_response_log,
              d.render_fingerprint,
              d.last_error,
              d.imported_note_id,
              d.updated_at
            FROM drafts d
            JOIN images i ON i.id = d.image_id
            WHERE d.id = ?
            """,
            (draft_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Draft not found.")
    from .storage import build_draft_item

    return build_draft_item(row).draft


@app.get("/images/{image_id}/file")
async def get_source_image(image_id: str) -> FileResponse:
    row = get_image_row(image_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    path = Path(row["source_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Source image is missing.")
    return FileResponse(path)


@app.post("/scan-folder", response_model=ScanFolderResponse)
async def scan_folder(payload: ScanFolderRequest) -> ScanFolderResponse:
    root = Path(payload.root_path).expanduser()
    if not root.exists() or not root.is_dir():
        raise HTTPException(status_code=400, detail="Root path must be an existing directory.")

    patterns = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
    routing_settings = get_routing_settings()
    scanned = matched = blocked = 0

    files: list[tuple[Path, str]] = []
    for file_path in sorted(root.rglob("*")):
        if file_path.is_file() and file_path.suffix.lower() in patterns:
            relative_folder = file_path.parent.relative_to(root).as_posix() if file_path.parent != root else ""
            files.append((file_path, relative_folder))

    root_name = root.name or "Scanned"

    for file_path, relative_folder in files:
        with Image.open(file_path) as image:
            width, height = image.size
        if routing_settings.mode == "semantic":
            deck = None
            tags: list[str] = []
            route_data = {
                "deck": None,
                "tags": [],
                "reason": f"等待 OCR 完成后，让模型结合图片语义、OCR 内容和本地已有 deck 决定归档位置。当前最多允许 {routing_settings.semantic_max_depth} 层。",
                "source": "semantic_pending",
                "request_log": None,
                "response_log": None,
            }
        else:
            deck, tags = folder_path_to_deck(relative_folder, root_name), []
            route_data = {
                "deck": deck,
                "tags": tags,
                "reason": "按同名文件夹自动匹配到同名 deck；若不存在，导入时自动创建。",
                "source": "folder_name",
                "request_log": None,
                "response_log": None,
            }
        status = "scanned" if deck else "needs_rule"
        review_status = "route_review"
        image_id = upsert_image(
            source_path=str(file_path),
            folder_path=relative_folder,
            file_hash=file_hash(file_path),
            width=width,
            height=height,
            status=status,
            deck=deck,
            tags=tags,
        )
        draft_id = ensure_draft(image_id=image_id, deck=deck, tags=tags, review_status=review_status)
        update_draft_fields(
            draft_id,
            {
                "route_reason": route_data["reason"],
                "route_source": route_data["source"],
                "route_request_log": route_data["request_log"],
                "route_response_log": route_data["response_log"],
            },
        )
        scanned += 1
        if deck:
            matched += 1
        elif routing_settings.mode != "semantic":
            blocked += 1
    return ScanFolderResponse(
        scanned_count=scanned,
        matched_count=matched,
        blocked_count=blocked,
        items=current_items(),
    )


@app.post("/system/pick-folder", response_model=PickFolderResponse)
async def system_pick_folder(payload: PickFolderRequest) -> PickFolderResponse:
    path = pick_folder(payload.initial_path)
    return PickFolderResponse(path=path)


@app.post("/system/list-directory", response_model=DirectoryListResponse)
async def system_list_directory(payload: DirectoryListRequest) -> DirectoryListResponse:
    current, items = list_directory(payload.path, include_files=payload.include_files)
    return DirectoryListResponse(
        current_path=str(current),
        parent_path=str(current.parent) if current.parent != current else None,
        items=[DirectoryEntry.model_validate(item) for item in items],
    )


@app.post("/system/reveal-path")
async def system_reveal_path(payload: RevealPathPayload) -> dict[str, bool]:
    path = Path(payload.path).expanduser()
    if not path.exists():
        raise HTTPException(status_code=404, detail="Path not found.")
    reveal_path(path)
    return {"ok": True}


@app.post("/ocr/run", response_model=DraftListResponse)
async def run_ocr(payload: ImageBatchRequest) -> DraftListResponse:
    for image_id in payload.image_ids:
        image_row = get_image_row(image_id)
        if image_row is None or bool(image_row["ignored"]):
            continue
        path = Path(image_row["source_path"])
        if not path.exists():
            continue
        ocr_engine = get_ocr_engine()
        regions, crop = detect_regions(path)
        ocr_text = "\n".join(region.text for region in regions if region.text.strip())
        if not ocr_text:
            if crop.source == "ocr_missing":
                ocr_text = "当前环境没有安装可用的 OCR 引擎，所以这次没有真正识别出正文。"
            elif crop.source == "ocr_error":
                ocr_text = "OCR 引擎运行失败，这次没有真正识别出正文。"
            else:
                ocr_text = "OCR 没有识别出可用文字内容。"
        with connect() as conn:
            draft = conn.execute(
                "SELECT id FROM drafts WHERE image_id = ?",
                (image_id,),
            ).fetchone()
            if draft is None:
                continue
        update_draft_fields(
            draft["id"],
            {
                "ocr_regions_json": json_dump([region.model_dump() for region in regions]),
                "ocr_text": ocr_text or None,
                "ocr_request_log": json_dump(
                    {
                        "engine": ocr_engine[0] if ocr_engine else None,
                        "image_path": str(path),
                    }
                ),
                "ocr_response_log": json_dump(
                    {
                        "text": ocr_text,
                        "crop": crop.model_dump(),
                        "regions": [region.model_dump() for region in regions],
                    }
                ),
                "last_error": None,
            },
        )
        with connect() as conn:
            conn.execute("UPDATE images SET status = 'ocr_ready' WHERE id = ?", (image_id,))
    return DraftListResponse(items=current_items())


@app.post("/suggest/routes", response_model=DraftListResponse)
async def suggest_routes(payload: RouteBatchRequest) -> DraftListResponse:
    settings, api_key = get_llm_settings()
    routing_settings = get_routing_settings()
    image_settings = get_image_processing_settings()

    if not payload.draft_ids:
        return DraftListResponse(items=current_items())

    placeholders = ",".join("?" for _ in payload.draft_ids)
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT
              d.id AS draft_id,
              d.image_id,
              d.deck AS draft_deck,
              d.tags_json AS draft_tags_json,
              d.route_source,
              d.ocr_regions_json,
              d.ocr_text,
              i.source_path,
              i.folder_path,
              i.ignored
            FROM drafts d
            JOIN images i ON i.id = d.image_id
            WHERE d.id IN ({placeholders})
            """,
            payload.draft_ids,
        ).fetchall()

    if routing_settings.mode != "semantic":
        return DraftListResponse(items=current_items())

    missing_reasons: list[str] = []
    if not settings.enabled:
        missing_reasons.append("LLM 已停用，所以暂时无法生成语义归档建议。")
    if not api_key:
        missing_reasons.append("LLM 没有可用的 API Key。")
    if not settings.model:
        missing_reasons.append("LLM 还没有选择模型。")

    if missing_reasons:
        for row in rows:
            fallback_root = infer_scan_root_name(row["source_path"], row["folder_path"])
            fallback_deck = folder_path_to_deck(row["folder_path"], fallback_root)
            update_draft_fields(
                row["draft_id"],
                {
                    "deck": fallback_deck,
                    "tags_json": row["draft_tags_json"] or "[]",
                    "route_reason": "；".join(missing_reasons) + " 已回退为按同名文件夹归档。",
                    "route_source": "folder_fallback",
                    "route_request_log": None,
                    "route_response_log": "；".join(missing_reasons),
                },
            )
        return DraftListResponse(items=current_items())

    candidate_map: dict[str, dict[str, str]] = {}
    for row in current_items():
        if row.image.ignored:
            continue
        if row.draft.deck:
            candidate_map[row.draft.deck] = {
                "folder_path": row.image.folder_path or ".",
                "deck_name": row.draft.deck,
            }
    candidate_decks = list(candidate_map.values())

    settings_payload: dict[str, Any] = {
        "base_url": settings.base_url,
        "api_key": api_key,
        "model": settings.model,
        "timeout_ms": settings.timeout_ms,
        "max_output_tokens": settings.max_output_tokens,
    }

    batch: list[dict[str, Any]] = []
    row_by_image_id: dict[str, Any] = {}
    for row in rows:
        if row["ignored"]:
            continue
        ocr_regions_payload = json_load(row["ocr_regions_json"], [])
        ocr_text = row["ocr_text"]
        item = {
            "image_id": row["image_id"],
            "folder_path": row["folder_path"],
            "ocr_regions": ocr_regions_payload if payload.include_ocr else [],
            "ocr_text": ocr_text if payload.include_ocr else None,
            "analysis_mode": payload.analysis_mode,
        }
        if payload.include_image:
            if image_settings.llm_image_compress_enabled:
                media_type, encoded, byte_size = encode_image_base64(
                    Path(row["source_path"]),
                    output_format=image_settings.llm_image_format,
                    quality=image_settings.llm_image_quality,
                )
                image_payload_source = "compressed_webp"
            else:
                media_type, encoded, byte_size = encode_image_base64(Path(row["source_path"]), output_format="png")
                image_payload_source = "png_passthrough"
            item["image_base64"] = encoded
            item["image_media_type"] = media_type
            item["image_byte_size"] = byte_size
            item["image_payload_source"] = image_payload_source
        batch.append(item)
        row_by_image_id[row["image_id"]] = row

    if not batch:
        return DraftListResponse(items=current_items())

    configured_batch_size = max(1, routing_settings.semantic_batch_size)
    configured_token_limit = max(2000, routing_settings.semantic_request_token_limit)
    cursor = 0

    while cursor < len(batch):
        chunk_size = min(configured_batch_size, len(batch) - cursor)
        while chunk_size > 1:
            token_estimate = estimate_route_request_tokens(
                settings=settings_payload,
                batch=batch[cursor : cursor + chunk_size],
                candidate_decks=candidate_decks,
                semantic_max_depth=routing_settings.semantic_max_depth,
            )
            if token_estimate <= configured_token_limit:
                break
            chunk_size -= 1

        chunk = batch[cursor : cursor + chunk_size]
        cursor += chunk_size

        try:
            suggestion, request_log, response_log = await request_llm_routing(
                settings=settings_payload,
                batch=chunk,
                candidate_decks=candidate_decks,
                semantic_max_depth=routing_settings.semantic_max_depth,
            )
            route_items = {item.image_id: item for item in suggestion.items}
            route_error = None
        except Exception as exc:
            request_log = exc.request_log if isinstance(exc, LLMRequestError) else None
            response_log = exc.response_log if isinstance(exc, LLMRequestError) else str(exc)
            route_items = {}
            route_error = str(exc)

        for chunk_item in chunk:
            image_id = chunk_item["image_id"]
            row = row_by_image_id[image_id]
            fallback_root = infer_scan_root_name(row["source_path"], row["folder_path"])
            fallback_deck = folder_path_to_deck(row["folder_path"], fallback_root)
            suggestion_item = route_items.get(image_id)
            if suggestion_item is not None:
                deck_name = (suggestion_item.deck_name or "").strip() or fallback_deck
                deck_parts = [segment.strip() for segment in deck_name.split("::") if segment.strip()]
                deck_name = "::".join(deck_parts[: routing_settings.semantic_max_depth]) or fallback_deck
                tags = list(dict.fromkeys(tag.strip() for tag in suggestion_item.tags if tag.strip()))
                update_draft_fields(
                    row["draft_id"],
                    {
                        "deck": deck_name,
                        "tags_json": json_dump(tags),
                        "route_reason": suggestion_item.reason or "模型已结合 OCR、图片内容和现有 deck 给出归档建议。",
                        "route_source": "semantic",
                        "route_request_log": request_log,
                        "route_response_log": response_log,
                        "last_error": None,
                    },
                )
                with connect() as conn:
                    conn.execute(
                        """
                        UPDATE images
                        SET deck = ?, tags_json = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (deck_name, json_dump(tags), row["image_id"]),
                    )
                continue

            fallback_tags = json_load(row["draft_tags_json"], [])
            update_draft_fields(
                row["draft_id"],
                {
                    "deck": fallback_deck,
                    "tags_json": json_dump(fallback_tags),
                    "route_reason": (route_error or "模型没有返回归档结果。") + " 已回退为按同名文件夹归档。",
                    "route_source": "folder_fallback",
                    "route_request_log": request_log,
                    "route_response_log": response_log,
                },
            )
            with connect() as conn:
                conn.execute(
                    """
                    UPDATE images
                    SET deck = ?, tags_json = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (fallback_deck, json_dump(fallback_tags), row["image_id"]),
                )

    return DraftListResponse(items=current_items())


@app.post("/suggest/rules", response_model=DraftListResponse)
async def suggest_rules(payload: ImageBatchRequest) -> DraftListResponse:
    if not payload.image_ids:
        return DraftListResponse(items=current_items())
    placeholders = ",".join("?" for _ in payload.image_ids)
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT d.id AS draft_id, d.masks_json, d.ocr_regions_json, i.width, i.height
            FROM drafts d
            JOIN images i ON i.id = d.image_id
            WHERE d.image_id IN ({placeholders})
            """,
            payload.image_ids,
        ).fetchall()
    for row in rows:
        from .models import DetectedRegion

        regions = [
            DetectedRegion.model_validate(item)
            for item in json_load(row["ocr_regions_json"], [])
        ]
        existing_masks = [
            MaskRect.model_validate(item) for item in json_load(row["masks_json"], [])
        ]
        generated = suggest_masks_from_regions(regions, row["width"], row["height"])
        merged = merge_generated_masks(existing_masks, generated)
        update_draft_fields(
            row["draft_id"],
            {
                "masks_json": json_dump([mask.model_dump() for mask in merged]),
                "last_error": None,
            },
        )
    return DraftListResponse(items=current_items())


@app.post("/suggest/llm", response_model=DraftListResponse)
async def suggest_llm(payload: DraftBatchRequest) -> DraftListResponse:
    settings, api_key = get_llm_settings()
    image_settings = get_image_processing_settings()
    if not payload.draft_ids:
        return DraftListResponse(items=current_items())

    placeholders = ",".join("?" for _ in payload.draft_ids)
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT
              d.id AS draft_id,
              d.image_id,
              d.masks_json,
              d.ocr_regions_json,
              d.crop_json,
              i.source_path,
              i.width,
              i.height,
              i.folder_path,
              i.ignored
            FROM drafts d
            JOIN images i ON i.id = d.image_id
            WHERE d.id IN ({placeholders})
            """,
            payload.draft_ids,
        ).fetchall()

    missing_reasons: list[str] = []
    if not settings.enabled:
        missing_reasons.append("LLM 已停用，请先在“模型与提示”里启用。")
    if not api_key:
        missing_reasons.append("LLM 没有可用的 API Key。")
    if not settings.model:
        missing_reasons.append("LLM 还没有选择模型。")

    if missing_reasons:
        for row in rows:
            update_draft_fields(
                row["draft_id"],
                {"llm_warnings_json": json_dump(missing_reasons)},
            )
        return DraftListResponse(items=current_items())

    configured_batch_size = max(1, payload.batch_size or settings.batch_size_default)
    configured_token_limit = max(2000, settings.request_token_limit)
    settings_payload: dict[str, Any] = {
        "base_url": settings.base_url,
        "api_key": api_key,
        "model": settings.model,
        "timeout_ms": settings.timeout_ms,
        "temperature": settings.temperature,
        "max_output_tokens": settings.max_output_tokens,
        "request_token_limit": settings.request_token_limit,
        "prompt_preset": payload.prompt_preset or settings.prompt_preset,
        "custom_prompt": payload.custom_prompt if payload.custom_prompt is not None else settings.custom_prompt,
        "mask_density": payload.mask_density or settings.mask_density,
    }

    batch: list[dict[str, Any]] = []
    row_by_image_id = {}
    for row in rows:
        if row["ignored"]:
            continue
        ocr_regions_payload = json_load(row["ocr_regions_json"], [])
        if payload.include_ocr and not ocr_regions_payload:
            source_path = Path(row["source_path"])
            if source_path.exists():
                regions, crop = detect_regions(source_path)
                ocr_text = "\n".join(region.text for region in regions if region.text.strip()) or None
                update_draft_fields(
                    row["draft_id"],
                    {
                        "ocr_regions_json": json_dump([region.model_dump() for region in regions]),
                        "ocr_text": ocr_text,
                        "last_error": None,
                    },
                )
                ocr_regions_payload = [region.model_dump() for region in regions]
        item = {
            "image_id": row["image_id"],
            "folder_path": row["folder_path"],
            "analysis_mode": payload.analysis_mode,
            "ocr_regions": ocr_regions_payload if payload.include_ocr else [],
        }
        if payload.include_image:
            if image_settings.llm_image_compress_enabled:
                media_type, encoded, byte_size = encode_image_base64(
                    Path(row["source_path"]),
                    output_format=image_settings.llm_image_format,
                    quality=image_settings.llm_image_quality,
                )
                image_payload_source = "compressed_webp"
            else:
                media_type, encoded, byte_size = encode_image_base64(Path(row["source_path"]), output_format="png")
                image_payload_source = "png_passthrough"
            item["image_base64"] = encoded
            item["image_media_type"] = media_type
            item["image_byte_size"] = byte_size
            item["image_payload_source"] = image_payload_source
        batch.append(item)
        row_by_image_id[row["image_id"]] = row

    if not batch:
        return DraftListResponse(items=current_items())

    cursor = 0
    while cursor < len(batch):
        chunk_size = min(configured_batch_size, len(batch) - cursor)
        while chunk_size > 1:
            token_estimate = estimate_llm_request_tokens(
                settings=settings_payload,
                batch=batch[cursor : cursor + chunk_size],
            )
            if token_estimate <= configured_token_limit:
                break
            chunk_size -= 1

        request_batch = batch[cursor : cursor + chunk_size]
        cursor += chunk_size
        subset = [row_by_image_id[item["image_id"]] for item in request_batch]
        by_image_id = {row["image_id"]: row for row in subset}

        try:
            suggestion, request_log, response_log = await request_llm_suggestions(settings=settings_payload, batch=request_batch)
        except Exception as exc:
            request_log_value = (
                exc.request_log
                if isinstance(exc, LLMRequestError)
                else json_dump(
                    {
                        "endpoint": f"{settings_payload['base_url'].rstrip('/')}/chat/completions",
                        "timeout_ms": settings_payload["timeout_ms"],
                        "settings": {
                            "model": settings_payload["model"],
                            "analysis_mode": payload.analysis_mode,
                            "include_image": payload.include_image,
                            "include_ocr": payload.include_ocr,
                            "request_token_limit": configured_token_limit,
                        },
                        "batch": [
                            {
                                key: value
                                for key, value in entry.items()
                                if key != "image_base64"
                            }
                            for entry in request_batch
                        ],
                    }
                )
            )
            response_log_value = (
                exc.response_log
                if isinstance(exc, LLMRequestError)
                else f"{type(exc).__name__}: {str(exc).strip() or repr(exc)}"
            )
            for row in subset:
                update_draft_fields(
                    row["draft_id"],
                    {
                        "llm_warnings_json": json_dump(
                            [f"LLM 请求失败，已保留规则建议: {exc}"]
                        ),
                        "llm_request_log": request_log_value,
                        "llm_response_log": response_log_value,
                    },
                )
            continue

        aggregated_by_image: dict[str, dict[str, Any]] = {}
        for item in suggestion.items:
            row = by_image_id.get(item.image_id)
            if row is None:
                continue
            ocr_regions = json_load(row["ocr_regions_json"], [])
            ocr_region_map = {
                region["id"]: region
                for region in ocr_regions
                if isinstance(region, dict) and region.get("id")
            }

            aggregate = aggregated_by_image.setdefault(
                item.image_id,
                {
                    "row": row,
                    "masks": [],
                    "summaries": [],
                    "observed_texts": [],
                    "cloze_targets": [],
                    "warnings": [],
                },
            )

            generated_masks: list[MaskRect] = []
            consumed_targets: set[str] = set()
            for mask in item.masks:
                if not isinstance(mask, dict):
                    continue

                region_ids = mask.get("region_ids")
                if isinstance(region_ids, list):
                    matched_regions = [
                        ocr_region_map[region_id]
                        for region_id in region_ids
                        if isinstance(region_id, str) and region_id in ocr_region_map
                    ]
                    if matched_regions:
                        if len(matched_regions) == 1:
                            region = matched_regions[0]
                            region_text = str(region.get("text") or "")
                            refined_targets = [
                                target.strip()
                                for target in item.cloze_targets
                                if target.strip() and target.strip() not in consumed_targets
                            ]
                            refined_bboxes: list[tuple[str, list[int]]] = []
                            for target in refined_targets:
                                bbox = estimate_text_span_bbox(region["bbox"], region_text, target)
                                if bbox is None:
                                    continue
                                refined_bboxes.append((target, bbox))
                                consumed_targets.add(target)

                            if refined_bboxes:
                                for target, refined_bbox in refined_bboxes:
                                    generated_masks.append(
                                        MaskRect(
                                            id=uuid.uuid4().hex,
                                            bbox=refined_bbox,
                                            label=target,
                                            reason=mask.get("reason") or f"根据 OCR 行内命中的目标词语“{target}”缩小遮罩范围。",
                                            confidence=float(mask.get("confidence", 0.0)),
                                            source="ocr_refined",
                                            manual=False,
                                        )
                                    )
                                continue

                        xs1 = [region["bbox"][0] for region in matched_regions]
                        ys1 = [region["bbox"][1] for region in matched_regions]
                        xs2 = [region["bbox"][2] for region in matched_regions]
                        ys2 = [region["bbox"][3] for region in matched_regions]
                        bbox = [min(xs1), min(ys1), max(xs2), max(ys2)]
                        generated_masks.append(
                            MaskRect(
                                id=uuid.uuid4().hex,
                                bbox=bbox,
                                label=mask.get("label", ""),
                                reason=mask.get("reason"),
                                confidence=float(mask.get("confidence", 0.0)),
                                source=mask.get("source", payload.analysis_mode),
                                manual=False,
                            )
                        )
                        continue

                if "bbox" in mask:
                    generated_masks.append(
                        MaskRect(
                            id=uuid.uuid4().hex,
                            bbox=mask["bbox"],
                            label=mask.get("label", ""),
                            reason=mask.get("reason"),
                            confidence=float(mask.get("confidence", 0.0)),
                            source=mask.get("source", payload.analysis_mode),
                            manual=False,
                        )
                    )

            aggregate["masks"].extend(generated_masks)

            if item.summary and item.summary not in aggregate["summaries"]:
                aggregate["summaries"].append(item.summary)

            observed_text = (item.observed_text or "").strip()
            if observed_text and observed_text not in aggregate["observed_texts"]:
                aggregate["observed_texts"].append(observed_text)

            for target in item.cloze_targets:
                normalized_target = target.strip()
                if normalized_target and normalized_target not in aggregate["cloze_targets"]:
                    aggregate["cloze_targets"].append(normalized_target)

            for warning in item.warnings:
                normalized_warning = warning.strip()
                if normalized_warning and normalized_warning not in aggregate["warnings"]:
                    aggregate["warnings"].append(normalized_warning)

        for image_id, aggregate in aggregated_by_image.items():
            row = aggregate["row"]
            existing_masks = [
                MaskRect.model_validate(entry)
                for entry in json_load(row["masks_json"], [])
            ]
            merged = (
                merge_generated_masks(existing_masks, aggregate["masks"])
                if aggregate["masks"]
                else existing_masks
            )
            fields: dict[str, Any] = {
                "masks_json": json_dump([mask.model_dump() for mask in merged]),
                "llm_summary": "；".join(aggregate["summaries"]) or None,
                "llm_observed_text": "\n\n".join(aggregate["observed_texts"]) or None,
                "llm_cloze_targets_json": json_dump(aggregate["cloze_targets"]),
                "llm_warnings_json": json_dump(aggregate["warnings"]),
                "llm_request_log": request_log,
                "llm_response_log": response_log,
                "last_error": None,
            }
            update_draft_fields(row["draft_id"], fields)
    return DraftListResponse(items=current_items())


@app.patch("/images/ignore", response_model=DraftListResponse)
async def patch_images_ignore(payload: ImageIgnoreBatchPayload) -> DraftListResponse:
    update_images_ignored(payload.image_ids, payload.ignored)
    return DraftListResponse(items=current_items())


@app.patch("/drafts/{draft_id}", response_model=CardDraft)
async def patch_draft(draft_id: str, payload: DraftPatchPayload) -> CardDraft:
    row = get_draft_row(draft_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Draft not found.")
    fields: dict[str, Any] = {}
    if payload.review_status is not None:
        fields["review_status"] = payload.review_status
    if payload.deck is not None:
        fields["deck"] = payload.deck.strip() or None
    if payload.tags is not None:
        fields["tags_json"] = json_dump(payload.tags)
    if payload.route_reason is not None:
        fields["route_reason"] = payload.route_reason.strip() or None
    update_draft_fields(draft_id, fields)
    if payload.deck is not None or payload.tags is not None:
        next_deck = payload.deck.strip() or None if payload.deck is not None else row["deck"]
        next_tags_json = json_dump(payload.tags) if payload.tags is not None else row["tags_json"]
        with connect() as conn:
            conn.execute(
                """
                UPDATE images
                SET deck = ?, tags_json = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = (SELECT image_id FROM drafts WHERE id = ?)
                """,
                (
                    next_deck,
                    next_tags_json,
                    draft_id,
                ),
            )
    return await get_draft(draft_id)


@app.patch("/drafts/{draft_id}/crop", response_model=CardDraft)
async def patch_crop(draft_id: str, payload: CropUpdatePayload) -> CardDraft:
    row = get_draft_row(draft_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Draft not found.")
    update_draft_fields(
        draft_id,
        {
            "crop_json": json_dump(
                CropSuggestion(
                    bbox=payload.bbox,
                    padding=payload.padding,
                    confidence=payload.confidence,
                    source=payload.source,
                ).model_dump()
            )
        },
    )
    return await get_draft(draft_id)


@app.patch("/drafts/{draft_id}/masks", response_model=CardDraft)
async def patch_masks(draft_id: str, payload: MaskUpdatePayload) -> CardDraft:
    row = get_draft_row(draft_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Draft not found.")
    update_draft_fields(
        draft_id,
        {"masks_json": json_dump([mask.model_dump() for mask in payload.masks])},
    )
    return await get_draft(draft_id)


@app.post("/drafts/{draft_id}/reset-analysis", response_model=CardDraft)
async def reset_draft_analysis(draft_id: str) -> CardDraft:
    row = get_draft_row(draft_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Draft not found.")

    update_draft_fields(
        draft_id,
        {
            "review_status": "route_review",
            "crop_json": None,
            "masks_json": "[]",
            "ocr_regions_json": "[]",
            "ocr_text": None,
            "ocr_request_log": None,
            "ocr_response_log": None,
            "front_image_path": None,
            "back_image_path": None,
            "llm_summary": None,
            "llm_observed_text": None,
            "llm_cloze_targets_json": "[]",
            "llm_warnings_json": "[]",
            "llm_request_log": None,
            "llm_response_log": None,
            "render_fingerprint": None,
            "last_error": None,
        },
    )

    with connect() as conn:
        conn.execute(
            """
            UPDATE images
            SET status = 'scanned'
            WHERE id = (SELECT image_id FROM drafts WHERE id = ?)
            """,
            (draft_id,),
        )

    return await get_draft(draft_id)


@app.post("/drafts/{draft_id}/render", response_model=RenderResponse)
async def render_draft(draft_id: str) -> RenderResponse:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT
              d.id AS draft_id,
              d.crop_json,
              d.masks_json,
              i.source_path
            FROM drafts d
            JOIN images i ON i.id = d.image_id
            WHERE d.id = ?
            """,
            (draft_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Draft not found.")
    crop = manual_crop_from_json(row["crop_json"])
    masks = [MaskRect.model_validate(item) for item in json_load(row["masks_json"], [])]
    front_path, back_path, fingerprint = render_draft_assets(
        Path(row["source_path"]),
        crop,
        masks,
        draft_id,
    )
    update_draft_fields(
        draft_id,
        {
            "front_image_path": str(front_path),
            "back_image_path": str(back_path),
            "render_fingerprint": fingerprint,
            "last_error": None,
        },
    )
    return RenderResponse(draft=await get_draft(draft_id))


@app.post("/drafts/import-approved", response_model=ImportApprovedResponse)
async def import_approved(payload: ImportApprovedRequest) -> ImportApprovedResponse:
    with connect() as conn:
        if payload.draft_ids:
            placeholders = ",".join("?" for _ in payload.draft_ids)
            rows = conn.execute(
                f"""
                SELECT d.id AS draft_id, d.deck, d.tags_json, d.front_image_path, d.back_image_path
                FROM drafts d
                WHERE d.review_status = 'approved' AND d.id IN ({placeholders})
                """,
                payload.draft_ids,
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT d.id AS draft_id, d.deck, d.tags_json, d.front_image_path, d.back_image_path
                FROM drafts d
                WHERE d.review_status = 'approved'
                """
            ).fetchall()

    results: list[ImportResult] = []
    for row in rows:
        if not row["deck"]:
            results.append(build_import_error(row["draft_id"], "Draft is missing a target deck."))
            continue
        if not row["front_image_path"] or not row["back_image_path"]:
            await render_draft(row["draft_id"])
            refreshed = get_draft_row(row["draft_id"])
            assert refreshed is not None
            row = {
                **dict(row),
                "front_image_path": refreshed["front_image_path"],
                "back_image_path": refreshed["back_image_path"],
            }
        try:
            note_id = await import_to_anki(
                base_url="http://127.0.0.1:8765",
                deck_name=row["deck"],
                front_path=Path(row["front_image_path"]),
                back_path=Path(row["back_image_path"]),
                draft_id=row["draft_id"],
                tags=json_load(row["tags_json"], []),
            )
            update_draft_fields(
                row["draft_id"],
                {"review_status": "imported", "imported_note_id": note_id, "last_error": None},
            )
            with connect() as conn:
                conn.execute(
                    "UPDATE images SET status = 'imported' WHERE id = (SELECT image_id FROM drafts WHERE id = ?)",
                    (row["draft_id"],),
                )
            results.append(ImportResult(draft_id=row["draft_id"], ok=True, note_id=note_id))
        except Exception as exc:
            update_draft_fields(row["draft_id"], {"last_error": str(exc)})
            results.append(build_import_error(row["draft_id"], str(exc)))
    return ImportApprovedResponse(results=results)


@app.get("/anki/manual-template", response_model=AnkiTemplateStatusResponse)
async def get_manual_anki_template_status() -> AnkiTemplateStatusResponse:
    try:
        return await ensure_manual_anki_template("http://127.0.0.1:8765")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Anki template check failed: {exc}") from exc


@app.get("/anki/decks", response_model=DeckListResponse)
async def get_anki_decks() -> DeckListResponse:
    local_decks = {
        item.draft.deck.strip()
        for item in current_items()
        if item.draft.deck and item.draft.deck.strip()
    }
    try:
        remote_decks = await list_anki_decks("http://127.0.0.1:8765")
    except Exception:
        remote_decks = []
    merged = sorted(local_decks.union(remote_decks))
    return DeckListResponse(items=merged)


@app.post("/drafts/import-manual", response_model=ManualImportResponse)
async def import_manual(payload: ManualImportRequest) -> ManualImportResponse:
    with connect() as conn:
        if payload.draft_ids:
            placeholders = ",".join("?" for _ in payload.draft_ids)
            rows = conn.execute(
                f"""
                SELECT d.id AS draft_id, d.deck, d.tags_json, d.masks_json, i.source_path
                FROM drafts d
                JOIN images i ON i.id = d.image_id
                WHERE d.id IN ({placeholders})
                """,
                payload.draft_ids,
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT d.id AS draft_id, d.deck, d.tags_json, d.masks_json, i.source_path
                FROM drafts d
                JOIN images i ON i.id = d.image_id
                WHERE i.ignored = 0
                """
            ).fetchall()

    results: list[Any] = []
    for row in rows:
        if not row["deck"]:
            results.append(
                {
                    "draft_id": row["draft_id"],
                    "ok": False,
                    "note_ids": [],
                    "created_count": 0,
                    "template_name": None,
                    "error": "当前图片还没有目标 deck。",
                }
            )
            continue

        masks = [MaskRect.model_validate(item) for item in json_load(row["masks_json"], [])]
        try:
            result = await import_manual_masks_to_anki(
                base_url="http://127.0.0.1:8765",
                deck_name=row["deck"],
                source_path=Path(row["source_path"]),
                draft_id=row["draft_id"],
                tags=json_load(row["tags_json"], []),
                masks=masks,
                webp_quality=max(1, min(payload.webp_quality, 100)),
            )
            update_draft_fields(
                row["draft_id"],
                {
                    "review_status": "imported",
                    "imported_note_id": result.note_ids[0] if result.note_ids else None,
                    "last_error": result.error,
                },
            )
            with connect() as conn:
                conn.execute(
                    "UPDATE images SET status = 'imported' WHERE id = (SELECT image_id FROM drafts WHERE id = ?)",
                    (row["draft_id"],),
                )
            results.append(result.model_dump())
        except Exception as exc:
            update_draft_fields(row["draft_id"], {"last_error": str(exc)})
            results.append(
                {
                    "draft_id": row["draft_id"],
                    "ok": False,
                    "note_ids": [],
                    "created_count": 0,
                    "template_name": None,
                    "error": str(exc),
                }
            )
    return ManualImportResponse(results=results)


@app.get("/settings/llm", response_model=LLMSettingsRecord)
async def get_settings() -> LLMSettingsRecord:
    settings, _ = get_llm_settings()
    return settings


@app.get("/settings/image-processing", response_model=ImageProcessingSettingsRecord)
async def get_image_settings() -> ImageProcessingSettingsRecord:
    return get_image_processing_settings()


@app.post("/settings/image-processing/preview", response_model=ImageCompressionPreviewResponse)
async def get_image_processing_preview(payload: ImageCompressionPreviewRequest) -> ImageCompressionPreviewResponse:
    row = get_image_row(payload.image_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    path = Path(row["source_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image file not found.")

    current = get_image_processing_settings()
    compress_enabled = payload.llm_image_compress_enabled
    if compress_enabled is None:
        compress_enabled = current.llm_image_compress_enabled
    output_format = payload.llm_image_format or current.llm_image_format
    quality = payload.llm_image_quality if payload.llm_image_quality is not None else current.llm_image_quality
    request_format = output_format if compress_enabled else "png"
    media_type, encoded, byte_size = encode_image_base64(path, output_format=request_format, quality=quality)

    return ImageCompressionPreviewResponse(
        image_id=payload.image_id,
        media_type=media_type,
        byte_size=byte_size,
        original_byte_size=path.stat().st_size,
        width=row["width"],
        height=row["height"],
        format=request_format,
        quality=quality,
        using_compressed_image=compress_enabled,
        preview_data_url=f"data:{media_type};base64,{encoded}",
    )


@app.get("/settings/routing", response_model=RoutingSettingsRecord)
async def get_routing_mode() -> RoutingSettingsRecord:
    return get_routing_settings()


@app.post("/settings/llm/models", response_model=LLMModelListResponse)
async def get_available_models(payload: ModelDiscoveryPayload) -> LLMModelListResponse:
    settings, api_key = get_llm_settings()
    try:
        items = await fetch_available_models(payload.base_url or settings.base_url, payload.api_key or api_key)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Model discovery failed: {exc}") from exc
    return LLMModelListResponse(items=items)


@app.post("/settings/llm/test", response_model=ModelConnectionTestResponse)
async def test_llm_connection(payload: ModelDiscoveryPayload) -> ModelConnectionTestResponse:
    settings, api_key = get_llm_settings()
    try:
        ok, model_count, model_found, message = await test_model_connection(
            base_url=payload.base_url or settings.base_url,
            api_key=payload.api_key or api_key,
            model=payload.model or settings.model,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Connection test failed: {exc}") from exc
    return ModelConnectionTestResponse(
        ok=ok,
        model_count=model_count,
        model_found=model_found,
        message=message,
    )


@app.get("/settings/llm/prompt-presets", response_model=PromptPresetListResponse)
async def get_prompt_preset_list() -> PromptPresetListResponse:
    return PromptPresetListResponse(items=get_prompt_presets())


@app.patch("/settings/llm", response_model=LLMSettingsRecord)
async def patch_settings(payload: LLMSettingsPayload) -> LLMSettingsRecord:
    return update_llm_settings(payload.model_dump(exclude_none=True))


@app.patch("/settings/image-processing", response_model=ImageProcessingSettingsRecord)
async def patch_image_settings(payload: ImageProcessingSettingsPayload) -> ImageProcessingSettingsRecord:
    return update_image_processing_settings(payload.model_dump(exclude_none=True))


@app.patch("/settings/routing", response_model=RoutingSettingsRecord)
async def patch_routing_mode(payload: RoutingSettingsPayload) -> RoutingSettingsRecord:
    return update_routing_settings(payload.model_dump(exclude_none=True))


@app.get("/rules")
async def get_rules() -> dict[str, Any]:
    return {"rules": list_rules()}


@app.patch("/rules")
async def patch_rules(payload: RuleSetPayload) -> dict[str, Any]:
    return {"rules": replace_rules(payload.rules)}
    DeckListResponse,
