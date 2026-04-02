import { Card, Deck, Field, Media, Model, Note, Package } from 'anki-apkg-generator'

import { groupMasksByCard, renderDraftPreviewSet } from '@/lib/manual-preview'
import type { DraftListItem } from '@/types'

interface ApkgExportOptions {
  items: DraftListItem[]
  packageName?: string
  imageQuality?: number
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

function hashStringToPositiveInt(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash) + 1000
}

async function dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(dataUrl)
  return response.arrayBuffer()
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
  frontFileName: string
}): string {
  return `
    <div class="io-shell">
      <div class="io-header">${htmlEscape(options.header)}</div>
      <div class="io-image"><img src="${htmlEscape(options.frontFileName)}" alt="${htmlEscape(options.header)}" /></div>
    </div>
  `
}

function buildBackHtml(options: {
  header: string
  backFileName: string
  meta: string
}): string {
  return `
    <div class="io-shell">
      <div class="io-header">${htmlEscape(options.header)}</div>
      <div class="io-image"><img src="${htmlEscape(options.backFileName)}" alt="${htmlEscape(options.header)}" /></div>
      <div class="io-meta">${htmlEscape(options.meta)}</div>
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
    const groups = groupMasksByCard(item.draft.masks)
    const targetDeck = getDeck(item.draft.deck?.trim() || 'Image Cloze Web')

    for (const [groupIndex, group] of groups.entries()) {
      const preview = await renderDraftPreviewSet({
        draft: item.draft,
        sourceUrl: item.image.source_url || '',
        imageWidth: item.image.width,
        imageHeight: item.image.height,
        selectedGroupId: group.groupId,
        outputType: 'image/webp',
        outputQuality,
      })

      if (!preview.frontUrl || !preview.backUrl) continue

      const baseName = sanitizeFileName(`${item.draft.id}-${group.order}-${item.image.source_path}`)
      const frontFileName = `${baseName}-front.webp`
      const backFileName = `${baseName}-back.webp`
      const [frontBuffer, backBuffer] = await Promise.all([
        dataUrlToArrayBuffer(preview.frontUrl),
        dataUrlToArrayBuffer(preview.backUrl),
      ])

      medias.push(new Media(frontBuffer, frontFileName))
      medias.push(new Media(backBuffer, backFileName))
      const groupLabels = group.masks
        .map((mask) => mask.label.trim())
        .filter(Boolean)

      const note = new Note(model)
        .setName(`${item.draft.id}-${group.groupId}`)
        .setTags(item.draft.tags)
        .setFieldsValue([
          buildFrontHtml({
            header: `${item.image.source_path.split(/[\\/]/).pop() || item.image.source_path} · 卡片 ${group.order}`,
            frontFileName,
          }),
          buildBackHtml({
            header: `${item.image.source_path.split(/[\\/]/).pop() || item.image.source_path} · 卡片 ${group.order}`,
            backFileName,
            meta: buildMeta(item, groupIndex + 1, groupLabels),
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
