import { useMemo, useState } from 'react'
import {
  CheckIcon,
  ChevronsUpDownIcon,
  CircleAlertIcon,
  ClipboardPenIcon,
  FolderTreeIcon,
  PlusIcon,
  RefreshCcwIcon,
  SaveIcon,
  SearchIcon,
  SparklesIcon,
} from 'lucide-react'

import type { AnkiConnectionState } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface DeckPickerProps {
  decks: string[]
  value: string
  onValueChange: (value: string) => void
  onSave: () => void
  onRefreshDecks: () => void
  onCreateDeck: () => void
  isRefreshing: boolean
  isCreating: boolean
  ankiState: AnkiConnectionState
  compact?: boolean
  hideSaveAction?: boolean
  embedded?: boolean
}

interface DeckTreeNode {
  name: string
  fullPath: string
  children: DeckTreeNode[]
}

function buildDeckTree(decks: string[]): DeckTreeNode[] {
  const root: DeckTreeNode[] = []
  for (const deck of decks) {
    const segments = deck.split('::').filter(Boolean)
    let cursor = root
    let accumulated = ''
    for (const segment of segments) {
      accumulated = accumulated ? `${accumulated}::${segment}` : segment
      let next = cursor.find((node) => node.name === segment)
      if (!next) {
        next = { name: segment, fullPath: accumulated, children: [] }
        cursor.push(next)
      }
      cursor = next.children
    }
  }

  const sortNode = (node: DeckTreeNode) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    node.children.forEach(sortNode)
  }

  const nodes = [...root].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  nodes.forEach(sortNode)
  return nodes
}

function filterDecks(decks: string[], keyword: string): string[] {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) return decks
  return decks.filter((deck) => deck.toLowerCase().includes(normalizedKeyword))
}

function formatCheckedAt(value?: string | null): string {
  if (!value) return '未同步'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未同步'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(state: AnkiConnectionState['level']) {
  switch (state) {
    case 'loading':
      return '获取中'
    case 'success':
      return '已同步'
    case 'warning':
      return '需确认'
    case 'error':
      return '未就绪'
    default:
      return '尚未获取'
  }
}

function statusBadgeVariant(state: AnkiConnectionState['level']) {
  switch (state) {
    case 'success':
      return 'secondary'
    case 'warning':
      return 'outline'
    case 'error':
      return 'destructive'
    default:
      return 'outline'
  }
}

function scoreSuggestion(deck: string, keyword: string) {
  const normalizedDeck = deck.toLowerCase()
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) return 0
  if (normalizedDeck === normalizedKeyword) return 100
  if (normalizedDeck.startsWith(normalizedKeyword)) return 80
  if (normalizedDeck.includes(`::${normalizedKeyword}`)) return 65
  if (normalizedDeck.includes(normalizedKeyword)) return 50
  return 0
}

function suggestDecks(decks: string[], keyword: string): string[] {
  const normalizedKeyword = keyword.trim()
  if (!normalizedKeyword) return []
  return [...decks]
    .map((deck) => ({ deck, score: scoreSuggestion(deck, normalizedKeyword) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.deck.localeCompare(right.deck, 'zh-CN'))
    .slice(0, 8)
    .map((item) => item.deck)
}

function DeckTree({
  nodes,
  currentDeck,
  onPick,
}: {
  nodes: DeckTreeNode[]
  currentDeck: string
  onPick: (deck: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {nodes.map((node) => (
        <DeckTreeNodeItem key={node.fullPath} node={node} currentDeck={currentDeck} onPick={onPick} depth={0} />
      ))}
    </div>
  )
}

function DeckTreeNodeItem({
  node,
  currentDeck,
  onPick,
  depth,
}: {
  node: DeckTreeNode
  currentDeck: string
  onPick: (deck: string) => void
  depth: number
}) {
  const [open, setOpen] = useState(depth < 1 || currentDeck.startsWith(node.fullPath))
  const hasChildren = node.children.length > 0
  const selected = currentDeck === node.fullPath

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl border px-2.5 py-2 transition',
          selected
            ? 'border-amber-300/80 bg-amber-50/80'
            : 'border-border/60 bg-background/85 hover:border-border hover:bg-muted/30',
        )}
      >
        {hasChildren ? (
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="rounded-full">
              <ChevronsUpDownIcon />
            </Button>
          </CollapsibleTrigger>
        ) : (
          <div className="flex size-7 items-center justify-center rounded-full  border-border/60 bg-muted/40 text-muted-foreground">
            <ClipboardPenIcon />
          </div>
        )}

        <button type="button" onClick={() => onPick(node.fullPath)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <div className="truncate text-sm font-medium">{node.name}</div>
          {selected ? (
            <Badge variant="secondary" className="shrink-0">
              <CheckIcon data-icon="inline-start" />
              已选中
            </Badge>
          ) : null}
        </button>
      </div>

      {hasChildren ? (
        <CollapsibleContent className="mt-1.5">
          <div className="ml-4 flex flex-col gap-1.5 border-l border-border/60 pl-3">
            {node.children.map((child) => (
              <DeckTreeNodeItem key={child.fullPath} node={child} currentDeck={currentDeck} onPick={onPick} depth={depth + 1} />
            ))}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  )
}

function SuggestionList({
  decks,
  onPick,
}: {
  decks: string[]
  onPick: (deck: string) => void
}) {
  if (decks.length === 0) return null

  return (
    <div className="absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-2xl border border-border/70 bg-background shadow-lg shadow-black/5">
      <ScrollArea className="max-h-56">
        <div className="flex flex-col gap-1 p-2">
          {decks.map((deck) => (
            <button
              key={deck}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault()
                onPick(deck)
              }}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-muted/40"
            >
              <SparklesIcon className="size-4 text-amber-600" />
              <span className="truncate">{deck}</span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function DeckNameInput({
  value,
  onValueChange,
  suggestions,
  placeholder,
}: {
  value: string
  onValueChange: (value: string) => void
  suggestions: string[]
  placeholder: string
}) {
  const [focused, setFocused] = useState(false)

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          window.setTimeout(() => setFocused(false), 80)
        }}
        placeholder={placeholder}
      />
      {focused ? <SuggestionList decks={suggestions} onPick={onValueChange} /> : null}
    </div>
  )
}

function DeckStatusInline({
  ankiState,
  deckCount,
  compact = false,
}: {
  ankiState: AnkiConnectionState
  deckCount: number
  compact?: boolean
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-sm text-muted-foreground', compact && 'text-xs')}>
      <Badge variant={statusBadgeVariant(ankiState.level)}>{statusLabel(ankiState.level)}</Badge>
      <span>{ankiState.title}</span>
      <span>{deckCount} 个牌组</span>
      {!compact ? <span>最近同步 {formatCheckedAt(ankiState.lastCheckedAt)}</span> : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="rounded-full">
            <CircleAlertIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          <div className="max-w-72">{ankiState.message}</div>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

export function DeckPicker({
  decks,
  value,
  onValueChange,
  onSave,
  onRefreshDecks,
  onCreateDeck,
  isRefreshing,
  isCreating,
  ankiState,
  compact = false,
  hideSaveAction = false,
  embedded = false,
}: DeckPickerProps) {
  const [search, setSearch] = useState('')
  const filteredDecks = useMemo(() => filterDecks(decks, search), [decks, search])
  const treeNodes = useMemo(() => buildDeckTree(filteredDecks), [filteredDecks])
  const normalizedValue = value.trim()
  const hasExactDeck = decks.includes(normalizedValue)
  const suggestions = useMemo(() => suggestDecks(decks, normalizedValue), [decks, normalizedValue])

  const deckBrowser = (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size={embedded || compact ? 'sm' : 'default'}>
          <FolderTreeIcon data-icon="inline-start" />
          浏览器
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[88vh] w-[94vw] max-w-[94vw] flex-col overflow-hidden p-0 sm:w-[82vw] sm:max-w-[82vw] lg:w-[72vw] lg:max-w-[72vw] xl:min-w-[60vw] xl:max-w-[68vw]">
        <DialogHeader className="border-b border-border/60 px-5 py-6">
          <DialogTitle>牌组浏览器</DialogTitle>
          <DialogDescription>把搜索、输入、选中和动作收在同一视图里，不再分散处理。</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 py-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
            <div className="relative">
              <SearchIcon className="pointer-events-none size-4  absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索牌组"
                className="pl-9"
              />
            </div>

            <DeckNameInput
              value={value}
              onValueChange={onValueChange}
              suggestions={suggestions}
              placeholder="输入或选中牌组"
            />
          </div>

          <DeckStatusInline ankiState={ankiState} deckCount={decks.length} />

          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/60 bg-muted/20">
            <ScrollArea className="h-full">
              <div className="p-3">
                {treeNodes.length > 0 ? (
                  <DeckTree nodes={treeNodes} currentDeck={value} onPick={onValueChange} />
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 bg-background/85 px-4 py-8 text-sm text-muted-foreground">
                    没有找到匹配牌组。你可以继续输入一个新名称，或者先刷新本机牌组。
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-5 py-4">
          <div className="text-sm text-muted-foreground">
            {hasExactDeck
              ? `当前会使用现有牌组：${normalizedValue}`
              : normalizedValue
                ? `当前会新建或保存为：${normalizedValue}`
                : '先选或先输入一个牌组'}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onRefreshDecks}>
              {isRefreshing ? <Spinner data-icon="inline-start" /> : <RefreshCcwIcon data-icon="inline-start" />}
              刷新牌组
            </Button>
            <Button variant="secondary" onClick={onCreateDeck} disabled={!normalizedValue || hasExactDeck}>
              {isCreating ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
              新建牌组
            </Button>
            <Button onClick={onSave} disabled={!normalizedValue}>
              <SaveIcon data-icon="inline-start" />
              选中并保存
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )

  const header = embedded ? (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">牌组</div>
        <div className="mt-1 text-xs text-muted-foreground">输入时会按已同步牌组即时补全。</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {deckBrowser}
        <Button variant="outline" size="sm" onClick={onRefreshDecks}>
          {isRefreshing ? <Spinner data-icon="inline-start" /> : <RefreshCcwIcon data-icon="inline-start" />}
          获取牌组
        </Button>
        <Button variant="secondary" size="sm" onClick={onCreateDeck} disabled={!normalizedValue || hasExactDeck}>
          {isCreating ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
          新建
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <CardTitle>{compact ? '牌组' : '目标牌组'}</CardTitle>
        <CardDescription>
          {compact
            ? '先选或输入牌组；输入时会按已拿到的牌组即时补全。'
            : '支持直接输入、即时补全，以及打开树形浏览器做最终确认。'}
        </CardDescription>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {deckBrowser}
        <Button variant="outline" size={compact ? 'sm' : 'default'} onClick={onRefreshDecks}>
          {isRefreshing ? <Spinner data-icon="inline-start" /> : <RefreshCcwIcon data-icon="inline-start" />}
          获取牌组
        </Button>
        <Button variant="secondary" size={compact ? 'sm' : 'default'} onClick={onCreateDeck} disabled={!normalizedValue || hasExactDeck}>
          {isCreating ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
          新建
        </Button>
      </div>
    </div>
  )

  const content = (
    <div className="flex flex-col gap-3 overflow-visible">
        <FieldGroup>
          <Field>
            <FieldLabel>{compact ? '牌组名称' : '输入或选择牌组'}</FieldLabel>
            <FieldContent>
              <DeckNameInput
                value={value}
                onValueChange={onValueChange}
                suggestions={suggestions}
                placeholder="例如 高等数学::导数应用"
              />
            </FieldContent>
          </Field>
        </FieldGroup>

        <div className="flex flex-wrap items-center gap-2">
          {hasExactDeck ? (
            <Badge variant="secondary">
              <CheckIcon data-icon="inline-start" />
              已匹配现有牌组
            </Badge>
          ) : normalizedValue ? (
            <Badge variant="outline">将作为新牌组名称</Badge>
          ) : (
            <Badge variant="outline">等待选择</Badge>
          )}
          <DeckStatusInline ankiState={ankiState} deckCount={decks.length} compact={compact} />
        </div>

        {!hideSaveAction ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={onSave} disabled={!normalizedValue}>
              <SaveIcon data-icon="inline-start" />
              保存到当前图片
            </Button>
          </div>
        ) : null}
    </div>
  )

  if (embedded) {
    return (
      <div className="flex flex-col gap-3 overflow-visible">
        {header}
        {content}
      </div>
    )
  }

  return (
    <Card className="overflow-visible border-border/70 bg-background/92 shadow-none">
      <CardHeader className={cn(compact ? 'gap-2 pb-3' : 'gap-3')}>{header}</CardHeader>
      <CardContent className="flex flex-col gap-3 overflow-visible">{content}</CardContent>
    </Card>
  )
}
