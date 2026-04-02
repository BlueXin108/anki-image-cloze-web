const DECK_POOL_STORAGE_KEY = 'anki-cloze:deck-pool'
const DECK_POOL_BACKUP_VERSION = 1

interface DeckPoolBackupPayload {
  version: number
  exported_at: string
  decks: string[]
}

interface DeckPoolUsageEntry {
  name: string
  count: number
  last_used_at: string
}

interface DeckPoolUsagePayload {
  version: number
  items: DeckPoolUsageEntry[]
}

function normalizeDeckName(value: string): string {
  return value.trim()
}

function sortDecks(decks: string[]): string[] {
  return [...decks].sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

function sortUsageEntries(entries: DeckPoolUsageEntry[]): DeckPoolUsageEntry[] {
  return [...entries].sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count
    if (right.last_used_at !== left.last_used_at) return right.last_used_at.localeCompare(left.last_used_at)
    return left.name.localeCompare(right.name, 'zh-CN')
  })
}

function normalizeDeckList(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return sortDecks(
    [...new Set(input.map((item) => (typeof item === 'string' ? normalizeDeckName(item) : '')).filter(Boolean))],
  )
}

function normalizeUsageEntries(input: unknown): DeckPoolUsageEntry[] {
  if (Array.isArray(input)) {
    return sortUsageEntries(
      [...new Map(
        input
          .map((item) => (typeof item === 'string'
            ? {
                name: normalizeDeckName(item),
                count: 1,
                last_used_at: new Date(0).toISOString(),
              }
            : null))
          .filter((item): item is DeckPoolUsageEntry => item !== null)
          .filter((item) => Boolean(item.name))
          .map((item) => [item.name, item] as const),
      ).values()],
    )
  }

  if (input && typeof input === 'object' && 'items' in input && Array.isArray((input as { items?: unknown }).items)) {
    return sortUsageEntries(
      [...new Map(
        ((input as { items: unknown[] }).items)
          .map((item) => {
            if (!item || typeof item !== 'object') return null
            const name = normalizeDeckName((item as { name?: unknown }).name as string)
            if (!name) return null
            const count = Number((item as { count?: unknown }).count)
            const lastUsedAt = typeof (item as { last_used_at?: unknown }).last_used_at === 'string'
              ? (item as { last_used_at: string }).last_used_at
              : new Date(0).toISOString()
            return {
              name,
              count: Number.isFinite(count) && count > 0 ? Math.round(count) : 1,
              last_used_at: lastUsedAt,
            }
          })
          .filter((item): item is DeckPoolUsageEntry => Boolean(item))
          .map((item) => [item.name, item] as const),
      ).values()],
    )
  }

  return []
}

function readDeckPoolUsage(): DeckPoolUsageEntry[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(DECK_POOL_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return normalizeUsageEntries(parsed)
  } catch {
    return []
  }
}

function writeDeckPoolUsage(entries: DeckPoolUsageEntry[]): DeckPoolUsageEntry[] {
  const normalized = sortUsageEntries(
    [...new Map(entries.map((entry) => [entry.name, {
      name: normalizeDeckName(entry.name),
      count: Math.max(1, Math.round(entry.count || 1)),
      last_used_at: entry.last_used_at || new Date(0).toISOString(),
    }])).values()].filter((entry) => Boolean(entry.name)),
  )

  if (typeof window !== 'undefined') {
    const payload: DeckPoolUsagePayload = {
      version: DECK_POOL_BACKUP_VERSION,
      items: normalized,
    }
    window.localStorage.setItem(DECK_POOL_STORAGE_KEY, JSON.stringify(payload))
  }

  return normalized
}

export function loadDeckPool(): string[] {
  const usage = readDeckPoolUsage()
  if (usage.length > 0) {
    return sortDecks(usage.map((entry) => entry.name))
  }
  return []
}

export function saveDeckPool(decks: string[]): string[] {
  const normalized = sortDecks(
    [...new Set(decks.map(normalizeDeckName).filter(Boolean))],
  )
  const existingUsage = new Map(readDeckPoolUsage().map((entry) => [entry.name, entry]))
  writeDeckPoolUsage(
    normalized.map((name) => {
      const existing = existingUsage.get(name)
      return existing ?? {
        name,
        count: 1,
        last_used_at: new Date(0).toISOString(),
      }
    }),
  )
  return normalized
}

export function rememberDeckName(deckName: string): string[] {
  const normalized = normalizeDeckName(deckName)
  if (!normalized) return loadDeckPool()
  const usage = readDeckPoolUsage()
  const now = new Date().toISOString()
  const usageMap = new Map(usage.map((entry) => [entry.name, entry]))
  const existing = usageMap.get(normalized)
  usageMap.set(normalized, {
    name: normalized,
    count: existing ? existing.count + 1 : 1,
    last_used_at: now,
  })
  return sortDecks(writeDeckPoolUsage([...usageMap.values()]).map((entry) => entry.name))
}

export function rememberDeckNames(deckNames: string[]): string[] {
  const usageMap = new Map(readDeckPoolUsage().map((entry) => [entry.name, entry]))
  const now = new Date().toISOString()
  for (const deckName of deckNames) {
    const normalized = normalizeDeckName(deckName)
    if (!normalized) continue
    const existing = usageMap.get(normalized)
    usageMap.set(normalized, {
      name: normalized,
      count: existing ? existing.count + 1 : 1,
      last_used_at: now,
    })
  }
  return sortDecks(writeDeckPoolUsage([...usageMap.values()]).map((entry) => entry.name))
}

export function loadDeckQuickPicks(limit = 20): string[] {
  return readDeckPoolUsage()
    .slice(0, Math.max(1, limit))
    .map((entry) => entry.name)
}

export function downloadDeckPoolBackup(decks: string[] = loadDeckPool()): {
  fileName: string
  count: number
} {
  const normalized = sortDecks([...new Set(decks.map(normalizeDeckName).filter(Boolean))])
  const payload: DeckPoolBackupPayload = {
    version: DECK_POOL_BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    decks: normalized,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const fileName = `anki-cloze-deck-pool-${payload.exported_at.slice(0, 10)}.json`
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)

  return {
    fileName,
    count: normalized.length,
  }
}

export async function readDeckPoolBackup(file: File): Promise<string[]> {
  const raw = await file.text()
  const parsed = JSON.parse(raw) as unknown

  if (Array.isArray(parsed)) {
    return normalizeDeckList(parsed)
  }

  if (
    parsed &&
    typeof parsed === 'object' &&
    'decks' in parsed
  ) {
    return normalizeDeckList((parsed as { decks?: unknown }).decks)
  }

  throw new Error('这份备份文件里没有读到可用的牌组列表。')
}
