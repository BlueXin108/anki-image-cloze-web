from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
import contextlib
from typing import Any, Iterator

from .models import (
    CardDraft,
    CropSuggestion,
    DetectedRegion,
    DraftListItem,
    ImageItem,
    ImageProcessingSettingsRecord,
    LLMSettingsRecord,
    MaskRect,
    RoutingSettingsRecord,
    RulePayload,
    RuleRecord,
)

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"
RENDER_DIR = STORAGE_DIR / "renders"
DB_PATH = STORAGE_DIR / "prototype.db"


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def ensure_storage() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    RENDER_DIR.mkdir(parents=True, exist_ok=True)


def ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    existing = {
        row["name"]
        for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
    }
    if column in existing:
        return
    conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    ensure_storage()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS rules (
              id TEXT PRIMARY KEY,
              folder_pattern TEXT NOT NULL,
              deck_name TEXT NOT NULL,
              tags_json TEXT NOT NULL,
              enabled INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS llm_settings (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              enabled INTEGER NOT NULL DEFAULT 0,
              base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
              api_key TEXT,
              model TEXT NOT NULL DEFAULT '',
              timeout_ms INTEGER NOT NULL DEFAULT 120000,
              analysis_mode_default TEXT NOT NULL DEFAULT 'hybrid',
              batch_size_default INTEGER NOT NULL DEFAULT 3,
              send_image_default INTEGER NOT NULL DEFAULT 1,
              send_ocr_default INTEGER NOT NULL DEFAULT 1,
              temperature REAL NOT NULL DEFAULT 0.2,
              max_output_tokens INTEGER NOT NULL DEFAULT 4096,
              request_token_limit INTEGER NOT NULL DEFAULT 18000,
              prompt_preset TEXT NOT NULL DEFAULT 'anki_focus',
              custom_prompt TEXT NOT NULL DEFAULT '',
              mask_density TEXT NOT NULL DEFAULT 'medium'
            );

            CREATE TABLE IF NOT EXISTS image_processing_settings (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              llm_image_compress_enabled INTEGER NOT NULL DEFAULT 1,
              llm_image_format TEXT NOT NULL DEFAULT 'webp',
              llm_image_quality INTEGER NOT NULL DEFAULT 68
            );

            CREATE TABLE IF NOT EXISTS routing_settings (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              mode TEXT NOT NULL DEFAULT 'folder_name',
              semantic_max_depth INTEGER NOT NULL DEFAULT 3,
              semantic_batch_size INTEGER NOT NULL DEFAULT 3,
              semantic_request_token_limit INTEGER NOT NULL DEFAULT 12000
            );

            CREATE TABLE IF NOT EXISTS images (
              id TEXT PRIMARY KEY,
              source_path TEXT NOT NULL UNIQUE,
              folder_path TEXT NOT NULL,
              file_hash TEXT NOT NULL,
              width INTEGER NOT NULL,
              height INTEGER NOT NULL,
              status TEXT NOT NULL,
              ignored INTEGER NOT NULL DEFAULT 0,
              deck TEXT,
              tags_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS drafts (
              id TEXT PRIMARY KEY,
              image_id TEXT NOT NULL UNIQUE,
              deck TEXT,
              tags_json TEXT NOT NULL,
              review_status TEXT NOT NULL,
              route_reason TEXT,
              route_source TEXT,
              route_request_log TEXT,
              route_response_log TEXT,
              crop_json TEXT,
              masks_json TEXT NOT NULL,
              ocr_regions_json TEXT NOT NULL,
              front_image_path TEXT,
              back_image_path TEXT,
              ocr_text TEXT,
              ocr_request_log TEXT,
              ocr_response_log TEXT,
              llm_summary TEXT,
              llm_observed_text TEXT,
              llm_cloze_targets_json TEXT NOT NULL DEFAULT '[]',
              llm_warnings_json TEXT NOT NULL,
              llm_request_log TEXT,
              llm_response_log TEXT,
              render_fingerprint TEXT,
              last_error TEXT,
              imported_note_id INTEGER,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              FOREIGN KEY(image_id) REFERENCES images(id)
            );
            """
        )
        ensure_column(conn, "images", "ignored", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "llm_settings", "prompt_preset", "TEXT NOT NULL DEFAULT 'anki_focus'")
        ensure_column(conn, "llm_settings", "custom_prompt", "TEXT NOT NULL DEFAULT ''")
        ensure_column(conn, "llm_settings", "request_token_limit", "INTEGER NOT NULL DEFAULT 18000")
        ensure_column(conn, "llm_settings", "mask_density", "TEXT NOT NULL DEFAULT 'medium'")
        ensure_column(conn, "drafts", "ocr_text", "TEXT")
        ensure_column(conn, "drafts", "ocr_request_log", "TEXT")
        ensure_column(conn, "drafts", "ocr_response_log", "TEXT")
        ensure_column(conn, "drafts", "route_reason", "TEXT")
        ensure_column(conn, "drafts", "route_source", "TEXT")
        ensure_column(conn, "drafts", "route_request_log", "TEXT")
        ensure_column(conn, "drafts", "route_response_log", "TEXT")
        ensure_column(conn, "routing_settings", "semantic_max_depth", "INTEGER NOT NULL DEFAULT 3")
        ensure_column(conn, "routing_settings", "semantic_batch_size", "INTEGER NOT NULL DEFAULT 3")
        ensure_column(conn, "routing_settings", "semantic_request_token_limit", "INTEGER NOT NULL DEFAULT 12000")
        ensure_column(conn, "drafts", "llm_observed_text", "TEXT")
        ensure_column(conn, "drafts", "llm_cloze_targets_json", "TEXT NOT NULL DEFAULT '[]'")
        ensure_column(conn, "drafts", "llm_request_log", "TEXT")
        ensure_column(conn, "drafts", "llm_response_log", "TEXT")
        conn.execute(
            """
            INSERT INTO llm_settings (
              id, enabled, base_url, model, timeout_ms, analysis_mode_default,
              batch_size_default, send_image_default, send_ocr_default,
              temperature, max_output_tokens, request_token_limit, prompt_preset, custom_prompt, mask_density
            )
            VALUES (1, 0, 'https://api.openai.com/v1', '', 120000, 'hybrid', 3, 1, 1, 0.2, 4096, 18000, 'anki_focus', '', 'medium')
            ON CONFLICT(id) DO NOTHING
            """
        )
        conn.execute(
            """
            UPDATE llm_settings
            SET timeout_ms = 120000
            WHERE id = 1 AND timeout_ms = 30000
            """
        )
        conn.execute(
            """
            UPDATE llm_settings
            SET max_output_tokens = 4096
            WHERE id = 1 AND max_output_tokens = 1200
            """
        )
        conn.execute(
            """
            UPDATE llm_settings
            SET analysis_mode_default = 'hybrid', send_image_default = 1, send_ocr_default = 1
            WHERE id = 1 AND analysis_mode_default = 'image_only'
            """
        )
        conn.execute(
            """
            UPDATE llm_settings
            SET send_ocr_default = 1
            WHERE id = 1 AND send_image_default = 1 AND send_ocr_default = 0
            """
        )
        conn.execute(
            """
            UPDATE drafts
            SET review_status = 'llm_review'
            WHERE review_status = 'needs_review'
              AND (
                COALESCE(llm_summary, '') <> ''
                OR COALESCE(llm_observed_text, '') <> ''
                OR COALESCE(llm_cloze_targets_json, '[]') <> '[]'
                OR COALESCE(masks_json, '[]') <> '[]'
              )
            """
        )
        conn.execute(
            """
            UPDATE drafts
            SET review_status = 'route_review'
            WHERE review_status = 'needs_review'
            """
        )
        conn.execute(
            """
            INSERT INTO image_processing_settings (
              id, llm_image_compress_enabled, llm_image_format, llm_image_quality
            )
            VALUES (1, 1, 'webp', 68)
            ON CONFLICT(id) DO NOTHING
            """
        )
        conn.execute(
            """
            INSERT INTO routing_settings (id, mode, semantic_max_depth, semantic_batch_size, semantic_request_token_limit)
            VALUES (1, 'folder_name', 3, 3, 12000)
            ON CONFLICT(id) DO NOTHING
            """
        )


def json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def json_load(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    return json.loads(value)


def list_rules() -> list[RuleRecord]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, folder_pattern, deck_name, tags_json, enabled FROM rules ORDER BY folder_pattern"
        ).fetchall()
    return [
        RuleRecord(
            id=row["id"],
            folder_pattern=row["folder_pattern"],
            deck_name=row["deck_name"],
            tags=json_load(row["tags_json"], []),
            enabled=bool(row["enabled"]),
        )
        for row in rows
    ]


def replace_rules(rules: list[RulePayload]) -> list[RuleRecord]:
    with connect() as conn:
        conn.execute("DELETE FROM rules")
        for rule in rules:
            conn.execute(
                """
                INSERT INTO rules (id, folder_pattern, deck_name, tags_json, enabled)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    rule.id or uuid.uuid4().hex,
                    rule.folder_pattern,
                    rule.deck_name,
                    json_dump(rule.tags),
                    int(rule.enabled),
                ),
            )
    return list_rules()


def get_llm_settings() -> tuple[LLMSettingsRecord, str | None]:
    with connect() as conn:
        row = conn.execute("SELECT * FROM llm_settings WHERE id = 1").fetchone()
    assert row is not None
    return (
        LLMSettingsRecord(
            enabled=bool(row["enabled"]),
            base_url=row["base_url"],
            api_key_present=bool(row["api_key"]),
            model=row["model"],
            timeout_ms=row["timeout_ms"],
            analysis_mode_default=row["analysis_mode_default"],
            batch_size_default=row["batch_size_default"],
            send_image_default=bool(row["send_image_default"]),
            send_ocr_default=bool(row["send_ocr_default"]),
            temperature=row["temperature"],
            max_output_tokens=row["max_output_tokens"],
            request_token_limit=row["request_token_limit"],
            prompt_preset=row["prompt_preset"],
            custom_prompt=row["custom_prompt"],
            mask_density=row["mask_density"],
        ),
        row["api_key"],
    )


def update_llm_settings(payload: dict[str, Any]) -> LLMSettingsRecord:
    current, secret = get_llm_settings()
    next_mode = payload.get("analysis_mode_default", current.analysis_mode_default)
    if next_mode not in {"hybrid", "ocr_only"}:
        next_mode = "hybrid"
    merged = {
        "enabled": int(payload.get("enabled", current.enabled)),
        "base_url": payload.get("base_url", current.base_url),
        "api_key": payload.get("api_key", secret),
        "model": payload.get("model", current.model),
        "timeout_ms": payload.get("timeout_ms", current.timeout_ms),
        "analysis_mode_default": next_mode,
        "batch_size_default": payload.get(
            "batch_size_default", current.batch_size_default
        ),
        "send_image_default": 0 if next_mode == "ocr_only" else 1,
        "send_ocr_default": 1,
        "temperature": payload.get("temperature", current.temperature),
        "max_output_tokens": payload.get(
            "max_output_tokens", current.max_output_tokens
        ),
        "request_token_limit": payload.get(
            "request_token_limit", current.request_token_limit
        ),
        "prompt_preset": payload.get("prompt_preset", current.prompt_preset),
        "custom_prompt": payload.get("custom_prompt", current.custom_prompt),
        "mask_density": payload.get("mask_density", current.mask_density),
    }
    with connect() as conn:
        conn.execute(
            """
            UPDATE llm_settings
            SET enabled = ?, base_url = ?, api_key = ?, model = ?, timeout_ms = ?,
                analysis_mode_default = ?, batch_size_default = ?, send_image_default = ?,
                send_ocr_default = ?, temperature = ?, max_output_tokens = ?,
                request_token_limit = ?, prompt_preset = ?, custom_prompt = ?, mask_density = ?
            WHERE id = 1
            """,
            (
                merged["enabled"],
                merged["base_url"],
                merged["api_key"],
                merged["model"],
                merged["timeout_ms"],
                merged["analysis_mode_default"],
                merged["batch_size_default"],
                merged["send_image_default"],
                merged["send_ocr_default"],
                merged["temperature"],
                merged["max_output_tokens"],
                merged["request_token_limit"],
                merged["prompt_preset"],
                merged["custom_prompt"],
                merged["mask_density"],
            ),
        )
    settings, _ = get_llm_settings()
    return settings


def get_image_processing_settings() -> ImageProcessingSettingsRecord:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM image_processing_settings WHERE id = 1"
        ).fetchone()
    assert row is not None
    return ImageProcessingSettingsRecord(
        llm_image_compress_enabled=bool(row["llm_image_compress_enabled"]),
        llm_image_format=row["llm_image_format"],
        llm_image_quality=row["llm_image_quality"],
    )


def update_image_processing_settings(payload: dict[str, Any]) -> ImageProcessingSettingsRecord:
    current = get_image_processing_settings()
    merged = {
        "llm_image_compress_enabled": int(
            payload.get("llm_image_compress_enabled", current.llm_image_compress_enabled)
        ),
        "llm_image_format": payload.get("llm_image_format", current.llm_image_format),
        "llm_image_quality": payload.get("llm_image_quality", current.llm_image_quality),
    }
    with connect() as conn:
        conn.execute(
            """
            UPDATE image_processing_settings
            SET llm_image_compress_enabled = ?, llm_image_format = ?, llm_image_quality = ?
            WHERE id = 1
            """,
            (
                merged["llm_image_compress_enabled"],
                merged["llm_image_format"],
                merged["llm_image_quality"],
            ),
        )
    return get_image_processing_settings()


def get_routing_settings() -> RoutingSettingsRecord:
    with connect() as conn:
        row = conn.execute("SELECT * FROM routing_settings WHERE id = 1").fetchone()
    assert row is not None
    semantic_max_depth = row["semantic_max_depth"] if row["semantic_max_depth"] else 3
    semantic_batch_size = row["semantic_batch_size"] if row["semantic_batch_size"] else 3
    semantic_request_token_limit = row["semantic_request_token_limit"] if row["semantic_request_token_limit"] else 12000
    return RoutingSettingsRecord(
        mode=row["mode"],
        semantic_max_depth=max(1, int(semantic_max_depth)),
        semantic_batch_size=max(1, int(semantic_batch_size)),
        semantic_request_token_limit=max(2000, int(semantic_request_token_limit)),
    )


def update_routing_settings(payload: dict[str, Any]) -> RoutingSettingsRecord:
    current = get_routing_settings()
    semantic_max_depth = payload.get("semantic_max_depth", current.semantic_max_depth)
    semantic_batch_size = payload.get("semantic_batch_size", current.semantic_batch_size)
    semantic_request_token_limit = payload.get(
        "semantic_request_token_limit", current.semantic_request_token_limit
    )
    try:
        semantic_max_depth = int(semantic_max_depth)
    except Exception:
        semantic_max_depth = current.semantic_max_depth
    try:
        semantic_batch_size = int(semantic_batch_size)
    except Exception:
        semantic_batch_size = current.semantic_batch_size
    try:
        semantic_request_token_limit = int(semantic_request_token_limit)
    except Exception:
        semantic_request_token_limit = current.semantic_request_token_limit
    merged = {
        "mode": payload.get("mode", current.mode),
        "semantic_max_depth": max(1, min(semantic_max_depth, 8)),
        "semantic_batch_size": max(1, min(semantic_batch_size, 12)),
        "semantic_request_token_limit": max(2000, min(semantic_request_token_limit, 120000)),
    }
    with connect() as conn:
        conn.execute(
            """
            UPDATE routing_settings
            SET mode = ?, semantic_max_depth = ?, semantic_batch_size = ?, semantic_request_token_limit = ?
            WHERE id = 1
            """,
            (
                merged["mode"],
                merged["semantic_max_depth"],
                merged["semantic_batch_size"],
                merged["semantic_request_token_limit"],
            ),
        )
    return get_routing_settings()


def upsert_image(
    *,
    source_path: str,
    folder_path: str,
    file_hash: str,
    width: int,
    height: int,
    status: str,
    deck: str | None,
    tags: list[str],
) -> str:
    with connect() as conn:
        row = conn.execute(
            "SELECT id FROM images WHERE source_path = ?", (source_path,)
        ).fetchone()
        now = utc_now()
        if row:
            image_id = row["id"]
            conn.execute(
                """
                UPDATE images
                SET folder_path = ?, file_hash = ?, width = ?, height = ?, status = ?,
                    deck = ?, tags_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    folder_path,
                    file_hash,
                    width,
                    height,
                    status,
                    deck,
                    json_dump(tags),
                    now,
                    image_id,
                ),
            )
        else:
            image_id = uuid.uuid4().hex
            conn.execute(
                """
                INSERT INTO images (
                  id, source_path, folder_path, file_hash, width, height, status,
                  ignored, deck, tags_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    image_id,
                    source_path,
                    folder_path,
                    file_hash,
                    width,
                    height,
                    status,
                    0,
                    deck,
                    json_dump(tags),
                    now,
                    now,
                ),
            )
        return image_id


def ensure_draft(
    image_id: str,
    deck: str | None,
    tags: list[str],
    review_status: str,
) -> str:
    with connect() as conn:
        row = conn.execute(
            "SELECT id FROM drafts WHERE image_id = ?", (image_id,)
        ).fetchone()
        now = utc_now()
        if row:
            draft_id = row["id"]
            conn.execute(
                """
                UPDATE drafts
                SET deck = ?, tags_json = ?, review_status = ?, updated_at = ?
                WHERE id = ?
                """,
                (deck, json_dump(tags), review_status, now, draft_id),
            )
        else:
            draft_id = uuid.uuid4().hex
            conn.execute(
                """
                INSERT INTO drafts (
                  id, image_id, deck, tags_json, review_status, masks_json,
                  ocr_regions_json, llm_warnings_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    draft_id,
                    image_id,
                    deck,
                    json_dump(tags),
                    review_status,
                    "[]",
                    "[]",
                    "[]",
                    now,
                    now,
                ),
            )
        return draft_id


def update_draft_fields(draft_id: str, fields: dict[str, Any]) -> None:
    if not fields:
        return
    assignments = ", ".join(f"{column} = ?" for column in fields)
    values = list(fields.values()) + [utc_now(), draft_id]
    with connect() as conn:
        conn.execute(
            f"UPDATE drafts SET {assignments}, updated_at = ? WHERE id = ?",
            values,
        )


def update_images_ignored(image_ids: list[str], ignored: bool) -> None:
    if not image_ids:
        return
    placeholders = ",".join("?" for _ in image_ids)
    with connect() as conn:
        conn.execute(
            f"UPDATE images SET ignored = ?, updated_at = ? WHERE id IN ({placeholders})",
            [int(ignored), utc_now(), *image_ids],
        )


def get_image_row(image_id: str) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()


def get_draft_row(draft_id: str) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()


def list_draft_rows() -> list[sqlite3.Row]:
    with connect() as conn:
        return conn.execute(
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
            ORDER BY d.updated_at DESC
            """
        ).fetchall()


def clear_workspace_state() -> None:
    with connect() as conn:
        conn.execute("DELETE FROM drafts")
        conn.execute("DELETE FROM images")
    for rendered_file in RENDER_DIR.glob("*"):
        if rendered_file.is_file():
            with contextlib.suppress(OSError):
                rendered_file.unlink()


def build_draft_item(row: sqlite3.Row) -> DraftListItem:
    route_reason = row["route_reason"]
    if not route_reason and row["draft_deck"]:
        route_reason = f"当前建议送去 {row['draft_deck']}。这张草稿还没有更详细的归档说明。"

    image = ImageItem(
        id=row["image_id"],
        source_path=row["source_path"],
        folder_path=row["folder_path"],
        file_hash=row["file_hash"],
        width=row["width"],
        height=row["height"],
        status=row["image_status"],
        ignored=bool(row["image_ignored"]),
        deck=row["image_deck"],
        tags=json_load(row["image_tags_json"], []),
        source_url=f"/images/{row['image_id']}/file",
    )
    draft = CardDraft(
        id=row["draft_id"],
        image_id=row["image_id"],
        deck=row["draft_deck"],
        tags=json_load(row["draft_tags_json"], []),
        review_status=row["review_status"],
        route_reason=route_reason,
        route_source=row["route_source"],
        route_request_log=row["route_request_log"],
        route_response_log=row["route_response_log"],
        crop=(
            CropSuggestion.model_validate(json_load(row["crop_json"], {}))
            if row["crop_json"]
            else None
        ),
        masks=[
            MaskRect.model_validate(item)
            for item in json_load(row["masks_json"], [])
        ],
        ocr_regions=[
            DetectedRegion.model_validate(item)
            for item in json_load(row["ocr_regions_json"], [])
        ],
        ocr_text=row["ocr_text"],
        ocr_request_log=row["ocr_request_log"],
        ocr_response_log=row["ocr_response_log"],
        front_image_path=row["front_image_path"],
        back_image_path=row["back_image_path"],
        front_image_url=(
            f"/renders/{Path(row['front_image_path']).name}"
            if row["front_image_path"]
            else None
        ),
        back_image_url=(
            f"/renders/{Path(row['back_image_path']).name}"
            if row["back_image_path"]
            else None
        ),
        llm_summary=row["llm_summary"],
        llm_observed_text=row["llm_observed_text"],
        llm_cloze_targets=json_load(row["llm_cloze_targets_json"], []),
        llm_warnings=json_load(row["llm_warnings_json"], []),
        llm_request_log=row["llm_request_log"],
        llm_response_log=row["llm_response_log"],
        render_fingerprint=row["render_fingerprint"],
        last_error=row["last_error"],
        source_image_url=f"/images/{row['image_id']}/file",
        imported_note_id=row["imported_note_id"],
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )
    return DraftListItem(image=image, draft=draft)
