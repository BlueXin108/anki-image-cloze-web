import { motion } from 'framer-motion'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  blocked: '已阻止',
  imported: '已导入',
}

function getFileName(path: string): string {
  return path.split(/[/\\]/).pop() || path
}

function getDisplayPath(sourcePath: string, currentRootPath: string): string {
  const normalizedRoot = currentRootPath.trim().replace(/[\\/]+$/, '')
  if (!normalizedRoot) return sourcePath

  const lowerSource = sourcePath.toLowerCase()
  const lowerRoot = normalizedRoot.toLowerCase()
  if (!lowerSource.startsWith(lowerRoot)) return sourcePath

  const trimmed = sourcePath.slice(normalizedRoot.length).replace(/^[\\/]+/, '')
  return trimmed || getFileName(sourcePath)
}

function buildImageUrl(apiBaseUrl: string, path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path
  }
  return `${apiBaseUrl}${path}`
}

interface DraftListProps {
  items: DraftListItem[]
  selectedDraftId: string | null
  currentRootPath: string
  apiBaseUrl: string
  onSelect: (draftId: string) => void
  onToggleIgnored: (imageIdsToToggle: string[], ignored: boolean) => void
}

export function DraftList({
  items,
  selectedDraftId,
  currentRootPath,
  apiBaseUrl,
  onSelect,
  onToggleIgnored,
}: DraftListProps) {
  const activeItems = items.filter((item) => !item.image.ignored)
  const pendingResultCount = activeItems.filter((item) => item.draft.review_status === 'llm_review').length

  return (
    <Card className="flex h-full min-h-0 flex-col border-none bg-transparent shadow-none">
      <CardHeader className="gap-3 border-b border-border/70 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              草稿队列
              <Badge variant="outline">{activeItems.length} 个候选卡片</Badge>
            </CardTitle>
            <CardDescription>用小缩略图快速认图，左侧只负责定位和切换，不再抢主工作区空间。</CardDescription>
          </div>
          <Badge variant="secondary">{pendingResultCount} 待结果确认</Badge>
        </div>

        <div className="grid grid-cols-[60px,84px,minmax(0,1.4fr),minmax(0,1fr),68px] items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <div>预览</div>
          <div>状态</div>
          <div>文件</div>
          <div>归类</div>
          <div className="text-right">操作</div>
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 px-3 pb-3 pt-3">
        <ScrollArea className="h-full pr-1">
          <div className="flex flex-col gap-2">
            {items.map((item, index) => {
              const displayPath = getDisplayPath(item.image.source_path, currentRootPath)
              const previewUrl = buildImageUrl(apiBaseUrl, item.image.source_url || item.draft.source_image_url || null)

              return (
                <motion.div
                  key={item.draft.id}
                  layout="position"
                  transition={LAYOUT_TRANSITION}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(8, index) * 0.05 } }}
                >
                  <button
                    type="button"
                    className={cn(
                      'grid w-full grid-cols-[60px,84px,minmax(0,1.4fr),minmax(0,1fr),68px] items-center gap-3 rounded-xl border border-border/70 bg-background/85 px-3 py-2.5 text-left transition-colors hover:bg-muted/45',
                      item.draft.id === selectedDraftId && 'border-amber-300/90 bg-amber-50/60 ring-2 ring-amber-300/20',
                      item.image.ignored && 'opacity-55',
                    )}
                    onClick={() => onSelect(item.draft.id)}
                  >
                    <div className="flex h-12 w-[52px] items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-muted/20">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={getFileName(item.image.source_path)}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">No preview</span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <Badge variant={statusVariant[item.draft.review_status]}>
                        {statusLabel[item.draft.review_status]}
                      </Badge>
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{getFileName(item.image.source_path)}</div>
                      <div className="truncate text-xs text-muted-foreground">{displayPath}</div>
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-sm">
                        {item.draft.deck ? item.draft.deck : '未匹配 deck'}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {item.image.ignored
                          ? '当前已忽略'
                          : item.draft.tags.length > 0
                            ? item.draft.tags.join(', ')
                            : '无标签'}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation()
                          onToggleIgnored([item.image.id], !item.image.ignored)
                        }}
                      >
                        {item.image.ignored ? '恢复' : '忽略'}
                      </Button>
                    </div>
                  </button>
                </motion.div>
              )
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
