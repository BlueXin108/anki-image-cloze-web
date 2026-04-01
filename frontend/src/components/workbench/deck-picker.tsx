import { useMemo, useState } from 'react'
import { CheckIcon, ChevronsUpDownIcon, FolderTreeIcon, SaveIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DeckPickerProps {
  decks: string[]
  value: string
  onValueChange: (value: string) => void
  onSave: () => void
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
    <div className="flex flex-col gap-2">
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
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
        {hasChildren ? (
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="px-2">
              <ChevronsUpDownIcon data-icon="inline-start" />
              {node.name}
            </Button>
          </CollapsibleTrigger>
        ) : (
          <div className="px-2 text-sm font-medium">{node.name}</div>
        )}
        <div className="ml-auto">
          <Button
            variant={currentDeck === node.fullPath ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onPick(node.fullPath)}
          >
            {currentDeck === node.fullPath ? <CheckIcon data-icon="inline-start" /> : <FolderTreeIcon data-icon="inline-start" />}
            选中
          </Button>
        </div>
      </div>
      {hasChildren ? (
        <CollapsibleContent className="mt-2">
          <div className="ml-5 flex flex-col gap-2 border-l border-border/60 pl-3">
            {node.children.map((child) => (
              <DeckTreeNodeItem key={child.fullPath} node={child} currentDeck={currentDeck} onPick={onPick} depth={depth + 1} />
            ))}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  )
}

export function DeckPicker({ decks, value, onValueChange, onSave }: DeckPickerProps) {
  const [search, setSearch] = useState('')
  const filteredDecks = useMemo(() => filterDecks(decks, search), [decks, search])
  const treeNodes = useMemo(() => buildDeckTree(filteredDecks), [filteredDecks])

  return (
    <Card className="border-border/70 bg-background/85">
      <CardHeader>
        <CardTitle>目标 Deck</CardTitle>
        <CardDescription>平时可以直接下拉选；如果 deck 很多，就点右侧按钮用大窗口树形浏览、搜索和新建。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel>快速选择 / 新建</FieldLabel>
            <FieldContent>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <Select value={decks.includes(value) ? value : undefined} onValueChange={onValueChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="先从现有 deck 里快速选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {decks.map((deck) => (
                        <SelectItem key={deck} value={deck}>
                          {deck}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <FolderTreeIcon data-icon="inline-start" />
                      打开树形选择器
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-5xl">
                    <DialogHeader>
                      <DialogTitle>Deck 树形浏览器</DialogTitle>
                      <DialogDescription>可以直接搜索、展开层级、点选现有 deck，也可以把下面的输入框改成新的 deck 名称。</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                      <Card className="border-border/60 bg-muted/20 shadow-none">
                        <CardContent className="py-4">
                          <FieldGroup>
                            <Field>
                              <FieldLabel>搜索 deck</FieldLabel>
                              <FieldContent>
                                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="输入关键字，例如 线性表 / 微分 / Chapter3" />
                                <FieldDescription>搜索会同时作用于树和下方列表。</FieldDescription>
                              </FieldContent>
                            </Field>
                            <Field>
                              <FieldLabel>当前选择</FieldLabel>
                              <FieldContent>
                                <Input value={value} onChange={(event) => onValueChange(event.target.value)} placeholder="也可以直接在这里编辑或新建 deck" />
                              </FieldContent>
                            </Field>
                            <Button onClick={onSave}>
                              <SaveIcon data-icon="inline-start" />
                              保存当前 Deck
                            </Button>
                          </FieldGroup>
                        </CardContent>
                      </Card>
                      <Card className="border-border/60 bg-muted/20 shadow-none">
                        <CardContent className="max-h-[70vh] overflow-auto py-4">
                          {treeNodes.length > 0 ? (
                            <DeckTree nodes={treeNodes} currentDeck={value} onPick={onValueChange} />
                          ) : (
                            <div className="rounded-xl border border-dashed border-border/60 bg-background/80 px-4 py-8 text-sm text-muted-foreground">
                              没有匹配到现有 deck。你可以直接在左侧输入框里新建一个。
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>当前 deck 名称</FieldLabel>
            <FieldContent>
              <Input value={value} onChange={(event) => onValueChange(event.target.value)} placeholder="例如 计算机::数据结构::链表" />
              <FieldDescription>这里始终可以直接改。你既可以选已有的，也可以在现有层级上继续细分后新建。</FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onSave}>
            <SaveIcon data-icon="inline-start" />
            保存当前 Deck
          </Button>
          <div className="text-sm text-muted-foreground">
            当前共发现 {decks.length} 个 deck 候选。
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
