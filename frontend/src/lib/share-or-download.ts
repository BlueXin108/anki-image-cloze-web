/**
 * 统一的分享/下载层。
 *
 * Chrome Android 特有问题：blob URL 下载时忽略 `<a download>` 的文件名属性，
 * 按 blob 的 MIME 类型推断扩展名（`application/zip` → `.zip`）。
 *
 * 解决策略：在创建 blob URL 前，将 blob 重新包装为 `application/octet-stream` 类型。
 * Chrome 无法将此通用 MIME 映射到任何具体扩展名，会回退到 `download` 属性的文件名。
 *
 * 其他浏览器（Via、系统浏览器等）本来就尊重 `download` 属性，此改动不影响。
 */

export type DeliveryResult =
  | 'shared'
  | 'downloaded'
  | 'downloaded-open-attempted'
  | 'needs-manual-save'

export interface DeliveryPayload {
  blobUrl?: string
  blob?: Blob
  fileName?: string
}

export interface ShareOrDownloadResult {
  result: DeliveryResult
  payload?: DeliveryPayload
}

const SHARE_MIME_CANDIDATES = [
  'application/zip',
  'application/octet-stream',
] as const

const BLOB_URL_REVOKE_DELAY_MS = 60_000

// ── 内部工具 ──────────────────────────────────────────────────

function scheduleRevoke(url: string): void {
  window.setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_REVOKE_DELAY_MS)
}

/**
 * 核心下载方法。
 *
 * 关键技巧：将 blob 重新包装为 `application/octet-stream` 类型再创建 object URL。
 * 这样 Chrome Android 因为无法从 MIME 推断扩展名，会 fallback 到 `download` 属性。
 */
function triggerDownload(blob: Blob, fileName: string): string {
  // 关键：用 application/octet-stream 包装，阻止 Chrome 按 MIME 推断扩展名
  const downloadBlob = new Blob([blob], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(downloadBlob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  // 确保 anchor 在 DOM 中（部分浏览器要求）
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  return url
}

// ── 公开 API：分享（用户手势内同步调用）──────────────────────

/**
 * 独立的分享方法 — 必须在用户点击事件（user gesture）内同步调用。
 * 供 UI 层在 toast action 按钮的 onClick 中使用。
 */
export async function triggerNativeShare(
  blob: Blob,
  fileName: string,
  shareText?: string,
): Promise<boolean> {
  if (typeof navigator === 'undefined') return false
  if (typeof navigator.share !== 'function') return false
  if (typeof navigator.canShare !== 'function') return false

  for (const mimeType of SHARE_MIME_CANDIDATES) {
    const file = new File([blob], fileName, { type: mimeType })
    if (!navigator.canShare({ files: [file] })) continue

    await navigator.share({
      files: [file],
      title: fileName,
      ...(shareText ? { text: shareText } : {}),
    })
    return true
  }

  return false
}

// ── 公开 API：下载入口 ────────────────────────────────────────

export async function shareOrDownloadFile(options: {
  blob: Blob
  fileName: string
  mimeType: string
  preferShare?: boolean
  tryOpenAfterDownload?: boolean
}): Promise<ShareOrDownloadResult> {
  if (options.preferShare) {
    try {
      const shared = await triggerNativeShare(options.blob, options.fileName)
      if (shared) {
        return { result: 'shared' }
      }
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'AbortError') {
        console.warn('[share-or-download] share failed, falling back to download', error)
      }
    }
  }

  try {
    const url = triggerDownload(options.blob, options.fileName)
    scheduleRevoke(url)

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
        } catch (error) {
          console.warn('[share-or-download] open-after-download failed', error)
        }
      }, 180)
    }

    return {
      result: options.tryOpenAfterDownload ? 'downloaded-open-attempted' : 'downloaded',
      ...(options.preferShare
        ? {
            payload: {
              blobUrl: url,
              blob: options.blob,
              fileName: options.fileName,
            },
          }
        : {}),
    }
  } catch (error) {
    console.warn('[share-or-download] download failed, offering manual save', error)
  }

  const fallbackUrl = URL.createObjectURL(options.blob)
  scheduleRevoke(fallbackUrl)
  return {
    result: 'needs-manual-save',
    payload: {
      blobUrl: fallbackUrl,
      blob: options.blob,
      fileName: options.fileName,
    },
  }
}

export async function shareOrDownloadApkg(options: {
  blob: Blob
  fileName: string
  preferShare?: boolean
  tryOpenAfterDownload?: boolean
}): Promise<ShareOrDownloadResult> {
  return shareOrDownloadFile({
    blob: options.blob,
    fileName: options.fileName,
    mimeType: 'application/zip',
    preferShare: options.preferShare,
    tryOpenAfterDownload: options.tryOpenAfterDownload,
  })
}
