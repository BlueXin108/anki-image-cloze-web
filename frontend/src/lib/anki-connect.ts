import { groupMasksByCard, maskGroupId } from '@/lib/manual-preview'
import type {
  AnkiConnectionCheck,
  AnkiTemplateStatus,
  DraftListItem,
  ManualImportResponse,
  ManualImportResult,
  MaskRect,
} from '@/types'

const ANKI_CONNECT_URL = 'http://127.0.0.1:8765'
const IOE_BASE_TEMPLATE_NAME = 'Image Occlusion Enhanced'
const IOE_COPY_TEMPLATE_NAME = 'Image Occlusion Enhanced (Codex)'
const IOE_FIELDS = [
  'ID',
  'Header',
  'Image',
  'Question Mask',
  'Footer',
  'Remarks',
  'Sources',
  'Extra 1',
  'Extra 2',
  'Answer Mask',
  'Original Mask',
]

const IOE_FRONT_TEMPLATE = `<div class="card-container">
  {{#Header}}<div id="io-header">{{Header}}</div>{{/Header}}
  <div id="io-wrapper">
    <div id="io-overlay">{{Question Mask}}</div>
    <div id="io-original">{{Image}}</div>
  </div>
  {{#Footer}}<div id="io-footer">{{Footer}}</div>{{/Footer}}
</div>`

const IOE_BACK_TEMPLATE = `<div class="card-container">
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
</script>`

const IOE_CSS = `/* 全局容器优化 */
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
  color: #9a6700;
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
  background-color: #2d3436;
  color: #fffdf8;
  border: none;
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 5px rgba(45, 52, 54, 0.2);
}

#io-revl-btn:active {
  transform: scale(0.95);
  background-color: #5f6368;
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
  border-left: 4px solid #d4a017;
}

.io-tag {
  display: inline-block;
  font-size: 0.75em;
  font-weight: bold;
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: 5px;
  background: #f6edd0;
  color: #6f4f00;
}

.mobile .card { font-size: 100%; padding: 5px; }
.mobile #io-wrapper { width: 100%; border-radius: 0; }
.mobile #io-revl-btn { width: 80%; padding: 12px; font-size: 16px; }`

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function invokeAnki<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(ANKI_CONNECT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        version: 6,
        params,
      }),
    })
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : '浏览器没能连到本机 AnkiConnect。'
    throw new Error(
      `网页暂时连不上本机 Anki。请确认：1. 你正在用桌面浏览器；2. Anki 已打开；3. 已安装并启用 AnkiConnect；4. 已允许来自当前网页的访问。原始信息：${message}`,
    )
  }

  if (!response.ok) {
    throw new Error(`AnkiConnect 返回了 HTTP ${response.status}。请确认本机插件状态正常。`)
  }

  const payload = (await response.json()) as { result: T; error: string | null }
  if (payload.error) {
    throw new Error(payload.error)
  }
  return payload.result
}

function svgOverlay(
  width: number,
  height: number,
  masks: MaskRect[],
  options?: {
    highlightGroupId?: string | null
    excludeGroupId?: string | null
  },
) {
  const rects = masks
    .filter((mask) => !options?.excludeGroupId || maskGroupId(mask) !== options.excludeGroupId)
    .map((mask) => {
      const groupId = maskGroupId(mask)
      const highlighted = options?.highlightGroupId && groupId === options.highlightGroupId
      const [x1, y1, x2, y2] = mask.bbox
      return `<rect x="${x1}" y="${y1}" width="${Math.max(1, x2 - x1)}" height="${Math.max(1, y2 - y1)}" rx="10" ry="10" fill="${
        highlighted ? 'rgba(250,236,180,0.98)' : 'rgba(255,255,255,0.96)'
      }" stroke="${highlighted ? 'rgba(217,119,6,0.98)' : 'rgba(148,163,184,0.98)'}" stroke-width="3" />`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:auto">${rects}</svg>`
}

async function blobToWebpBase64(blob: Blob, quality: number): Promise<{ fileName: string; base64: string }> {
  const imageUrl = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image()
      next.onload = () => resolve(next)
      next.onerror = () => reject(new Error('导出图片读取失败。'))
      next.src = imageUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器不支持导出画布。')
    context.drawImage(image, 0, 0)
    const webpBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (value) resolve(value)
          else reject(new Error('导出 WebP 失败。'))
        },
        'image/webp',
        Math.max(0.1, Math.min(1, quality / 100)),
      )
    })
    const bytes = new Uint8Array(await webpBlob.arrayBuffer())
    let binary = ''
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte)
    })
    return {
      fileName: `${crypto.randomUUID()}.webp`,
      base64: window.btoa(binary),
    }
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

export async function checkAnkiConnection(): Promise<AnkiConnectionCheck> {
  try {
    await invokeAnki<number>('version')
    return {
      ok: true,
      message: '网页已经可以连到你本机的 AnkiConnect。',
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : '网页暂时无法连接到本机 Anki。',
    }
  }
}

export async function listAnkiDecks(): Promise<string[]> {
  const decks = await invokeAnki<string[]>('deckNames')
  return [...decks].filter(Boolean).sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

export async function createAnkiDeck(deckName: string): Promise<void> {
  const normalized = deckName.trim()
  if (!normalized) {
    throw new Error('请先填写要创建的牌组名称。')
  }
  await invokeAnki('createDeck', { deck: normalized })
}

export async function ensureManualTemplate(): Promise<AnkiTemplateStatus> {
  const models = await invokeAnki<string[]>('modelNames')
  const exactExists = models.includes(IOE_BASE_TEMPLATE_NAME)
  const activeTemplateName = exactExists ? IOE_COPY_TEMPLATE_NAME : IOE_BASE_TEMPLATE_NAME
  if (!models.includes(activeTemplateName)) {
    await invokeAnki('createModel', {
      modelName: activeTemplateName,
      inOrderFields: IOE_FIELDS,
      css: IOE_CSS,
      cardTemplates: [
        {
          Name: 'Card 1',
          Front: IOE_FRONT_TEMPLATE,
          Back: IOE_BACK_TEMPLATE,
        },
      ],
    })
  }
  return {
    base_template_name: IOE_BASE_TEMPLATE_NAME,
    active_template_name: activeTemplateName,
    exact_exists: exactExists,
    using_copy: activeTemplateName !== IOE_BASE_TEMPLATE_NAME,
  }
}

function buildManualNotes(options: {
  draftId: string
  deckName: string
  tags: string[]
  imageName: string
  imageHtml: string
  imageWidth: number
  imageHeight: number
  masks: MaskRect[]
  sourcePath: string
}) {
  const groups = groupMasksByCard(options.masks)
  const allMasksSvg = svgOverlay(options.imageWidth, options.imageHeight, options.masks)
  return groups.map((group, index) => {
    const labelSummary =
      group.masks
        .map((mask) => mask.label.trim())
        .filter(Boolean)
        .join(' / ') || `卡片 ${index + 1}`
    const reasonSummary = group.masks
      .map((mask) => mask.reason?.trim())
      .filter(Boolean)
      .join('\n')
    return {
      deckName: options.deckName,
      fields: {
        ID: `${options.draftId}-${group.order}`,
        Header: `${options.imageName} · 卡片 ${group.order}`,
        Image: options.imageHtml,
        'Question Mask': svgOverlay(options.imageWidth, options.imageHeight, options.masks, {
          highlightGroupId: group.groupId,
        }),
        Footer: options.deckName,
        Remarks: reasonSummary,
        Sources: options.sourcePath,
        'Extra 1': labelSummary,
        'Extra 2': '',
        'Answer Mask': svgOverlay(options.imageWidth, options.imageHeight, options.masks, {
          excludeGroupId: group.groupId,
        }),
        'Original Mask': allMasksSvg,
      },
      tags: options.tags,
      options: { allowDuplicate: false },
    }
  })
}

export async function importManualDrafts(payload: {
  items: DraftListItem[]
  webpQuality: number
  onProgress?: (progress: {
    completed: number
    total: number
    label: string
  }) => void
}): Promise<ManualImportResponse> {
  const templateStatus = await ensureManualTemplate()
  const results: ManualImportResult[] = []
  const total = payload.items.length

  for (const [index, item] of payload.items.entries()) {
    const label = item.image.source_path.split(/[\\/]/).pop() || item.image.source_path
    if (!item.draft.deck?.trim()) {
      results.push({
        draft_id: item.draft.id,
        ok: false,
        note_ids: [],
        created_count: 0,
        template_name: null,
        error: '当前图片还没有目标牌组。',
      })
      payload.onProgress?.({
        completed: index + 1,
        total,
        label,
      })
      continue
    }
    if (!item.image_blob || item.draft.masks.length === 0) {
      results.push({
        draft_id: item.draft.id,
        ok: false,
        note_ids: [],
        created_count: 0,
        template_name: templateStatus.active_template_name,
        error: '当前图片还没有可导出的遮挡卡片。',
      })
      payload.onProgress?.({
        completed: index + 1,
        total,
        label,
      })
      continue
    }

    try {
      await invokeAnki('createDeck', { deck: item.draft.deck })
      const encoded = await blobToWebpBase64(item.image_blob, payload.webpQuality)
      await invokeAnki('storeMediaFile', {
        filename: encoded.fileName,
        data: encoded.base64,
      })
      const imageHtml = `<img src="${escapeHtml(encoded.fileName)}" alt="${escapeHtml(item.image.source_path)}" />`
      const notes = buildManualNotes({
        draftId: item.draft.id,
        deckName: item.draft.deck,
        tags: item.draft.tags,
        imageName: item.image.source_path.split(/[\\/]/).pop() || item.image.source_path,
        imageHtml,
        imageWidth: item.image.width,
        imageHeight: item.image.height,
        masks: item.draft.masks,
        sourcePath: item.image.source_path,
      }).map((note) => ({
        ...note,
        modelName: templateStatus.active_template_name,
      }))

      const noteIds = await invokeAnki<(number | null)[]>('addNotes', { notes })
      const normalizedIds = noteIds.filter((noteId): noteId is number => typeof noteId === 'number' && noteId > 0)
      results.push({
        draft_id: item.draft.id,
        ok: normalizedIds.length === notes.length,
        note_ids: normalizedIds,
        created_count: normalizedIds.length,
        template_name: templateStatus.active_template_name,
        error: normalizedIds.length === notes.length ? null : '部分遮挡卡片没有成功写入 Anki。',
      })
    } catch (error) {
      results.push({
        draft_id: item.draft.id,
        ok: false,
        note_ids: [],
        created_count: 0,
        template_name: templateStatus.active_template_name,
        error: error instanceof Error ? error.message : '导出到 Anki 失败。',
      })
    }

    payload.onProgress?.({
      completed: index + 1,
      total,
      label,
    })
  }

  return { results }
}
