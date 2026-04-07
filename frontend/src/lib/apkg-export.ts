import { Card, Deck, Field, Media, Model, Note, Package } from 'anki-apkg-generator'

import { buildGeneratedCardTargets, isInteractiveCardMode } from '@/lib/card-generation'
import { groupMasksByCard, renderDraftPreviewAssets } from '@/lib/manual-preview'
import { exportFileExtension, exportMimeType } from '@/lib/workbench-settings'
import type { CardGenerationMode, DraftListItem, ImageExportFormat, MaskRect } from '@/types'

interface ApkgExportOptions {
  items: DraftListItem[]
  packageName?: string
  imageFormat: ImageExportFormat
  imageQuality?: number
  generationMode: CardGenerationMode
  onProgress?: (progress: {
    completed: number
    total: number
    label: string
  }) => void
}

const APKG_MODEL_ID = 903421170
const APKG_CARD_CSS = `
.card {
  font-family: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 18px;
  color: #1f2937;
  background: #ffffff;
  text-align: center;
  margin: 0;
  padding: 16px;
}

.io-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.io-header {
  font-size: 14px;
  color: #475569;
  text-align: left;
}

.io-image {
  position: relative;
  display: block;
  width: 100%;
  max-width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: #f8fafc;
  overflow: hidden;
}

.io-image img {
  display: block;
  width: 100%;
  height: auto;
}

.io-overlay-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
}

.io-hotspot {
  position: absolute;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  border: 2px solid rgba(39, 39, 42, 0.78);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
  box-sizing: border-box;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
}

.io-hotspot.is-revealed {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(217, 119, 6, 0.92);
}

.io-hotspot-chip {
  margin: 4px;
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  background: rgba(24, 24, 27, 0.92);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.io-reset-btn {
  align-self: flex-start;
  border: none;
  border-radius: 999px;
  padding: 8px 14px;
  background: #111827;
  color: #ffffff;
  font-size: 13px;
}

.io-meta {
  text-align: left;
  font-size: 13px;
  line-height: 1.7;
  color: #475569;
  white-space: pre-wrap;
}
`

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-')
}

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function convertBlobForExport(options: {
  blob: Blob
  imageFormat: ImageExportFormat
  quality: number
}): Promise<Blob> {
  const outputType = exportMimeType(options.imageFormat)
  if (outputType === 'image/png' && options.blob.type === 'image/png') {
    return options.blob
  }

  const imageUrl = URL.createObjectURL(options.blob)
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
    if (outputType === 'image/jpeg') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    context.drawImage(image, 0, 0)
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (value) resolve(value)
          else reject(new Error('导出图片失败。'))
        },
        outputType,
        outputType === 'image/png' ? undefined : Math.max(0.1, Math.min(1, options.quality / 100)),
      )
    })
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function buildInteractiveMaskOverlay(options: {
  imageWidth: number
  imageHeight: number
  masks: MaskRect[]
}): string {
  const groups = groupMasksByCard(options.masks)
  const orderByGroup = new Map(groups.map((group) => [group.groupId, group.order]))
  const labelByGroup = new Map(
    groups.map((group) => [
      group.groupId,
      group.masks
        .map((mask) => mask.label.trim())
        .filter(Boolean)
        .join(' / ') || `遮罩 ${group.order}`,
    ]),
  )

  return options.masks
    .map((mask) => {
      const groupId = mask.card_group_id || mask.id
      const order = orderByGroup.get(groupId) ?? 1
      const title = labelByGroup.get(groupId) ?? `遮罩 ${order}`
      const [x1, y1, x2, y2] = mask.bbox
      const left = (x1 / options.imageWidth) * 100
      const top = (y1 / options.imageHeight) * 100
      const width = ((x2 - x1) / options.imageWidth) * 100
      const height = ((y2 - y1) / options.imageHeight) * 100
      return `<button type="button" class="io-hotspot" data-group="${htmlEscape(groupId)}" title="${htmlEscape(title)}" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%"><span class="io-hotspot-chip">${order}</span></button>`
    })
    .join('')
}

const INTERACTIVE_CARD_SCRIPT = `<script>(function(){var root=document.currentScript&&document.currentScript.parentElement;while(root&&(!root.classList||!root.classList.contains('io-shell'))){root=root.parentElement;}root=root||document;var hotspots=Array.prototype.slice.call(root.querySelectorAll('.io-hotspot[data-group]'));if(!hotspots.length){return;}var resetBtn=root.querySelector('[data-io-reset]');var setGroupState=function(groupId,revealed){hotspots.forEach(function(node){if(node.getAttribute('data-group')===groupId){node.classList.toggle('is-revealed',revealed);}});};hotspots.forEach(function(node){var onToggle=function(event){event.preventDefault();var groupId=node.getAttribute('data-group')||'';var shouldReveal=!node.classList.contains('is-revealed');setGroupState(groupId,shouldReveal);};node.addEventListener('click',onToggle);node.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){onToggle(event);}});});if(resetBtn){resetBtn.hidden=false;resetBtn.addEventListener('click',function(){hotspots.forEach(function(node){node.classList.remove('is-revealed');});});}})();</script>`

function hashStringToPositiveInt(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash) + 1000
}

function buildApkgModel(): Model {
  const card = new Card().setCss(APKG_CARD_CSS).setTemplates([
    {
      name: 'Card 1',
      qfmt: '{{Front}}',
      afmt: '{{Back}}',
    },
  ])

  return new Model(card)
    .setId(APKG_MODEL_ID)
    .setName('Image Cloze Web Package')
    .setFields([
      new Field('Front').setOrd(0),
      new Field('Back').setOrd(1),
    ])
    .setSortIndex(0)
}

function buildFrontHtml(options: {
  header: string
  imageFileName: string
  overlayHtml?: string
  interactive?: boolean
}): string {
  return `
    <div class="io-shell">
      <div class="io-header">${htmlEscape(options.header)}</div>
      <div class="io-image">
        <img src="${htmlEscape(options.imageFileName)}" alt="${htmlEscape(options.header)}" />
        ${options.overlayHtml ? `<div class="io-overlay-layer">${options.overlayHtml}</div>` : ''}
      </div>
      ${options.interactive ? INTERACTIVE_CARD_SCRIPT : ''}
    </div>
  `
}

function buildBackHtml(options: {
  header: string
  imageFileName: string
  overlayHtml?: string
  meta: string
  interactive?: boolean
}): string {
  return `
    <div class="io-shell">
      <div class="io-header">${htmlEscape(options.header)}</div>
      <div class="io-image">
        <img src="${htmlEscape(options.imageFileName)}" alt="${htmlEscape(options.header)}" />
        ${options.overlayHtml ? `<div class="io-overlay-layer">${options.overlayHtml}</div>` : ''}
      </div>
      ${options.interactive ? '<button type="button" class="io-reset-btn" data-io-reset hidden>全部恢复遮罩</button>' : ''}
      <div class="io-meta">${htmlEscape(options.meta)}</div>
      ${options.interactive ? INTERACTIVE_CARD_SCRIPT : ''}
    </div>
  `
}

function buildMeta(item: DraftListItem, cardIndex: number, labels: string[]): string {
  const normalizedLabels = labels
    .map((label) => label.trim())
    .filter(Boolean)
  const tags = item.draft.tags.filter(Boolean)
  const parts = [
    `原图：${item.image.source_path}`,
    `卡片：第 ${cardIndex} 张`,
    item.draft.deck?.trim() ? `牌组：${item.draft.deck.trim()}` : '',
    tags.length > 0 ? `标签：${tags.join(', ')}` : '',
    normalizedLabels.length > 0 ? `遮罩：${normalizedLabels.join(' / ')}` : '',
  ]

  return parts.filter(Boolean).join('\n')
}

export async function exportDraftsAsApkg(options: ApkgExportOptions): Promise<{
  blob: Blob
  fileName: string
}> {
  const packageName = options.packageName?.trim() || 'anki-image-cloze-export'
  const outputQuality = Math.max(0.1, Math.min(1, (options.imageQuality ?? 80) / 100))
  const mimeType = exportMimeType(options.imageFormat)
  const extension = exportFileExtension(options.imageFormat)
  const model = buildApkgModel()
  const deckMap = new Map<string, Deck>()
  const medias: Media[] = []
  const total = options.items.length

  const getDeck = (deckName: string) => {
    const normalized = deckName.trim() || 'Image Cloze Web'
    const existing = deckMap.get(normalized)
    if (existing) return existing
    const created = new Deck(normalized).setId(hashStringToPositiveInt(normalized))
    deckMap.set(normalized, created)
    return created
  }

  for (const [itemIndex, item] of options.items.entries()) {
    const targets = buildGeneratedCardTargets(item.draft.masks, options.generationMode)
    const targetDeck = getDeck(item.draft.deck?.trim() || 'Image Cloze Web')
    const interactiveMode = isInteractiveCardMode(options.generationMode)

    for (const [targetIndex, target] of targets.entries()) {
      const header = interactiveMode
        ? `${item.image.source_path.split(/[\\/]/).pop() || item.image.source_path} · 整图交互卡`
        : `${item.image.source_path.split(/[\\/]/).pop() || item.image.source_path} · 卡片 ${target.order}`

      if (interactiveMode) {
        if (!item.image_blob) continue
        const imageBlob = await convertBlobForExport({
          blob: item.image_blob,
          imageFormat: options.imageFormat,
          quality: options.imageQuality ?? 80,
        })
        const imageFileName = `${sanitizeFileName(`${item.draft.id}-${item.image.source_path}`)}-base.${extension}`
        medias.push(new Media(await imageBlob.arrayBuffer(), imageFileName))
        const overlayHtml = buildInteractiveMaskOverlay({
          imageWidth: item.image.width,
          imageHeight: item.image.height,
          masks: item.draft.masks,
        })
        const note = new Note(model)
          .setName(`${item.draft.id}-single-card`)
          .setTags(item.draft.tags)
          .setFieldsValue([
            buildFrontHtml({
              header,
              imageFileName,
              overlayHtml,
              interactive: true,
            }),
            buildBackHtml({
              header,
              imageFileName,
              overlayHtml,
              meta: buildMeta(item, 1, item.draft.masks.map((mask) => mask.label.trim()).filter(Boolean)),
              interactive: true,
            }),
          ])

        targetDeck.addNote(note)
        continue
      }

      const preview = await renderDraftPreviewAssets({
        draft: item.draft,
        sourceUrl: item.image.source_url || '',
        imageWidth: item.image.width,
        imageHeight: item.image.height,
        selectedGroupId: target.groupId,
        generationMode: options.generationMode,
        outputType: mimeType,
        outputQuality: options.imageFormat === 'png' ? undefined : outputQuality,
      })

      if (!preview.frontBlob || !preview.backBlob) continue

      const baseName = sanitizeFileName(`${item.draft.id}-${target.order}-${item.image.source_path}`)
      const frontFileName = `${baseName}-front.${extension}`
      const backFileName = `${baseName}-back.${extension}`
      const [frontBuffer, backBuffer] = await Promise.all([preview.frontBlob.arrayBuffer(), preview.backBlob.arrayBuffer()])

      medias.push(new Media(frontBuffer, frontFileName))
      medias.push(new Media(backBuffer, backFileName))
      const groupLabels = target.masks.map((mask) => mask.label.trim()).filter(Boolean)

      const note = new Note(model)
        .setName(`${item.draft.id}-${target.key}`)
        .setTags(item.draft.tags)
        .setFieldsValue([
          buildFrontHtml({
            header,
            imageFileName: frontFileName,
          }),
          buildBackHtml({
            header,
            imageFileName: backFileName,
            meta: buildMeta(item, targetIndex + 1, groupLabels),
          }),
        ])

      targetDeck.addNote(note)
    }

    options.onProgress?.({
      completed: itemIndex + 1,
      total,
      label: item.image.source_path.split(/[\\/]/).pop() || item.image.source_path,
    })
  }

  const packageInstance = new Package([...deckMap.values()], medias)
  const file = await packageInstance.writeToFile({ type: 'blob' })
  if (!(file instanceof Blob)) {
    throw new Error('浏览器没有成功生成 APKG 文件。')
  }

  return {
    blob: file,
    fileName: `${sanitizeFileName(packageName)}.apkg`,
  }
}

export async function shareOrDownloadApkg(options: {
  blob: Blob
  fileName: string
  preferShare?: boolean
  tryOpenAfterDownload?: boolean
}): Promise<'shared' | 'downloaded' | 'downloaded-open-attempted'> {
  const file = new File([options.blob], options.fileName, {
    type: 'application/zip',
  })

  if (
    options.preferShare &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: options.fileName,
        text: '已生成 APKG 卡包，可以直接分享给支持导入的 Anki 应用。',
      })
      return 'shared'
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'AbortError') {
        throw error
      }
    }
  }

  const url = URL.createObjectURL(options.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = options.fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  if (options.tryOpenAfterDownload && typeof window !== 'undefined') {
    window.setTimeout(() => {
      try {
        const openAnchor = document.createElement('a')
        openAnchor.href = url
        openAnchor.target = '_blank'
        openAnchor.rel = 'noopener noreferrer'
        document.body.append(openAnchor)
        openAnchor.click()
        openAnchor.remove()
      } catch {
        // 这里只做一次尽力尝试，失败时仍保留已下载文件。
      }
    }, 180)
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return options.tryOpenAfterDownload ? 'downloaded-open-attempted' : 'downloaded'
}
