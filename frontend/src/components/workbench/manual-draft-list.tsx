import { memo, useEffect, useState, type KeyboardEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DraftListItem } from '@/types'

interface ManualDraftListProps {
  items: DraftListItem[]
  selectedDraftId: string | null
  onSelect: (draftId: string) => void
  onRemoveItem?: (draftId: string) => void
  mobileLayout?: boolean
}

function imageName(sourcePath: string): string {
  return sourcePath.split(/[\\/]/).pop() || sourcePath
}

function handleSelectKeyDown(event: KeyboardEvent<HTMLDivElement>, onSelect: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onSelect()
  }
}

export const ManualDraftList = memo(function ManualDraftList({ items, selectedDraftId, onSelect, onRemoveItem, mobileLayout = false }: ManualDraftListProps) {
  const activeItems = items.filter((item) => !item.image.ignored)
  const [loadedImageIds, setLoadedImageIds] = useState<Record<string, boolean>>({})
  const imageStateKey = activeItems.map((item) => `${item.image.id}:${item.image.source_url ?? ''}`).join('|')

  useEffect(() => {
    setLoadedImageIds((current) => {
      const next: Record<string, boolean> = {}
      activeItems.forEach((item) => {
        if (current[item.image.id]) {
          next[item.image.id] = true
        }
      })
      return next
    })
  }, [activeItems, imageStateKey])

  if (mobileLayout) {
    return (
      <Card className="flex min-h-0 flex-col border-border/70 bg-background/90 shadow-none">
        <CardHeader className="gap-2 border-b border-border/70 px-4 py-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span>当前图片</span>
            <Badge variant="secondary" className="px-2 py-0 text-[10px]">
              {activeItems.length} 张
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            点击一张图，就会在下方切到对应内容；缩略图在左，名称和牌组信息在右。
          </CardDescription>
        </CardHeader>

        {/* 关键修复：加入 flex-1 min-h-0，配合 ScrollArea 的 h-full，彻底解决滚动失效问题 */}
        <CardContent className="flex-1 min-h-0 px-3 py-3">
          <ScrollArea className="h-full pr-2">
            <div className="flex flex-col gap-2.5">
              {activeItems.map((item) => {
                const isSelected = item.draft.id === selectedDraftId
                const maskCount = item.draft.masks.length

                return (
                  <div
                    key={item.draft.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      'group relative flex h-auto w-full flex-row items-start justify-start rounded-2xl border px-3 py-3 text-left transition-all',
                      isSelected
                        ? 'border-amber-300/90 bg-amber-50/80 ring-1 ring-amber-300/40'
                        : 'border-border/60 bg-background/80 hover:border-border hover:bg-muted/30',
                    )}
                    onClick={() => onSelect(item.draft.id)}
                    onKeyDown={(event) => handleSelectKeyDown(event, () => onSelect(item.draft.id))}
                  >
                    <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/30">
                      {!loadedImageIds[item.image.id] ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
                      {item.image.source_url ? (
                        <img
                          src={item.image.source_url}
                          alt={imageName(item.image.source_path)}
                          loading="lazy"
                          decoding="async"
                          className={cn('h-full w-full object-cover transition-opacity duration-200', loadedImageIds[item.image.id] ? 'opacity-100' : 'opacity-0')}
                          onLoad={() => setLoadedImageIds((current) => ({ ...current, [item.image.id]: true }))}
                          onError={() => setLoadedImageIds((current) => ({ ...current, [item.image.id]: true }))}
                        />
                      ) : (
                        <div className="text-[10px] text-muted-foreground">无预览</div>
                      )}
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 text-white pointer-events-none">
                        <span className="text-xl font-bold leading-none drop-shadow-md">{maskCount}</span>
                        <span className="text-[9px] font-semibold leading-tight opacity-90 drop-shadow-md text-slate-100">mask</span>
                      </div>
                    </div>

                    <div className="ml-3 flex min-w-0 flex-1 flex-col justify-center space-y-1.5 py-0.5">
                      <div className="line-clamp-2 text-sm font-medium leading-tight text-foreground/90">
                        {imageName(item.image.source_path)}
                      </div>
                      <div className="mt-0.5 max-w-full text-xs font-medium text-muted-foreground/80">
                        <span className="inline-block w-full truncate">{item.draft.deck?.trim() || '未分牌组'}</span>
                      </div>
                    </div>
                    {onRemoveItem && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-6 w-6 rounded-md text-muted-foreground/30 hover:bg-muted hover:text-muted-foreground active:bg-muted/80"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemoveItem(item.draft.id)
                        }}
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    )
  }

  return (
      <Card className="flex h-full min-h-0 flex-col border-0! ring-0 outline-0 border-none! bg-transparent shadow-none">
      <CardHeader className="gap-2 border-b border-border/70 px-5 py-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>图片选择</span>
          <Badge variant="secondary" className="text-[10px] px-2 py-0 bg-transparent">
            {activeItems.length} 张
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs line-clamp-2">
          这里会列出当前项目里的所有图片；点一张，就会在右侧切到对应的编辑和预览内容。
        </CardDescription>
      </CardHeader>
      
      <CardContent className="min-h-0 flex-1  px-3 py-3">
        <ScrollArea className="h-full pr-3"> {/* pr-3 给滚动条留出足够的呼吸空间 */}
          <div className="flex flex-col gap-2"> {/* gap-3 缩小为 gap-2 */}
            {activeItems.map((item) => {
              const isSelected = item.draft.id === selectedDraftId
              const maskCount = item.draft.masks.length

              return (
                <div
                  key={item.draft.id}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'group relative h-auto w-full justify-start rounded-xl border px-2.5 py-2.5 text-left transition-all',
                    isSelected 
                      ? 'border-amber-300/90 bg-amber-50/70 ring-1 ring-amber-300/40' 
                      : 'border-transparent bg-background/50 hover:border-border/60 hover:bg-muted/40',
                  )}
                  onClick={() => onSelect(item.draft.id)}
                  onKeyDown={(event) => handleSelectKeyDown(event, () => onSelect(item.draft.id))}
                >
                  <div className="flex w-full min-w-0 items-center gap-3">
                    <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30 shadow-sm">
                      {!loadedImageIds[item.image.id] ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
                      {item.image.source_url ? (
                        <img
                          src={item.image.source_url}
                          alt={imageName(item.image.source_path)}
                          loading="lazy"
                          decoding="async"
                          className={cn('h-full w-full object-cover transition-opacity duration-200', loadedImageIds[item.image.id] ? 'opacity-100' : 'opacity-0')}
                          onLoad={() => setLoadedImageIds((current) => ({ ...current, [item.image.id]: true }))}
                          onError={() => setLoadedImageIds((current) => ({ ...current, [item.image.id]: true }))}
                        />
                      ) : (
                        <div className="text-[10px] text-muted-foreground">无预览</div>
                      )}
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 text-white pointer-events-none">
                        <span className="text-lg font-bold leading-none drop-shadow-md">{maskCount}</span>
                        <span className="text-[9px] font-semibold leading-tight opacity-90 drop-shadow-md text-slate-100">mask</span>
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col justify-center space-y-1">
                      <div className="line-clamp-2 text-sm font-medium leading-tight text-foreground/90">
                        {imageName(item.image.source_path)}
                      </div>
                      <div className="mt-1 text-[11px] leading-4 text-muted-foreground/80 line-clamp-2">
                        {item.draft.deck?.trim() || '未分牌组'}
                      </div>
                    </div>
                    {onRemoveItem && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute left-2 top-2 hidden h-5 w-5 shrink-0 rounded text-muted-foreground/30 hover:bg-muted/80 hover:text-muted-foreground group-hover:inline-flex"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemoveItem(item.draft.id)
                        }}
                      >
                        <XIcon className="size-3" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
})
