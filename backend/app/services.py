from __future__ import annotations

import base64
import fnmatch
import hashlib
import html
import io
import json
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any

import httpx
from PIL import Image, ImageDraw

from .models import (
    AnkiTemplateStatusResponse,
    CropSuggestion,
    DetectedRegion,
    ImportResult,
    LLMBatchSuggestion,
    LLMModelRecord,
    ManualImportResult,
    MaskRect,
    PromptPresetRecord,
    RouteBatchSuggestion,
    RuleRecord,
)
from .storage import RENDER_DIR, build_draft_item, get_image_row, list_draft_rows, update_draft_fields

_OCR_ENGINE_CACHE: tuple[str, Any] | None | bool = False


class LLMRequestError(RuntimeError):
    def __init__(self, message: str, *, request_log: str, response_log: str | None = None) -> None:
        super().__init__(message)
        self.request_log = request_log
        self.response_log = response_log or message

PROMPT_PRESETS: dict[str, str] = {
    "anki_focus": (
        "优先找出最适合做记忆测试的知识点。"
        "是否返回多个遮罩由当前遮罩密度决定，不要自设固定数量上限。"
        "优先遮挡术语、结论、关键条件、公式左值或核心符号。"
        "避免把整段话一次性全部盖住。"
    ),
    "concept_map": (
        "优先找出概念网络中的关键节点。"
        "返回数量由当前遮罩密度决定，不要自设固定数量上限。"
        "适合定义、定理、性质、推论之间的关系记忆。"
    ),
    "formula_focus": (
        "优先找出公式和推导中的可测试片段。"
        "返回数量由当前遮罩密度决定，不要自设固定数量上限。"
        "优先变量名、结果项、条件项、重要运算符附近，不要整行全遮。"
    ),
}

PROMPT_PRESET_LABELS: dict[str, str] = {
    "anki_focus": "记忆挖空",
    "concept_map": "概念网络",
    "formula_focus": "公式优先",
    "custom": "自定义",
}


def clamp_bbox(bbox: list[int], width: int, height: int) -> list[int]:
    x1, y1, x2, y2 = bbox
    x1 = max(0, min(x1, width - 1))
    y1 = max(0, min(y1, height - 1))
    x2 = max(x1 + 1, min(x2, width))
    y2 = max(y1 + 1, min(y2, height))
    return [x1, y1, x2, y2]


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def classify_folder(relative_folder: str, rules: list[RuleRecord]) -> tuple[str | None, list[str]]:
    normalized = relative_folder.replace("\\", "/").strip("/")
    for rule in rules:
        if not rule.enabled:
            continue
        pattern = rule.folder_pattern.replace("\\", "/").strip("/")
        if fnmatch.fnmatch(normalized, pattern) or fnmatch.fnmatch(f"/{normalized}", pattern):
            return rule.deck_name, rule.tags
    return None, []


def folder_path_to_deck(relative_folder: str, root_name: str) -> str:
    normalized = relative_folder.replace("\\", "/").strip("/")
    if not normalized:
        return root_name
    return normalized.replace("/", "::")


def build_candidate_decks(relative_folders: list[str], root_name: str) -> list[dict[str, str]]:
    seen: set[str] = set()
    items: list[dict[str, str]] = []
    for folder in relative_folders:
        deck_name = folder_path_to_deck(folder, root_name)
        if deck_name in seen:
            continue
        seen.add(deck_name)
        items.append(
            {
                "folder_path": folder or ".",
                "deck_name": deck_name,
            }
        )
    if root_name not in seen:
        items.insert(0, {"folder_path": ".", "deck_name": root_name})
    return items


def keyword_score(text: str) -> int:
    keywords = ["定义", "定理", "性质", "推论", "公式", "结论", "证明", "Lemma", "Theorem"]
    math_tokens = ["=", "≥", "≤", "∑", "∫", "lim", "sin", "cos", "log"]
    score = sum(2 for token in keywords if token in text)
    score += sum(1 for token in math_tokens if token in text)
    if len(text) <= 16:
        score += 1
    return score


def guess_region_type(text: str) -> str:
    if any(token in text for token in ("定理", "定义", "性质", "推论")):
        return "heading"
    if any(token in text for token in ("=", "≥", "≤", "∑", "∫", "→", "⇔")):
        return "formula"
    return "text"


def get_ocr_engine() -> tuple[str, Any] | None:
    global _OCR_ENGINE_CACHE
    if _OCR_ENGINE_CACHE is not False:
        return _OCR_ENGINE_CACHE or None

    try:
        from rapidocr_onnxruntime import RapidOCR

        _OCR_ENGINE_CACHE = ("RapidOCR", RapidOCR())
        return _OCR_ENGINE_CACHE
    except Exception:
        pass

    try:
        from paddleocr import PaddleOCR

        _OCR_ENGINE_CACHE = ("PaddleOCR", PaddleOCR(use_angle_cls=True, lang="ch"))
        return _OCR_ENGINE_CACHE
    except Exception:
        _OCR_ENGINE_CACHE = None
        return None


def fallback_regions(image_path: Path, width: int, height: int) -> list[DetectedRegion]:
    bbox = clamp_bbox(
        [int(width * 0.12), int(height * 0.2), int(width * 0.88), int(height * 0.5)],
        width,
        height,
    )
    return [
        DetectedRegion(
            id=uuid.uuid4().hex,
            bbox=bbox,
            text="",
            confidence=0.0,
            region_type="fallback",
        )
    ]


def detect_regions(image_path: Path) -> tuple[list[DetectedRegion], CropSuggestion]:
    with Image.open(image_path) as image:
        width, height = image.size
    ocr_bundle = get_ocr_engine()
    regions: list[DetectedRegion] = []
    crop_source = "ocr"
    if ocr_bundle is not None:
        try:
            engine_name, engine = ocr_bundle
            if engine_name == "RapidOCR":
                result, _ = engine(str(image_path))
                lines = result or []
            else:
                result = engine.ocr(str(image_path), cls=True)
                lines = result[0] if result else []

            for line in lines:
                if engine_name == "RapidOCR":
                    points, text, confidence = line
                else:
                    points, payload = line
                    text, confidence = payload
                xs = [int(point[0]) for point in points]
                ys = [int(point[1]) for point in points]
                bbox = clamp_bbox([min(xs), min(ys), max(xs), max(ys)], width, height)
                regions.append(
                    DetectedRegion(
                        id=uuid.uuid4().hex,
                        bbox=bbox,
                        text=text,
                        confidence=float(confidence),
                        region_type=guess_region_type(text),
                    )
                )
        except Exception:
            regions = []
            crop_source = "ocr_error"
    if not regions:
        regions = fallback_regions(image_path, width, height)
        if ocr_bundle is None:
            crop_source = "ocr_missing"
        elif crop_source != "ocr_error":
            crop_source = "ocr_empty"

    x1 = min(region.bbox[0] for region in regions)
    y1 = min(region.bbox[1] for region in regions)
    x2 = max(region.bbox[2] for region in regions)
    y2 = max(region.bbox[3] for region in regions)
    padding = 28
    crop = CropSuggestion(
        bbox=clamp_bbox([x1 - padding, y1 - padding, x2 + padding, y2 + padding], width, height),
        padding=padding,
        confidence=max(region.confidence for region in regions),
        source=crop_source,
    )
    return regions, crop


def normalize_llm_payload(payload: dict[str, Any]) -> dict[str, Any]:
    items = payload.get("items")
    if not isinstance(items, list):
        return payload

    normalized_items: list[dict[str, Any]] = []
    for raw_item in items:
        if not isinstance(raw_item, dict):
            continue
        item = dict(raw_item)

        crop = item.get("crop")
        if isinstance(crop, list):
            item["crop"] = {"bbox": crop}

        masks = item.get("masks")
        if isinstance(masks, list):
            normalized_masks: list[dict[str, Any]] = []
            for entry in masks:
                if isinstance(entry, list):
                    normalized_masks.append({"bbox": entry})
                elif isinstance(entry, dict):
                    region_ids = entry.get("region_ids")
                    if isinstance(region_ids, str):
                        entry["region_ids"] = [region_ids]
                    normalized_masks.append(entry)
            item["masks"] = normalized_masks

        hints = item.get("hints")
        if isinstance(hints, list):
            item["hints"] = {"items": hints}

        observed_text = item.get("observed_text")
        if isinstance(observed_text, list):
            item["observed_text"] = "\n".join(str(part) for part in observed_text if str(part).strip())

        cloze_targets = item.get("cloze_targets")
        if isinstance(cloze_targets, str):
            item["cloze_targets"] = [cloze_targets]

        warnings = item.get("warnings")
        if isinstance(warnings, str):
            item["warnings"] = [warnings] if warnings.strip() else []
        elif warnings is None:
            item["warnings"] = []

        normalized_items.append(item)

    payload["items"] = normalized_items
    return payload


def normalize_route_payload(payload: dict[str, Any]) -> dict[str, Any]:
    version = payload.get("version")
    if version is None:
        payload["version"] = "1.0"
    elif isinstance(version, (int, float)):
        payload["version"] = str(version)
    elif not isinstance(version, str):
        payload["version"] = str(version)

    items = payload.get("items")
    if not isinstance(items, list):
        return payload

    normalized_items: list[dict[str, Any]] = []
    for raw_item in items:
        if not isinstance(raw_item, dict):
            continue
        item = dict(raw_item)
        tags = item.get("tags")
        if isinstance(tags, str):
            item["tags"] = [tag.strip() for tag in tags.split(",") if tag.strip()]
        elif tags is None:
            item["tags"] = []
        elif isinstance(tags, list):
            item["tags"] = [str(tag).strip() for tag in tags if str(tag).strip()]

        used_existing = item.get("used_existing")
        if isinstance(used_existing, str):
            item["used_existing"] = used_existing.strip().lower() in {"1", "true", "yes", "y", "是"}
        elif used_existing is None:
            item["used_existing"] = False

        deck_name = item.get("deck_name")
        if deck_name is None:
            item["deck_name"] = ""
        elif not isinstance(deck_name, str):
            item["deck_name"] = str(deck_name)

        reason = item.get("reason")
        if reason is not None and not isinstance(reason, str):
            item["reason"] = str(reason)
        normalized_items.append(item)
    payload["items"] = normalized_items
    return payload


def build_routing_prompt(
    *,
    batch: list[dict[str, Any]],
    candidate_decks: list[dict[str, str]],
    semantic_max_depth: int,
) -> str:
    return (
        "你是图片归档助手。"
        "你的任务不是做遮罩，而是决定每张图片应该进入哪个 Anki deck，并给出 tags。"
        "请先结合 OCR 文本、图片内容和 existing_decks 来判断主题。"
        "folder_path 只能当弱线索，绝不能因为原文件夹名里出现了英文缩写、临时目录名或历史习惯名，就直接把它抄进 deck_name。"
        "像 dataStruct 这种文件夹名，如果没有被 OCR 内容或图片语义直接支持，就不要优先采用。"
        "优先从 existing_decks 中选择语义最接近的一项，避免因为措辞不同而重复创建几乎同义的 deck。"
        "如果现有 deck 只有过粗的大类，而图片主题已经明显细到章节、小节、题型或知识点，请积极往下细分到更具体的子 deck，不要长期停在过粗顶层。"
        "只有在 existing_decks 都不合适时，才新建一个简短清楚的 deck_name。"
        "如果新建 deck_name，请优先使用已有大类下的子层级，而不是凭空另起一套平级近义名称。"
        f"deck_name 最多允许 {semantic_max_depth} 层，用 :: 分隔。"
        "如果现有 deck 只能覆盖到学科或章节，但 OCR 已经明确暴露出更细的知识点，请优先继续细分。"
        "例如可以从 计算机::数据结构 继续细到 计算机::数据结构::链表；如果后续又明确到静态链表，就继续细到 计算机::数据结构::链表::静态链表。"
        "细分时优先沿用已有父层级，再在其下补出更具体的子层级。"
        "如果同一主题已经能放进现有 deck，就不要再造一个近义新名字。"
        "reason 里请明确说明：这次是沿用了哪个现有 deck，还是在什么语义基础上向下细分出了更具体的子 deck。"
        "tags 默认使用中文，优先返回 2 到 5 个简短、去重、语义清晰的中文标签。"
        "不要强行转成英文，也不要为了格式把中文知识点改写成小写英文。"
        "请严格输出 JSON，不要输出任何额外解释。"
        "返回格式必须为 {version, items:[{image_id, deck_name, tags, used_existing, reason}] }。"
        f"existing_decks={json.dumps(candidate_decks, ensure_ascii=False)}"
        f"待分析批次={json.dumps(summarize_batch_for_prompt(batch), ensure_ascii=False)}"
    )


def estimate_route_request_tokens(
    *,
    settings: dict[str, Any],
    batch: list[dict[str, Any]],
    candidate_decks: list[dict[str, str]],
    semantic_max_depth: int,
) -> int:
    prompt = build_routing_prompt(
        batch=batch,
        candidate_decks=candidate_decks,
        semantic_max_depth=semantic_max_depth,
    )
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for item in batch:
        if item.get("image_base64"):
            content.append({"type": "text", "text": f"image_id={item['image_id']}"})
            content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{item.get('image_media_type', 'image/png')};base64,{item['image_base64']}"
                    },
                }
            )
    payload = {
        "model": settings["model"],
        "temperature": 0.1,
        "max_tokens": min(settings["max_output_tokens"], max(800, 240 * len(batch))),
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "Return valid JSON only. Never include markdown fences.",
            },
            {"role": "user", "content": content},
        ],
    }
    request_text = json.dumps(payload, ensure_ascii=False)
    return max(1, len(request_text) // 4)


def suggest_masks_from_regions(
    regions: list[DetectedRegion],
    image_width: int,
    image_height: int,
) -> list[MaskRect]:
    if not regions:
        return [
            MaskRect(
                id=uuid.uuid4().hex,
                bbox=clamp_bbox(
                    [
                        int(image_width * 0.2),
                        int(image_height * 0.25),
                        int(image_width * 0.78),
                        int(image_height * 0.4),
                    ],
                    image_width,
                    image_height,
                ),
                label="关键区域",
                reason="未能稳定识别文本，使用兜底框",
                confidence=0.25,
                source="fallback",
                manual=False,
            )
        ]
    selected = sorted(
        regions,
        key=lambda region: (
            keyword_score(region.text),
            1 if region.region_type in {"heading", "formula"} else 0,
            region.confidence,
        ),
        reverse=True,
    )[:5]
    masks: list[MaskRect] = []
    for index, region in enumerate(selected, start=1):
        x1, y1, x2, y2 = region.bbox
        masks.append(
            MaskRect(
                id=uuid.uuid4().hex,
                bbox=clamp_bbox([x1 - 4, y1 - 4, x2 + 4, y2 + 4], image_width, image_height),
                label=region.text[:24] or f"候选框 {index}",
                reason="根据 OCR 文本、关键词和版式生成的候选遮罩",
                confidence=max(region.confidence, 0.35),
                source="rules",
                manual=False,
            )
        )
    return masks


def merge_generated_masks(existing: list[MaskRect], generated: list[MaskRect]) -> list[MaskRect]:
    manual = [mask for mask in existing if mask.manual]
    return manual + generated


def safe_json_load(raw: str) -> dict[str, Any]:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?", "", raw).strip()
        raw = re.sub(r"```$", "", raw).strip()
    match = re.search(r"\{.*\}", raw, re.S)
    if match:
        raw = match.group(0)
    return json.loads(raw)


def describe_exception(exc: Exception) -> str:
    primary = str(exc).strip() or repr(exc)
    parts = [f"{type(exc).__name__}: {primary}"]
    cause = exc.__cause__ or exc.__context__
    if cause is not None:
        cause_text = str(cause).strip() or repr(cause)
        parts.append(f"Caused by {type(cause).__name__}: {cause_text}")
    return "\n".join(parts)


def _compact_text(value: str) -> str:
    return re.sub(r"\s+", "", value or "")


def estimate_text_span_bbox(region_bbox: list[int], region_text: str, target_text: str) -> list[int] | None:
    compact_region = _compact_text(region_text)
    compact_target = _compact_text(target_text)
    if not compact_region or not compact_target:
        return None
    start = compact_region.find(compact_target)
    if start < 0:
        return None
    end = start + len(compact_target)
    x1, y1, x2, y2 = region_bbox
    width = max(1, x2 - x1)
    start_ratio = start / len(compact_region)
    end_ratio = end / len(compact_region)
    span_x1 = x1 + int(width * start_ratio)
    span_x2 = x1 + int(width * end_ratio)
    padding = max(6, min(18, width // max(8, len(compact_region))))
    return [
        max(x1, span_x1 - padding),
        y1,
        min(x2, max(span_x1 + 12, span_x2 + padding)),
        y2,
    ]


def build_llm_prompt(settings: dict[str, Any], batch: list[dict[str, Any]]) -> str:
    prompt_preset = settings.get("prompt_preset", "anki_focus")
    preset_text = PROMPT_PRESETS.get(prompt_preset, PROMPT_PRESETS["anki_focus"])
    custom_prompt = (settings.get("custom_prompt") or "").strip()
    custom_segment = f"额外要求: {custom_prompt}" if custom_prompt else ""
    density = settings.get("mask_density", "medium")
    density_text = {
        "few": "遮罩密度倾向于少，只挑最关键的重点内容。",
        "medium": "遮罩密度保持中等，覆盖主要重点内容。",
        "many": "遮罩密度偏多，把大部分重要知识点都标出来，不要被 5 个或 6 个之类的数量习惯限制住。",
        "complete": "完全模式下不要设置数量上限。只要内容值得记忆测试，就应继续返回遮罩；如果一张图有 10 个、12 个或更多重点，也应全部列出，不要因为数量顾虑而漏掉关键点。",
    }.get(density, "遮罩密度保持中等，覆盖主要重点内容。")
    prompt_batch = summarize_batch_for_prompt(batch)
    return (
        "你是用于 Anki 图像挖空的视觉分析器。"
        "请严格输出 JSON，不要输出任何额外解释。"
        "你的首要任务是帮助用户决定哪些内容应该被挖空。"
        "你不负责决定裁切区域，不要返回 crop，也不要尝试修改现有裁切框。"
        "如果已经提供了 OCR 区域，请优先引用 OCR 区域本身，不要重新猜测像素坐标。"
        "此时每个 mask 优先返回 region_ids，写出需要覆盖的 OCR 区域 id 列表；只有在完全没有 OCR 区域可用时，才退回返回 bbox。"
        "如果某个 OCR 区域本身是一整行，但你真正只想遮挡其中一个词、短语或公式片段，不要直接把整行 region_id 当成最终遮罩；请改用更小的 bbox，或只把遮罩收缩到目标词语附近。"
        "目标是从每个图片中选择适合记忆测试的关键遮挡区域。"
        "不要遮挡整段无差别长文本，不要发明不存在的内容。"
        "优先返回较小而准确的遮罩，而不是一个大框。"
        "除非用户明确选择较少密度，否则不要自行假定只能返回 5 个或 6 个遮罩。"
        f"{density_text}"
        "每个 item 还必须返回 observed_text，写出你实际读到的文字内容，可以按行整理。"
        "每个 item 还必须返回 cloze_targets，写出你决定挖空的具体词、短语或公式片段。"
        f"{preset_text}"
        f"{custom_segment}"
        "返回格式必须为 {version, items:[{image_id, summary, observed_text, cloze_targets, masks, hints, warnings}] }。"
        "其中 masks 的每一项优先写成 {region_ids:[...], label, reason, confidence, source}；没有 OCR 区域时才写 {bbox:[x1,y1,x2,y2], ...}。"
        "所有 bbox 都使用原图坐标系 [x1, y1, x2, y2]。"
        f"待分析批次: {json.dumps(prompt_batch, ensure_ascii=False)}"
    )


def build_prompt_preview(prompt_preset: str, custom_prompt: str = "") -> str:
    prompt_settings = {
        "prompt_preset": prompt_preset,
        "custom_prompt": custom_prompt,
    }
    sample_batch = [
        {
            "image_id": "sample-image",
            "folder_path": "Calculus/Definition",
            "analysis_mode": "hybrid",
            "ocr_regions": [
                {
                    "bbox": [120, 220, 520, 280],
                    "text": "Definition 3.1",
                    "confidence": 0.96,
                }
            ],
        }
    ]
    return build_llm_prompt(prompt_settings, sample_batch)


def summarize_batch_for_prompt(batch: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summarized: list[dict[str, Any]] = []
    for item in batch:
        summary = {
            key: value
            for key, value in item.items()
            if key != "image_base64"
        }
        if item.get("image_base64"):
            summary["image_payload"] = {
                "media_type": item.get("image_media_type", "image/png"),
                "byte_size": item.get("image_byte_size"),
                "delivery": item.get("image_payload_source", "inline_data_url"),
            }
        summarized.append(summary)
    return summarized


def estimate_llm_request_tokens(*, settings: dict[str, Any], batch: list[dict[str, Any]]) -> int:
    content: list[dict[str, Any]] = [{"type": "text", "text": build_llm_prompt(settings, batch)}]
    for item in batch:
        if item.get("image_base64"):
            content.append({"type": "text", "text": f"image_id={item['image_id']}"})
            content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{item.get('image_media_type', 'image/png')};base64,{item['image_base64']}"
                    },
                }
            )
    payload = {
        "model": settings["model"],
        "temperature": settings["temperature"],
        "max_tokens": settings["max_output_tokens"],
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "Return valid JSON only. Never include markdown fences.",
            },
            {"role": "user", "content": content},
        ],
    }
    request_text = json.dumps(payload, ensure_ascii=False)
    return max(1, len(request_text) // 4)



def get_prompt_presets() -> list[PromptPresetRecord]:
    items = [
        PromptPresetRecord(
            id=preset_id,
            label=PROMPT_PRESET_LABELS[preset_id],
            prompt_preview=build_prompt_preview(preset_id),
        )
        for preset_id in ("anki_focus", "concept_map", "formula_focus")
    ]
    items.append(
        PromptPresetRecord(
            id="custom",
            label=PROMPT_PRESET_LABELS["custom"],
            prompt_preview=build_prompt_preview("custom", "这里会拼接你在界面里填写的自定义要求。"),
        )
    )
    return items


async def request_llm_suggestions(
    *,
    settings: dict[str, Any],
    batch: list[dict[str, Any]],
) -> tuple[LLMBatchSuggestion, str, str]:
    content: list[dict[str, Any]] = [{"type": "text", "text": build_llm_prompt(settings, batch)}]
    for item in batch:
        if item.get("image_base64"):
            content.append({"type": "text", "text": f"image_id={item['image_id']}"})
            content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{item.get('image_media_type', 'image/png')};base64,{item['image_base64']}"
                    },
                }
            )
    payload = {
        "model": settings["model"],
        "temperature": settings["temperature"],
        "max_tokens": settings["max_output_tokens"],
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "Return valid JSON only. Never include markdown fences.",
            },
            {"role": "user", "content": content},
        ],
    }
    headers = {
        "Authorization": f"Bearer {settings['api_key']}",
        "Content-Type": "application/json",
    }
    debug_payload = json.loads(json.dumps(payload))
    sanitized_prompt = build_llm_prompt(settings, summarize_batch_for_prompt(batch))
    for message in debug_payload.get("messages", []):
        if message.get("role") == "user":
            content = message.get("content")
            if isinstance(content, list) and content and content[0].get("type") == "text":
                content[0]["text"] = sanitized_prompt
        content = message.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if part.get("type") == "image_url":
                image_url = part.get("image_url", {}).get("url", "")
                if isinstance(image_url, str) and image_url.startswith("data:"):
                    prefix = image_url.split(";base64,", 1)[0]
                    part["image_url"]["url"] = f"{prefix};base64,<omitted>"
    request_log = json.dumps(
        {
            "endpoint": f"{settings['base_url'].rstrip('/')}/chat/completions",
            "timeout_ms": settings["timeout_ms"],
            "payload": debug_payload,
        },
        ensure_ascii=False,
        indent=2,
    )

    try:
        async with httpx.AsyncClient(timeout=settings["timeout_ms"] / 1000, trust_env=False) as client:
            response = await client.post(
                f"{settings['base_url'].rstrip('/')}/chat/completions",
                headers=headers,
                json=payload,
            )
    except Exception as exc:
        message = f"发送到模型服务失败。\n异常详情:\n{describe_exception(exc)}"
        raise LLMRequestError(message, request_log=request_log, response_log=message) from exc

    response_text = response.text
    if response.status_code >= 400:
        message = (
            f"模型服务返回 HTTP {response.status_code}。\n"
            f"原始返回:\n{response_text or '<empty>'}"
        )
        raise LLMRequestError(message, request_log=request_log, response_log=message)

    try:
        data = response.json()
    except Exception as exc:
        message = f"模型服务返回的不是合法 JSON。\n原始返回:\n{response_text or '<empty>'}"
        raise LLMRequestError(message, request_log=request_log, response_log=message) from exc

    try:
        choice = data["choices"][0]["message"]["content"]
    except Exception as exc:
        message = (
            "模型服务返回里缺少 choices/message/content。\n"
            f"原始返回:\n{json.dumps(data, ensure_ascii=False, indent=2)}"
        )
        raise LLMRequestError(message, request_log=request_log, response_log=message) from exc
    if isinstance(choice, list):
        raw = "".join(part.get("text", "") for part in choice if isinstance(part, dict))
    else:
        raw = choice
    response_log = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False, indent=2)
    try:
        parsed = normalize_llm_payload(safe_json_load(raw))
    except Exception as exc:
        message = f"模型返回的文本无法解析成 JSON。\n原始返回:\n{response_log or '<empty>'}"
        raise LLMRequestError(message, request_log=request_log, response_log=response_log) from exc

    try:
        suggestion = LLMBatchSuggestion.model_validate(parsed)
    except Exception as exc:
        message = (
            "模型返回的 JSON 结构不符合要求。\n"
            f"解析后内容:\n{json.dumps(parsed, ensure_ascii=False, indent=2)}"
        )
        raise LLMRequestError(message, request_log=request_log, response_log=message) from exc
    return suggestion, request_log, response_log


async def request_llm_routing(
    *,
    settings: dict[str, Any],
    batch: list[dict[str, Any]],
    candidate_decks: list[dict[str, str]],
    semantic_max_depth: int,
) -> tuple[RouteBatchSuggestion, str, str]:
    prompt = build_routing_prompt(
        batch=batch,
        candidate_decks=candidate_decks,
        semantic_max_depth=semantic_max_depth,
    )
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for item in batch:
        if item.get("image_base64"):
            content.append({"type": "text", "text": f"image_id={item['image_id']}"})
            content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{item.get('image_media_type', 'image/png')};base64,{item['image_base64']}"
                    },
                }
            )
    payload = {
        "model": settings["model"],
        "temperature": 0.1,
        "max_tokens": min(settings["max_output_tokens"], max(800, 240 * len(batch))),
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "Return valid JSON only. Never include markdown fences.",
            },
            {"role": "user", "content": content},
        ],
    }
    headers = {
        "Authorization": f"Bearer {settings['api_key']}",
        "Content-Type": "application/json",
    }
    debug_payload = json.loads(json.dumps(payload))
    sanitized_batch = summarize_batch_for_prompt(batch)
    for message in debug_payload.get("messages", []):
        content = message.get("content")
        if not isinstance(content, list):
            continue
        if message.get("role") == "user" and content and content[0].get("type") == "text":
            content[0]["text"] = build_routing_prompt(
                batch=sanitized_batch,
                candidate_decks=candidate_decks,
                semantic_max_depth=semantic_max_depth,
            )
        for part in content:
            if part.get("type") == "image_url":
                image_url = part.get("image_url", {}).get("url", "")
                if isinstance(image_url, str) and image_url.startswith("data:"):
                    prefix = image_url.split(";base64,", 1)[0]
                    part["image_url"]["url"] = f"{prefix};base64,<omitted>"
    request_log = json.dumps(
        {
            "endpoint": f"{settings['base_url'].rstrip('/')}/chat/completions",
            "timeout_ms": settings["timeout_ms"],
            "payload": debug_payload,
        },
        ensure_ascii=False,
        indent=2,
    )
    try:
        async with httpx.AsyncClient(timeout=settings["timeout_ms"] / 1000, trust_env=False) as client:
            response = await client.post(
                f"{settings['base_url'].rstrip('/')}/chat/completions",
                headers=headers,
                json=payload,
            )
    except Exception as exc:
        message = f"发送到模型服务失败。\n异常详情:\n{describe_exception(exc)}"
        raise LLMRequestError(message, request_log=request_log, response_log=message) from exc

    response_text = response.text
    if response.status_code >= 400:
        message = (
            f"模型服务返回 HTTP {response.status_code}。\n"
            f"原始返回:\n{response_text or '<empty>'}"
        )
        raise LLMRequestError(message, request_log=request_log, response_log=message)

    try:
        data = response.json()
    except Exception as exc:
        message = f"模型服务返回的不是合法 JSON。\n原始返回:\n{response_text or '<empty>'}"
        raise LLMRequestError(message, request_log=request_log, response_log=message) from exc
    choice = data["choices"][0]["message"]["content"]
    if isinstance(choice, list):
        raw = "".join(part.get("text", "") for part in choice if isinstance(part, dict))
    else:
        raw = choice
    response_log = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False, indent=2)
    try:
        parsed = normalize_route_payload(safe_json_load(raw))
    except Exception as exc:
        message = f"模型返回的文本无法解析成 JSON。\n原始返回:\n{response_log or '<empty>'}"
        raise LLMRequestError(message, request_log=request_log, response_log=response_log) from exc

    try:
        suggestion = RouteBatchSuggestion.model_validate(parsed)
    except Exception as exc:
        message = (
            "模型返回的归档 JSON 结构不符合要求。\n"
            f"解析后内容:\n{json.dumps(parsed, ensure_ascii=False, indent=2)}"
        )
        raise LLMRequestError(message, request_log=request_log, response_log=message) from exc

    return suggestion, request_log, response_log


async def fetch_available_models(base_url: str, api_key: str | None) -> list[LLMModelRecord]:
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
        response = await client.get(
            f"{base_url.rstrip('/')}/models",
            headers=headers,
        )
        response.raise_for_status()
        payload = response.json()
    items = payload.get("data", []) if isinstance(payload, dict) else []
    models: list[LLMModelRecord] = []
    for item in items:
        if not isinstance(item, dict) or not item.get("id"):
            continue
        model_id = str(item["id"])
        models.append(
            LLMModelRecord(
                id=model_id,
                owned_by=item.get("owned_by"),
                label=model_id,
            )
        )
    return sorted(models, key=lambda model: model.id.lower())


async def test_model_connection(
    *,
    base_url: str,
    api_key: str | None,
    model: str | None,
) -> tuple[bool, int, bool, str]:
    models = await fetch_available_models(base_url, api_key)
    model_count = len(models)
    normalized_model = (model or "").strip()
    if not normalized_model:
        return True, model_count, False, f"Connection OK. Found {model_count} models."

    found = any(item.id == normalized_model for item in models)
    if found:
        return True, model_count, True, f"Connection OK. Model '{normalized_model}' is available."
    return True, model_count, False, f"Connection OK, but model '{normalized_model}' was not returned by the server."


def list_directory(path: str | None = None, include_files: bool = False) -> tuple[Path, list[dict[str, str]]]:
    requested = Path(path).expanduser() if path else Path.home()
    current = requested if requested.exists() else requested.parent
    current = current.resolve()
    items: list[dict[str, str]] = []
    for child in sorted(current.iterdir(), key=lambda item: (item.is_file(), item.name.lower())):
        if child.name.startswith("."):
            continue
        if child.is_dir():
            items.append({"name": child.name, "path": str(child), "kind": "directory"})
        elif include_files:
            items.append({"name": child.name, "path": str(child), "kind": "file"})
    return current, items


def encode_image_bytes(path: Path, *, output_format: str = "png", quality: int = 68) -> tuple[str, bytes]:
    buffer = io.BytesIO()
    with Image.open(path) as image:
        rgb_image = image.convert("RGB")
        if output_format == "webp":
            rgb_image.save(buffer, format="WEBP", quality=quality, method=6)
            mime = "image/webp"
        else:
            rgb_image.save(buffer, format="PNG")
            mime = "image/png"
    return mime, buffer.getvalue()


def encode_image_base64(path: Path, *, output_format: str = "png", quality: int = 68) -> tuple[str, str, int]:
    mime, image_bytes = encode_image_bytes(path, output_format=output_format, quality=quality)
    return mime, base64.b64encode(image_bytes).decode("ascii"), len(image_bytes)


def render_draft_assets(
    source_path: Path,
    crop: CropSuggestion | None,
    masks: list[MaskRect],
    draft_id: str,
) -> tuple[Path, Path, str]:
    with Image.open(source_path) as source_image:
        image = source_image.convert("RGBA")
        width, height = image.size
        crop_bbox = crop.bbox if crop else [0, 0, width, height]
        crop_bbox = clamp_bbox(crop_bbox, width, height)
        cropped = image.crop(tuple(crop_bbox))
        front = cropped.copy()
        draw = ImageDraw.Draw(front, "RGBA")
        for mask in masks:
            x1, y1, x2, y2 = mask.bbox
            relative = [
                x1 - crop_bbox[0],
                y1 - crop_bbox[1],
                x2 - crop_bbox[0],
                y2 - crop_bbox[1],
            ]
            draw.rectangle(relative, fill=(255, 255, 255, 228), outline=(148, 163, 184, 255), width=2)

        fingerprint = hashlib.sha256(
            json.dumps(
                {
                    "source": str(source_path),
                    "crop": crop_bbox,
                    "masks": [mask.model_dump() for mask in masks],
                },
                ensure_ascii=False,
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest()
        front_path = RENDER_DIR / f"{draft_id}_front.png"
        back_path = RENDER_DIR / f"{draft_id}_back.png"
        front.save(front_path)
        cropped.save(back_path)
    return front_path, back_path, fingerprint


async def import_to_anki(
    *,
    base_url: str,
    deck_name: str,
    front_path: Path,
    back_path: Path,
    draft_id: str,
    tags: list[str],
) -> int:
    async def invoke(action: str, params: dict[str, Any]) -> Any:
        payload = {"action": action, "version": 6, "params": params}
        async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
            response = await client.post(base_url, json=payload)
            response.raise_for_status()
            body = response.json()
        if body.get("error"):
            raise RuntimeError(body["error"])
        return body.get("result")

    decks = await invoke("deckNames", {})
    if deck_name not in decks:
        await invoke("createDeck", {"deck": deck_name})

    front_name = f"{draft_id}_front.png"
    back_name = f"{draft_id}_back.png"
    await invoke(
        "storeMediaFile",
        {
            "filename": front_name,
            "data": base64.b64encode(front_path.read_bytes()).decode("ascii"),
        },
    )
    await invoke(
        "storeMediaFile",
        {
            "filename": back_name,
            "data": base64.b64encode(back_path.read_bytes()).decode("ascii"),
        },
    )
    note = {
        "deckName": deck_name,
        "modelName": "Basic",
        "fields": {
            "Front": f'<img src="{front_name}" alt="front" />',
            "Back": f'<img src="{back_name}" alt="back" />',
        },
        "tags": tags,
        "options": {"allowDuplicate": False},
    }
    note_id = await invoke("addNote", {"note": note})
    return int(note_id)


IOE_BASE_TEMPLATE_NAME = "Image Occlusion Enhanced"
IOE_COPY_TEMPLATE_NAME = "Image Occlusion Enhanced (Codex)"
IOE_FIELDS = [
    "ID",
    "Header",
    "Image",
    "Question Mask",
    "Footer",
    "Remarks",
    "Sources",
    "Extra 1",
    "Extra 2",
    "Answer Mask",
    "Original Mask",
]
IOE_FRONT_TEMPLATE = """<div class="card-container">
  {{#Header}}<div id="io-header">{{Header}}</div>{{/Header}}
  
  <div id="io-wrapper">
    <div id="io-overlay">{{Question Mask}}</div>
    <div id="io-original">{{Image}}</div>
  </div>

  {{#Footer}}<div id="io-footer">{{Footer}}</div>{{/Footer}}
</div>"""
IOE_BACK_TEMPLATE = """<div class="card-container">
  {{#Header}}<div id="io-header">{{Header}}</div>{{/Header}}

  <div id="io-wrapper">
    <div id="io-overlay">{{Answer Mask}}</div>
    <div id="io-original">{{Image}}</div>
  </div>

  {{#Footer}}<div id="io-footer">{{Footer}}</div>{{/Footer}}

  <div class="control-panel">
    <button id="io-revl-btn" onclick="toggle();">显/隐 遮罩</button>
  </div>

  <div id="io-extra-wrapper">
    {{#Remarks}}
      <div class="io-extra-entry">
        <span class="io-tag tag-remarks">备注</span>
        <div class="extra-content">{{Remarks}}</div>
      </div>
    {{/Remarks}}
    
    {{#Sources}}
      <div class="io-extra-entry">
        <span class="io-tag tag-sources">来源</span>
        <div class="extra-content">{{Sources}}</div>
      </div>
    {{/Sources}}

    {{#Extra 1}}
      <div class="io-extra-entry">
        <span class="io-tag tag-extra">补充 1</span>
        <div class="extra-content">{{Extra 1}}</div>
      </div>
    {{/Extra 1}}
  </div>
</div>

<script>
  var toggle = function() {
    var amask = document.getElementById('io-overlay');
    amask.style.display = (amask.style.display === 'none') ? 'block' : 'none';
  }
</script>"""
IOE_CSS = """/* 全局容器优化 */
.card {
  font-family: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
  background-color: #f8f9fa;
  margin: 0;
  padding: 10px;
  color: #2d3436;
}

#io-wrapper {
  position: relative;
  display: inline-block;
  margin: 10px auto;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  background: white;
}

#io-overlay { position: absolute; top: 0; width: 100%; z-index: 3; }
#io-original { position: relative; top: 0; width: 100%; z-index: 2; display: block; }

#io-header {
  font-weight: bold;
  font-size: 1.2em;
  color: #0984e3;
  margin-bottom: 10px;
}

#io-footer {
  font-size: 0.85em;
  color: #636e72;
  margin-top: 8px;
  font-style: italic;
}

.control-panel {
  margin: 15px 0;
}

#io-revl-btn {
  background-color: #0984e3;
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 5px rgba(9, 132, 227, 0.3);
}

#io-revl-btn:active {
  transform: scale(0.95);
  background-color: #74b9ff;
}

#io-extra-wrapper {
  max-width: 90%;
  margin: 20px auto;
  text-align: left;
}

.io-extra-entry {
  background: white;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  border-left: 4px solid #0984e3;
}

.io-tag {
  display: inline-block;
  font-size: 0.75em;
  font-weight: bold;
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: 5px;
  background: #e1f5fe;
  color: #0288d1;
}

.mobile .card { font-size: 100%; padding: 5px; }
.mobile #io-wrapper { width: 100%; border-radius: 0; }
.mobile #io-revl-btn { width: 80%; padding: 12px; font-size: 16px; }"""


def _svg_overlay(
    width: int,
    height: int,
    masks: list[MaskRect],
    *,
    fill_alpha: float = 0.96,
    highlight_mask_id: str | None = None,
    highlight_group_id: str | None = None,
    exclude_group_id: str | None = None,
) -> str:
    rects = []
    fill = f"rgba(255,255,255,{fill_alpha})"
    for mask in masks:
        x1, y1, x2, y2 = mask.bbox
        group_id = mask.card_group_id or mask.id
        if exclude_group_id is not None and group_id == exclude_group_id:
            continue
        is_highlight = mask.id == highlight_mask_id or (highlight_group_id is not None and group_id == highlight_group_id)
        stroke = "rgba(14,165,233,0.98)" if is_highlight else "rgba(148,163,184,0.98)"
        highlighted_fill = "rgba(224,242,254,0.98)" if is_highlight else fill
        rects.append(
            f'<rect x="{x1}" y="{y1}" width="{max(1, x2 - x1)}" height="{max(1, y2 - y1)}" '
            f'rx="10" ry="10" fill="{highlighted_fill}" stroke="{stroke}" stroke-width="3" />'
        )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:auto">'
        + "".join(rects)
        + "</svg>"
    )


def _normalized_mask_groups(masks: list[MaskRect]) -> list[tuple[str, int, list[MaskRect]]]:
    grouped: dict[str, list[MaskRect]] = {}
    order_candidates: dict[str, int] = {}
    first_seen: list[str] = []
    for index, mask in enumerate(masks, start=1):
        group_id = mask.card_group_id or mask.id
        if group_id not in grouped:
            grouped[group_id] = []
            first_seen.append(group_id)
        grouped[group_id].append(mask)
        candidate = mask.card_order if mask.card_order is not None else index
        current = order_candidates.get(group_id)
        order_candidates[group_id] = candidate if current is None else min(current, candidate)

    sorted_group_ids = sorted(first_seen, key=lambda group_id: (order_candidates[group_id], first_seen.index(group_id)))
    normalized: list[tuple[str, int, list[MaskRect]]] = []
    for order, group_id in enumerate(sorted_group_ids, start=1):
        masks_in_group = grouped[group_id]
        for mask in masks_in_group:
            mask.card_group_id = group_id
            mask.card_order = order
        normalized.append((group_id, order, masks_in_group))
    return normalized


def _safe_media_name(seed: str, suffix: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", seed).strip("._") or "image"
    return f"{cleaned}.{suffix}"


def build_manual_mask_notes(
    *,
    draft_id: str,
    deck_name: str,
    tags: list[str],
    image_name: str,
    image_html: str,
    image_width: int,
    image_height: int,
    masks: list[MaskRect],
    source_path: str,
) -> list[dict[str, Any]]:
    groups = _normalized_mask_groups(masks)
    all_masks_svg = _svg_overlay(image_width, image_height, masks, fill_alpha=0.98)
    notes: list[dict[str, Any]] = []
    for group_id, order, grouped_masks in groups:
        question_svg = _svg_overlay(
            image_width,
            image_height,
            masks,
            fill_alpha=0.98,
            highlight_group_id=group_id,
        )
        answer_svg = _svg_overlay(
            image_width,
            image_height,
            masks,
            fill_alpha=0.98,
            exclude_group_id=group_id,
        )
        label_summary = " / ".join(filter(None, [mask.label.strip() for mask in grouped_masks if mask.label])) or f"卡片 {order}"
        reason_summary = "\n".join(filter(None, [mask.reason.strip() for mask in grouped_masks if mask.reason])) if grouped_masks else ""
        fields = {
            "ID": f"{draft_id}-{order}",
            "Header": f"{image_name} · 卡片 {order}",
            "Image": image_html,
            "Question Mask": question_svg,
            "Footer": deck_name,
            "Remarks": reason_summary,
            "Sources": source_path,
            "Extra 1": label_summary,
            "Extra 2": "",
            "Answer Mask": answer_svg,
            "Original Mask": all_masks_svg,
        }
        notes.append(
            {
                "deckName": deck_name,
                "fields": fields,
                "tags": tags,
                "options": {"allowDuplicate": False},
            }
        )
    return notes


async def _invoke_ankiconnect(base_url: str, action: str, params: dict[str, Any]) -> Any:
    payload = {"action": action, "version": 6, "params": params}
    async with httpx.AsyncClient(timeout=20, trust_env=False) as client:
        response = await client.post(base_url, json=payload)
        response.raise_for_status()
        body = response.json()
    if body.get("error"):
        raise RuntimeError(body["error"])
    return body.get("result")


async def ensure_manual_anki_template(base_url: str) -> AnkiTemplateStatusResponse:
    models = await _invoke_ankiconnect(base_url, "modelNames", {})
    exact_exists = IOE_BASE_TEMPLATE_NAME in models
    active_template_name = IOE_BASE_TEMPLATE_NAME if not exact_exists else IOE_COPY_TEMPLATE_NAME

    if active_template_name not in models:
        await _invoke_ankiconnect(
            base_url,
            "createModel",
            {
                "modelName": active_template_name,
                "inOrderFields": IOE_FIELDS,
                "css": IOE_CSS,
                "cardTemplates": [
                    {
                        "Name": "Card 1",
                        "Front": IOE_FRONT_TEMPLATE,
                        "Back": IOE_BACK_TEMPLATE,
                    }
                ],
            },
        )

    return AnkiTemplateStatusResponse(
        base_template_name=IOE_BASE_TEMPLATE_NAME,
        active_template_name=active_template_name,
        exact_exists=exact_exists,
        using_copy=active_template_name != IOE_BASE_TEMPLATE_NAME,
    )


async def list_anki_decks(base_url: str) -> list[str]:
    decks = await _invoke_ankiconnect(base_url, "deckNames", {})
    if not isinstance(decks, list):
      return []
    return sorted(str(deck).strip() for deck in decks if str(deck).strip())


async def import_manual_masks_to_anki(
    *,
    base_url: str,
    deck_name: str,
    source_path: Path,
    draft_id: str,
    tags: list[str],
    masks: list[MaskRect],
    webp_quality: int,
) -> ManualImportResult:
    if not masks:
        return ManualImportResult(draft_id=draft_id, ok=False, error="当前没有可导入的遮罩。")

    template_status = await ensure_manual_anki_template(base_url)
    await _invoke_ankiconnect(base_url, "createDeck", {"deck": deck_name})

    media_type, image_bytes = encode_image_bytes(source_path, output_format="webp", quality=webp_quality)
    file_name = _safe_media_name(f"{source_path.stem}_{draft_id}", "webp")
    await _invoke_ankiconnect(
        base_url,
        "storeMediaFile",
        {
            "filename": file_name,
            "data": base64.b64encode(image_bytes).decode("ascii"),
        },
    )

    with Image.open(source_path) as image:
        width, height = image.size

    image_html = f'<img src="{html.escape(file_name)}" alt="{html.escape(source_path.name)}" />'
    notes = build_manual_mask_notes(
        draft_id=draft_id,
        deck_name=deck_name,
        tags=tags,
        image_name=source_path.name,
        image_html=image_html,
        image_width=width,
        image_height=height,
        masks=masks,
        source_path=str(source_path),
    )
    for note in notes:
        note["modelName"] = template_status.active_template_name

    note_ids = await _invoke_ankiconnect(base_url, "addNotes", {"notes": notes})
    normalized_ids = [int(note_id) for note_id in note_ids if isinstance(note_id, int) and note_id > 0]
    return ManualImportResult(
        draft_id=draft_id,
        ok=len(normalized_ids) == len(notes),
        note_ids=normalized_ids,
        created_count=len(normalized_ids),
        template_name=template_status.active_template_name,
        error=None if len(normalized_ids) == len(notes) else "部分遮罩卡片未成功写入 Anki。",
    )


def current_items() -> list[Any]:
    return [build_draft_item(row) for row in list_draft_rows()]


def build_import_error(draft_id: str, error: str) -> ImportResult:
    return ImportResult(draft_id=draft_id, ok=False, error=error)


def _run_picker_command(command: list[str]) -> str | None:
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    return result.stdout.strip() or None


def _pick_folder_windows_modern(initial_path: Path | None = None) -> str | None:
    # Try the newer Explorer-style picker first. This dialog supports pasting paths
    # and feels much closer to the native file browser on recent Windows versions.
    command = [
        "powershell.exe",
        "-NoProfile",
        "-Command",
        (
            "Add-Type -AssemblyName System.Windows.Forms; "
            "$dialog = New-Object System.Windows.Forms.OpenFileDialog; "
            "$dialog.Title = 'Choose the folder to scan'; "
            "$dialog.Filter = 'Folders|*.folder'; "
            "$dialog.ValidateNames = $false; "
            "$dialog.CheckFileExists = $false; "
            "$dialog.CheckPathExists = $true; "
            "$dialog.FileName = 'Open this folder'; "
            "if ($args[0] -and (Test-Path $args[0])) { "
            "  if ((Get-Item $args[0]).PSIsContainer) { "
            "    $dialog.InitialDirectory = $args[0] "
            "  } else { "
            "    $dialog.InitialDirectory = Split-Path $args[0] "
            "  } "
            "}; "
            "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { "
            "  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
            "  $picked = if (Test-Path $dialog.FileName -PathType Container) { "
            "    $dialog.FileName "
            "  } else { "
            "    Split-Path $dialog.FileName "
            "  }; "
            "  Write-Output $picked "
            "}"
        ),
    ]
    if initial_path and initial_path.exists():
        command.append(str(initial_path))
    return _run_picker_command(command)


def _pick_folder_windows_legacy(initial_path: Path | None = None) -> str | None:
    command = [
        "powershell.exe",
        "-NoProfile",
        "-Command",
        (
            "Add-Type -AssemblyName System.Windows.Forms; "
            "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog; "
            "$dialog.Description = 'Choose the folder to scan'; "
            "$dialog.UseDescriptionForTitle = $true; "
            "if ($args[0] -and (Test-Path $args[0])) { $dialog.SelectedPath = $args[0] }; "
            "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { "
            "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
            "Write-Output $dialog.SelectedPath }"
        ),
    ]
    if initial_path and initial_path.exists():
        command.append(str(initial_path))
    return _run_picker_command(command)


def pick_folder(initial_path: str | None = None) -> str | None:
    normalized = Path(initial_path).expanduser() if initial_path else None

    if os.name == "nt":
        modern = _pick_folder_windows_modern(normalized)
        if modern:
            return modern
        return _pick_folder_windows_legacy(normalized)

    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception:
        return None

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    try:
        selected = filedialog.askdirectory(
            initialdir=str(normalized) if normalized and normalized.exists() else None,
            mustexist=True,
            title="Choose the folder to scan",
        )
    finally:
        root.destroy()
    return selected or None


def reveal_path(path: Path) -> None:
    resolved = path.expanduser().resolve()

    if os.name == "nt":
        target = (
            f"/select,{resolved}"
            if resolved.is_file()
            else str(resolved)
        )
        subprocess.Popen(["explorer.exe", target])
        return

    if sys.platform == "darwin":
        command = ["open", "-R", str(resolved)] if resolved.is_file() else ["open", str(resolved)]
        subprocess.Popen(command)
        return

    target = resolved.parent if resolved.is_file() else resolved
    subprocess.Popen(["xdg-open", str(target)])
