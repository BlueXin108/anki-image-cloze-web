import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { DraftListItem } from '@/types'

interface ManualDraftListProps {
  items: DraftListItem[]
  selectedDraftId: string | null
  apiBaseUrl: string
  onSelect: (draftId: string) => void
}

function buildImageUrl(apiBaseUrl: string, path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path
  }
  return `${apiBaseUrl}${path}`
}

function imageName(sourcePath: string): string {
  return sourcePath.split(/[\\/]/).pop() || sourcePath
}

export function ManualDraftList({ items, selectedDraftId, apiBaseUrl, onSelect }: ManualDraftListProps) {
  const activeItems = items.filter((item) => !item.image.ignored)

  return (
    <Card className="flex h-full min-h-0 flex-col border-none bg-transparent shadow-none">
      <CardHeader className="gap-2 border-b border-border/70 px-4 py-4">
        <CardTitle className="flex items-center gap-2">
          手动模式
          <Badge variant="outline">{activeItems.length} 张图片</Badge>
        </CardTitle>
        <CardDescription>这里按图片聚合显示。每个遮罩都会独立生成卡片，但主列表先保持按图片查看。</CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-3 py-3">
        <ScrollArea className="h-full pr-1">
          <div className="flex flex-col gap-3">
            {activeItems.map((item) => {
              const isSelected = item.draft.id === selectedDraftId
              const previewUrl = buildImageUrl(apiBaseUrl, item.image.source_url || item.draft.source_image_url || null)
              const maskCount = item.draft.masks.length
              return (
                <Button
                  key={item.draft.id}
                  variant="ghost"
                  className={cn(
                    'h-auto justify-start rounded-2xl border border-border/60 bg-background/85 px-3 py-3 text-left hover:bg-muted/40',
                    isSelected && 'border-amber-300/90 bg-amber-50/70 ring-2 ring-amber-300/20',
                  )}
                  onClick={() => onSelect(item.draft.id)}
                >
                  <div className="flex w-full gap-3">
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/20">
                      {previewUrl ? (
                        <img src={previewUrl} alt={imageName(item.image.source_path)} className="h-full w-full object-cover" />
                      ) : (
                        <div className="text-xs text-muted-foreground">无预览</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="truncate text-sm font-semibold">{imageName(item.image.source_path)}</div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{maskCount} 个遮罩</Badge>
                        <Badge variant="outline">预计 {maskCount} 张卡</Badge>
                        <Badge variant={item.draft.front_image_url ? 'outline' : 'secondary'}>
                          {item.draft.front_image_url ? '已生成预览' : '待生成预览'}
                        </Badge>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{item.draft.deck || '尚未填写 deck'}</div>
                    </div>
                  </div>
                </Button>
              )
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
