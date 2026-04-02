import type { StatusTaskId, StatusTaskState } from '@/components/workbench/status-capsule'
import type { AnkiConnectionState, AnkiStateLevel, CardDraft, DraftListItem } from '@/types'

export const WORKSPACE_MODE_STORAGE_KEY = 'anki-cloze:web-workspace-mode'

export const EMPTY_ANKI_STATE: AnkiConnectionState = {
  checked: false,
  ok: false,
  title: '尚未获取本机牌组',
  message: '还没有检测本机 Anki 连接。',
  decks: [],
  level: 'idle',
  lastCheckedAt: null,
  templateStatus: null,
}

export const STATUS_TASK_ORDER: StatusTaskId[] = ['anki', 'restore', 'save']

export function createInitialStatusTasks(): Record<StatusTaskId, StatusTaskState> {
  return {
    anki: { id: 'anki', label: 'Anki 连接', state: 'idle', progress: 0, detail: '等待首次自动同步。' },
    files: { id: 'files', label: '图片带入', state: 'idle', progress: 0, detail: '等待你上传图片或导入文件夹。' },
    restore: { id: 'restore', label: '项目恢复', state: 'idle', progress: 0, detail: '浏览器尚未执行恢复检查。' },
    save: { id: 'save', label: '本地保存', state: 'idle', progress: 0, detail: '等待下一次自动保存。' },
    export: { id: 'export', label: '导出卡片', state: 'idle', progress: 0, detail: '当前还没有执行导出。' },
  }
}

export function parseTagInput(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function replaceDraft(items: DraftListItem[], draft: CardDraft): DraftListItem[] {
  return items.map((item) =>
    item.draft.id === draft.id
      ? {
          ...item,
          draft: {
            ...draft,
            source_image_url: item.image.source_url,
          },
          image: {
            ...item.image,
            deck: draft.deck,
            tags: draft.tags,
          },
        }
      : item,
  )
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function classifyAnkiFailure(message: string): { title: string; level: AnkiStateLevel; detail: string } {
  if (message.includes('桌面浏览器')) {
    return { title: '当前环境不支持直连', level: 'error', detail: '请改用桌面浏览器打开本站，再连接你本机的 Anki。' }
  }
  if (message.includes('允许来自当前网页的访问')) {
    return { title: 'AnkiConnect 还没有放行这个网页', level: 'warning', detail: '请在本机插件设置里允许当前站点访问，然后重新获取牌组。' }
  }
  if (message.includes('已安装并启用 AnkiConnect')) {
    return { title: 'AnkiConnect 似乎还没准备好', level: 'warning', detail: '请确认插件已安装并启用，然后重新获取牌组。' }
  }
  if (message.includes('Anki 已打开')) {
    return { title: '本机 Anki 还没有打开', level: 'warning', detail: '先打开 Anki 桌面端，再回来获取牌组。' }
  }
  if (message.includes('HTTP')) {
    return { title: 'AnkiConnect 返回异常', level: 'error', detail: '插件有响应，但返回不正常。可以重启 Anki 后再试一次。' }
  }
  return { title: '暂时拿不到本机牌组', level: 'error', detail: '连接过程中出现了未分类问题，请根据下面原始提示继续排查。' }
}

export function ankiLoadingState(): AnkiConnectionState {
  return {
    checked: true,
    ok: false,
    title: '正在获取本机牌组',
    message: '正在连接本机 AnkiConnect，并同步可用牌组。',
    decks: [],
    level: 'loading',
    lastCheckedAt: null,
    templateStatus: null,
  }
}
