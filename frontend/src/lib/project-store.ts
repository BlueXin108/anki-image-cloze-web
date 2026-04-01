import type {
  DraftListItem,
  PersistedDraftListItem,
  PersistedProjectRecord,
  WorkspaceMode,
} from '@/types'

const DB_NAME = 'anki-image-cloze-web'
const STORE_NAME = 'projects'
const PROJECT_KEY = 'manual-workspace'

interface HydratedProject {
  items: DraftListItem[]
  selectedDraftId: string | null
  workspaceMode: WorkspaceMode
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error ?? new Error('无法打开浏览器本地存储。'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
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

function serializeItems(items: DraftListItem[]): PersistedDraftListItem[] {
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
        image_blob: item.image_blob!,
      }
    })
}

export async function saveProject(payload: {
  items: DraftListItem[]
  selectedDraftId: string | null
  workspaceMode: WorkspaceMode
}): Promise<void> {
  const db = await openDatabase()
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const record: PersistedProjectRecord = {
      version: 1,
      saved_at: new Date().toISOString(),
      workspace_mode: payload.workspaceMode,
      selected_draft_id: payload.selectedDraftId,
      items: serializeItems(payload.items),
    }
    store.put(record, PROJECT_KEY)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function loadProject(): Promise<HydratedProject | null> {
  const db = await openDatabase()
  try {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const record = await requestToPromise<PersistedProjectRecord | undefined>(store.get(PROJECT_KEY))
    if (!record) return null
    const items: DraftListItem[] = record.items.map((item) => {
      const objectUrl = URL.createObjectURL(item.image_blob)
      return {
        image: {
          ...item.image,
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
    }
  } finally {
    db.close()
  }
}

export async function clearProject(): Promise<void> {
  const db = await openDatabase()
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    store.delete(PROJECT_KEY)
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
