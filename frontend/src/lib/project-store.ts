import type {
  DraftListItem,
  PersistedProjectRecord,
  ImageItem,
  CardDraft,
  WorkspaceMode,
} from '@/types'

const DB_NAME = 'anki-image-cloze-web'
const META_STORE_NAME = 'projects'
const ASSET_STORE_NAME = 'project-assets'
const PROJECT_KEY = 'manual-workspace'

interface HydratedProject {
  items: DraftListItem[]
  selectedDraftId: string | null
  workspaceMode: WorkspaceMode
  compressionCount: number
}

interface ProjectSummary {
  itemCount: number
  savedAt: string
  workspaceMode: WorkspaceMode
  compressionCount: number
}

interface PersistedProjectMetaItem {
  image: Omit<ImageItem, 'source_url'>
  draft: Omit<CardDraft, 'source_image_url'>
}

interface PersistedProjectMetaRecordV2 {
  version: 2
  saved_at: string
  workspace_mode: WorkspaceMode
  selected_draft_id: string | null
  items: PersistedProjectMetaItem[]
  compression_count?: number
}

type PersistedProjectRecordAny = PersistedProjectRecord | PersistedProjectMetaRecordV2

type HydratedProjectItem = {
  image: Omit<ImageItem, 'source_url'> & { source_url: string }
  draft: Omit<CardDraft, 'source_image_url'> & { source_image_url: string }
  image_blob: Blob
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 2)
    request.onerror = () => reject(request.error ?? new Error('无法打开浏览器本地存储。'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(META_STORE_NAME)) {
        db.createObjectStore(META_STORE_NAME)
      }
      if (!db.objectStoreNames.contains(ASSET_STORE_NAME)) {
        db.createObjectStore(ASSET_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('浏览器本地存储操作失败。'))
    request.onsuccess = () => resolve(request.result)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('浏览器本地存储写入失败。'))
    transaction.onabort = () => reject(transaction.error ?? new Error('浏览器本地存储写入被中止。'))
  })
}

function serializeItems(items: DraftListItem[]): PersistedProjectMetaItem[] {
  return items
    .filter((item) => item.image_blob instanceof Blob)
    .map((item) => {
      const image = { ...item.image }
      delete image.source_url
      const draft = { ...item.draft }
      delete draft.source_image_url
      return {
        image,
        draft,
      }
    })
}

function normalizeStoredImage(image: Omit<ImageItem, 'source_url'>): Omit<ImageItem, 'source_url'> {
  return {
    ...image,
    source_quality: image.source_quality ?? 'legacy-unknown',
  }
}

function needsAssetRewrite(
  previous: PersistedProjectMetaItem | undefined,
  next: DraftListItem,
): boolean {
  if (!previous) return true
  return (
    previous.image.file_hash !== next.image.file_hash ||
    previous.image.width !== next.image.width ||
    previous.image.height !== next.image.height ||
    previous.image.media_type !== next.image.media_type ||
    previous.image.source_path !== next.image.source_path
  )
}

export async function saveProject(payload: {
  items: DraftListItem[]
  selectedDraftId: string | null
  workspaceMode: WorkspaceMode
  compressionCount?: number
}): Promise<void> {
  const db = await openDatabase()
  try {
    const transaction = db.transaction([META_STORE_NAME, ASSET_STORE_NAME], 'readwrite')
    const metaStore = transaction.objectStore(META_STORE_NAME)
    const assetStore = transaction.objectStore(ASSET_STORE_NAME)
    const previousRecord = await requestToPromise<PersistedProjectRecordAny | undefined>(metaStore.get(PROJECT_KEY))
    const previousItems =
      previousRecord?.version === 2
        ? previousRecord.items
        : previousRecord?.items.map((item) => ({
            image: normalizeStoredImage(item.image),
            draft: item.draft,
          })) ?? []
    const previousByImageId = new Map(previousItems.map((item) => [item.image.id, item]))
    const nextItemsWithBlob = payload.items.filter((item) => item.image_blob instanceof Blob)
    const nextImageIds = new Set(nextItemsWithBlob.map((item) => item.image.id))
    const previousImageIds = new Set(previousItems.map((item) => item.image.id))

    nextItemsWithBlob.forEach((item) => {
      if (needsAssetRewrite(previousByImageId.get(item.image.id), item)) {
        assetStore.put(item.image_blob!, item.image.id)
      }
    })

    previousImageIds.forEach((imageId) => {
      if (!nextImageIds.has(imageId)) {
        assetStore.delete(imageId)
      }
    })

    const record: PersistedProjectMetaRecordV2 = {
      version: 2,
      saved_at: new Date().toISOString(),
      workspace_mode: payload.workspaceMode,
      selected_draft_id: payload.selectedDraftId,
      items: serializeItems(payload.items),
      compression_count: Math.max(0, payload.compressionCount ?? 0),
    }
    metaStore.put(record, PROJECT_KEY)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function loadProject(): Promise<HydratedProject | null> {
  const db = await openDatabase()
  try {
    const transaction = db.transaction([META_STORE_NAME, ASSET_STORE_NAME], 'readonly')
    const metaStore = transaction.objectStore(META_STORE_NAME)
    const assetStore = transaction.objectStore(ASSET_STORE_NAME)
    const record = await requestToPromise<PersistedProjectRecordAny | undefined>(metaStore.get(PROJECT_KEY))
    if (!record) return null
    const items: DraftListItem[] =
      record.version === 2
        ? (
            await Promise.all(
              record.items.map(async (item) => {
                const blob = await requestToPromise<Blob | undefined>(assetStore.get(item.image.id))
                if (!(blob instanceof Blob)) return null
                const objectUrl = URL.createObjectURL(blob)
                return {
                  image: {
                    ...normalizeStoredImage(item.image),
                    source_url: objectUrl,
                  },
                  draft: {
                    ...item.draft,
                    source_image_url: objectUrl,
                  },
                  image_blob: blob,
                } satisfies HydratedProjectItem
              }),
            )
          ).filter((item): item is HydratedProjectItem => item !== null)
        : record.items.map((item) => {
            const objectUrl = URL.createObjectURL(item.image_blob)
            return {
              image: {
                ...normalizeStoredImage(item.image),
                source_url: objectUrl,
              },
              draft: {
                ...item.draft,
                source_image_url: objectUrl,
              },
              image_blob: item.image_blob,
            }
          })
    return {
      items,
      selectedDraftId: record.selected_draft_id,
      workspaceMode: record.workspace_mode,
      compressionCount: Math.max(0, record.version === 2 ? record.compression_count ?? 0 : 0),
    }
  } finally {
    db.close()
  }
}

export async function peekProjectSummary(): Promise<ProjectSummary | null> {
  const db = await openDatabase()
  try {
    const transaction = db.transaction(META_STORE_NAME, 'readonly')
    const store = transaction.objectStore(META_STORE_NAME)
    const record = await requestToPromise<PersistedProjectRecordAny | undefined>(store.get(PROJECT_KEY))
    if (!record) return null
    return {
      itemCount: record.items.length,
      savedAt: record.saved_at,
      workspaceMode: record.workspace_mode,
      compressionCount: Math.max(0, record.version === 2 ? record.compression_count ?? 0 : 0),
    }
  } finally {
    db.close()
  }
}

export async function clearProject(): Promise<void> {
  const db = await openDatabase()
  try {
    const transaction = db.transaction([META_STORE_NAME, ASSET_STORE_NAME], 'readwrite')
    const metaStore = transaction.objectStore(META_STORE_NAME)
    const assetStore = transaction.objectStore(ASSET_STORE_NAME)
    const record = await requestToPromise<PersistedProjectRecordAny | undefined>(metaStore.get(PROJECT_KEY))
    metaStore.delete(PROJECT_KEY)
    if (record?.version === 2) {
      record.items.forEach((item) => {
        assetStore.delete(item.image.id)
      })
    } else if (record?.items) {
      record.items.forEach((item) => {
        assetStore.delete(item.image.id)
      })
    }
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export function releaseDraftItems(items: DraftListItem[]): void {
  items.forEach((item) => {
    if (item.image.source_url) {
      URL.revokeObjectURL(item.image.source_url)
    }
  })
}
