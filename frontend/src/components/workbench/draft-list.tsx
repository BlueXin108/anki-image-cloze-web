import { motion } from 'framer-motion'
import { EyeOffIcon, FolderSearch2Icon, ImageIcon, InboxIcon, PackageCheckIcon, RotateCcwIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { DraftListItem, DraftStatus } from '@/types'

const LAYOUT_TRANSITION = {
  duration: 0.55,
  ease: [0.16, 1, 0.3, 1] as const,
}

const statusVariant: Record<DraftStatus, 'secondary' | 'outline' | 'default' | 'destructive'> = {
  route_review: 'secondary',
  route_ready: 'outline',
  llm_review: 'secondary',
  approved: 'default',
  blocked: 'destructive',
  imported: 'outline',
}

const statusLabel: Record<DraftStatus, string> = {
  route_review: '待确认归档',
  route_ready: '待进入挖空',
  llm_review: '待确认结果',
  approved: '已批准',
  blocked: '已拦下',
  imported: '已导入',
}

interface DraftListProps {
  items: DraftListItem[]
  selectedDraftId: string | null
  currentRootPath: string
  onSelect: (draftId: string) => void
  onToggleIgnored: (imageIds: string[], ignored: boolean) => void
}

function normalizePath(value: string): string {
  return value.replaceAll('/', '\\').toLowerCase()
}

function DraftBrowserCard({
  item,
  selected,
  checked,
  onCheck,
  onSelect,
  onQuickIgnore,
}: {
  item: DraftListItem
  selected: boolean
  checked: boolean
  onCheck: (checked: boolean) => void
  onSelect: () => void
  onQuickIgnore: () => void
}) {
  return (
    <Card
      className={cn(
        'cursor-pointer border-border/70 bg-background/85 transition-colors hover:bg-muted/45',
        selected && 'border-amber-300/90 ring-2 ring-amber-300/20',
        item.image.ignored && 'border-dashed opacity-80',
      )}
      onClick={onSelect}
    >
      <CardContent className="flex flex-col gap-2 p-2.5">
        <div className="relative overflow-hidden rounded-xl border border-border/60 bg-muted/20">
          {item.image.source_url ? (
            <img
              src={`${api.baseUrl}${item.image.source_url}`}
              alt={item.image.folder_path || item.image.source_path}
              className="aspect-[16/10] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[16/10] items-center justify-center text-muted-foreground">
              <ImageIcon />
            </div>
          )}
          <label
            className="absolute left-1.5 top-1.5 flex items-center gap-1.5 rounded-full bg-background/92 px-1.5 py-0.5 text-[11px] shadow-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => onCheck(event.target.checked)}
              className="size-3.5 accent-primary"
            />
            勾选
          </label>
          <Badge
            variant={item.image.ignored ? 'destructive' : statusVariant[item.draft.review_status]}
            className="absolute bottom-1.5 right-1.5 text-[11px]"
          >
            {item.image.ignored ? '已忽略' : statusLabel[item.draft.review_status]}
          </Badge>
        </div>

        <div className="space-y-1">
          <div className="truncate text-[13px] font-medium">{item.image.folder_path || '根目录图片'}</div>
          <div className="truncate text-xs text-muted-foreground">{item.image.source_path}</div>
        </div>

        <div className="flex flex-wrap gap-1">
          {item.draft.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
          {item.draft.tags.length === 0 && (
            <Badge variant="outline">无标签</Badge>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div>遮罩 {item.draft.masks.length} · OCR {item.draft.ocr_regions.length}</div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={(event) => {
              event.stopPropagation()
              onQuickIgnore()
            }}
          >
            {item.image.ignored ? <RotateCcwIcon data-icon="inline-start" /> : <EyeOffIcon data-icon="inline-start" />}
            {item.image.ignored ? '恢复' : '忽略'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyQueue({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <Empty className="border-border bg-muted/25">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderSearch2Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function DraftList({
  items,
  selectedDraftId,
  currentRootPath,
  onSelect,
  onToggleIgnored,
}: DraftListProps) {
  const [activeTab, setActiveTab] = useState('folder')
  const [checkedImageIds, setCheckedImageIds] = useState<string[]>([])

  const currentFolderItems = useMemo(() => {
    const normalizedRoot = currentRootPath.trim() ? normalizePath(currentRootPath.trim()) : ''
    if (!normalizedRoot) return items
    return items.filter((item) => normalizePath(item.image.source_path).startsWith(normalizedRoot))
  }, [currentRootPath, items])

  const pendingItems = useMemo(
    () => items.filter((item) => !item.image.ignored && item.draft.review_status !== 'imported'),
    [items],
  )

  const processedItems = useMemo(
    () => items.filter((item) => !item.image.ignored && item.draft.review_status === 'imported'),
    [items],
  )

  const ignoredItems = useMemo(
    () => items.filter((item) => item.image.ignored),
    [items],
  )

  const selectedCount = checkedImageIds.length

  const renderGrid = (list: DraftListItem[], emptyTitle: string, emptyDescription: string) => {
    if (list.length === 0) {
      return <EmptyQueue title={emptyTitle} description={emptyDescription} />
    }

    return (
      <div className="flex flex-col gap-3">
        {list.map((item, index) => (
          <motion.div
            key={item.draft.id}
            layout="position"
            transition={LAYOUT_TRANSITION}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: { delay: Math.min(8, index) * 0.05 } }}
          >
            <DraftBrowserCard
              item={item}
              selected={item.draft.id === selectedDraftId}
              checked={checkedImageIds.includes(item.image.id)}
              onCheck={(checked) =>
                setCheckedImageIds((current) =>
                  checked
                    ? [...current, item.image.id]
                    : current.filter((imageId) => imageId !== item.image.id),
                )
              }
              onSelect={() => onSelect(item.draft.id)}
              onQuickIgnore={() => onToggleIgnored([item.image.id], !item.image.ignored)}
            />
          </motion.div>
        ))}
      </div>
    )
  }

  return (
    <motion.div layout transition={LAYOUT_TRANSITION} className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">复合浏览器</div>
            <div className="text-xs text-muted-foreground">
              当前文件夹预览、待处理、已处理和忽略项都放在这里统一管理。
            </div>
          </div>
          <Badge variant="outline">{pendingItems.length} 待处理</Badge>
        </div>
        <Card className="mt-3 border-border/60 bg-muted/20 shadow-none">
          <CardContent className="flex flex-col gap-3 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current Folder</div>
            <div className="truncate text-sm">{currentRootPath.trim() || '尚未指定扫描目录，当前显示全部项目。'}</div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>预览 {currentFolderItems.length}</span>
              <span>待处理 {pendingItems.length}</span>
              <span>已处理 {processedItems.length}</span>
              <span>已忽略 {ignoredItems.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
        <TabsList className="mx-3 mt-3 grid grid-cols-4">
          <TabsTrigger value="folder">
            <ImageIcon data-icon="inline-start" />
            当前文件夹
          </TabsTrigger>
          <TabsTrigger value="pending">
            <InboxIcon data-icon="inline-start" />
            待处理
          </TabsTrigger>
          <TabsTrigger value="processed">
            <PackageCheckIcon data-icon="inline-start" />
            已处理
          </TabsTrigger>
          <TabsTrigger value="ignored">
            <EyeOffIcon data-icon="inline-start" />
            已忽略
          </TabsTrigger>
        </TabsList>

        <div className="px-3 pt-3">
          <Card className="border-border/60 bg-background/75 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">勾选管理</CardTitle>
              <CardDescription>
                已勾选 {selectedCount} 项。可以一次性忽略，或把已忽略项目恢复回来。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (checkedImageIds.length === 0) return
                  onToggleIgnored(checkedImageIds, true)
                  setCheckedImageIds([])
                }}
                disabled={selectedCount === 0}
              >
                <EyeOffIcon data-icon="inline-start" />
                忽略勾选项
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (checkedImageIds.length === 0) return
                  onToggleIgnored(checkedImageIds, false)
                  setCheckedImageIds([])
                }}
                disabled={selectedCount === 0}
              >
                <RotateCcwIcon data-icon="inline-start" />
                恢复勾选项
              </Button>
              <Button variant="ghost" onClick={() => setCheckedImageIds([])} disabled={selectedCount === 0}>
                清空勾选
              </Button>
            </CardContent>
          </Card>
        </div>

        <ScrollArea className="flex-1 px-3 py-3">
          <TabsContent value="folder" className="mt-0">
            {renderGrid(
              currentFolderItems,
              '这个目录里还没有可预览内容',
              '先扫描一个目录，或重新确认上方输入的目录是否正确。',
            )}
          </TabsContent>

          <TabsContent value="pending" className="mt-0">
            {renderGrid(
              pendingItems,
              '当前没有待处理项目',
              '当扫描结果需要 OCR、LLM 或人工确认时，它们会出现在这里。',
            )}
          </TabsContent>

          <TabsContent value="processed" className="mt-0">
            {renderGrid(
              processedItems,
              '还没有已处理项目',
              '导入完成后的图片会在这里，便于和待处理队列分开查看。',
            )}
          </TabsContent>

          <TabsContent value="ignored" className="mt-0">
            {renderGrid(
              ignoredItems,
              '还没有忽略项',
              '你勾选并忽略的图片会在这里集中管理，随时可以恢复。',
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </motion.div>
  )
}
