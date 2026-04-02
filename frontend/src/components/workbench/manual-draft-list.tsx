import { memo, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { DraftListItem } from '@/types'

interface ManualDraftListProps {
  items: DraftListItem[]
  selectedDraftId: string | null
  onSelect: (draftId: string) => void
  mobileLayout?: boolean
}

function imageName(sourcePath: string): string {
  return sourcePath.split(/[\\/]/).pop() || sourcePath
}

export const ManualDraftList = memo(function ManualDraftList({ items, selectedDraftId, onSelect, mobileLayout = false }: ManualDraftListProps) {
  const activeItems = items.filter((item) => !item.image.ignored)
  const [loadedImageIds, setLoadedImageIds] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setLoadedImageIds({})
  }, [items])

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
            已切换为紧凑列表，文件名和牌组将换行展开，方便快速滑动浏览。
          </CardDescription>
        </CardHeader>

        {/* 关键修复：加入 flex-1 min-h-0，配合 ScrollArea 的 h-full，彻底解决滚动失效问题 */}
        <CardContent className="flex-1 min-h-0 px-3 py-3">
          <ScrollArea className="h-full pr-2">
            <div className="flex flex-col gap-2.5">
              {activeItems.map((item) => {
                const isSelected = item.draft.id === selectedDraftId
                const isExported = item.draft.review_status === 'imported' || item.draft.review_status === 'packaged'
                const maskCount = item.draft.masks.length

                return (
                  <Button
                    key={item.draft.id}
                    variant="ghost"
                    className={cn(
                      // 1. 改为横向排布 (flex-row)，大幅度压缩单项高度
                      'h-auto w-full flex-row items-start justify-start rounded-2xl border px-3 py-3 text-left transition-all',
                      isSelected
                        ? 'border-amber-300/90 bg-amber-50/80 ring-1 ring-amber-300/40'
                        : 'border-border/60 bg-background/80 hover:border-border hover:bg-muted/30',
                    )}
                    onClick={() => onSelect(item.draft.id)}
                  >
                    {/* 2. 图片尺寸从 aspect-[4/3] w-full 缩小为固定的 size-20 (80x80px) */}
                    <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/30">
                      {!loadedImageIds[item.image.id] ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
                      {item.image.source_url ? (
                        <img
                          src={item.image.source_url}
                          alt={imageName(item.image.source_path)}
                          className={cn('h-full w-full object-cover transition-opacity duration-200', loadedImageIds[item.image.id] ? 'opacity-100' : 'opacity-0')}
                          onLoad={() => setLoadedImageIds((current) => ({ ...current, [item.image.id]: true }))}
                          onError={() => setLoadedImageIds((current) => ({ ...current, [item.image.id]: true }))}
                        />
                      ) : (
                        <div className="text-[10px] text-muted-foreground">无预览</div>
                      )}
                      
                      {/* 导出状态圆点 */}
                      <div
                        className={cn(
                          'absolute right-1 top-1 size-2.5 rounded-full border-2 border-background shadow-sm',
                          isExported ? 'bg-emerald-400' : 'bg-amber-400',
                        )}
                      />
                    </div>

                    {/* 3. 右侧信息区：利用 min-w-0 防止文字溢出撑破 flex，使用 line-clamp 保证能多行展示 */}
                    <div className="ml-3 flex min-w-0 flex-1 flex-col justify-center space-y-1.5 py-0.5">
                      
                      {/* 文件名：最多允许两行 */}
                      <div className="line-clamp-2 text-sm font-medium leading-tight text-foreground/90">
                        {imageName(item.image.source_path)}
                      </div>
                      
                      {/* 路径：单行截断 */}
                      <div className="truncate text-[11px] leading-4 text-muted-foreground/80">
                        {item.image.folder_path || '直接上传图片'}
                      </div>
                      
                      {/* 数据信息与牌组：取消了庞大的 Deck 灰底框，改为紧凑的文字排版 */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="font-medium text-amber-600/90 dark:text-amber-500/90">{maskCount} 遮罩</span>
                        <span className="text-border/80">|</span>
                        <span className="line-clamp-1 flex-1 text-foreground/70">{item.draft.deck?.trim() || '未分牌组'}</span>
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

  return (
    <Card className="flex h-full min-h-0 flex-col border-0! ring-0 outline-0 border-none! bg-transparent shadow-none">
      <CardHeader className="gap-2 border-b border-border/70 px-5 py-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>手动项目</span>
          <Badge variant="secondary" className="text-[10px] px-2 py-0 bg-transparent">
            {activeItems.length} 张
          </Badge>
        </CardTitle>
        {/* 描述文字在极窄视图下其实也很占空间，如果非必要可以加上 line-clamp-2 限制行数 */}
        <CardDescription className="text-xs line-clamp-2">
          这里按图片聚合显示，内部遮挡会在工作区拆成卡片。
        </CardDescription>
      </CardHeader>
      
      <CardContent className="min-h-0 flex-1  px-3 py-3">
        <ScrollArea className="h-full pr-3"> {/* pr-3 给滚动条留出足够的呼吸空间 */}
          <div className="flex flex-col gap-2"> {/* gap-3 缩小为 gap-2 */}
            {activeItems.map((item) => {
              const isSelected = item.draft.id === selectedDraftId
              const maskCount = item.draft.masks.length
              const isExported = item.draft.review_status === 'imported' || item.draft.review_status === 'packaged'

              return (
                <Button
                  key={item.draft.id}
                  variant="ghost"
                  className={cn(
                    // 1. 容器调整：减小 padding，让圆角更精致
                    'h-auto w-full justify-start rounded-xl border px-2.5 py-2.5 text-left transition-all',
                    isSelected 
                      ? 'border-amber-300/90 bg-amber-50/70 ring-1 ring-amber-300/40' 
                      : 'border-transparent bg-background/50 hover:border-border/60 hover:bg-muted/40',
                  )}
                  onClick={() => onSelect(item.draft.id)}
                >
                  {/* 2. 内部布局：减小 gap */}
                  <div className="flex w-full min-w-0 items-center gap-3">
                    
                    {/* 3. 缩略图优化：从 size-24(96px) 缩小到 size-14(56px) 或 size-16(64px) */}
                    <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30 shadow-sm">
                      {!loadedImageIds[item.image.id] ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
                      {item.image.source_url ? (
                        <img
                          src={item.image.source_url}
                          alt={imageName(item.image.source_path)}
                          className={cn('h-full w-full object-cover transition-opacity duration-200', loadedImageIds[item.image.id] ? 'opacity-100' : 'opacity-0')}
                          onLoad={() => setLoadedImageIds((current) => ({ ...current, [item.image.id]: true }))}
                          onError={() => setLoadedImageIds((current) => ({ ...current, [item.image.id]: true }))}
                        />
                      ) : (
                        <div className="text-[10px] text-muted-foreground">无预览</div>
                      )}
                      
                      {/* 💡 神来之笔：用绝对定位的指示圆点替代庞大的“已导出/待导出” Badge */}
                      <div 
                        className={cn(
                          "absolute right-1 top-1 size-2.5 rounded-full border-2 border-background shadow-sm",
                          isExported ? "bg-emerald-400" : "bg-amber-400"
                        )}
                        title={isExported ? '已导出' : '待导出'}
                      />
                    </div>

                    {/* 4. 信息区优化：严格控制 min-w-0 防止 flex 子项撑破父容器 */}
                    <div className="flex min-w-0 flex-1 flex-col justify-center space-y-1">
                      {/* 第一行：图片名称 */}
                      <div className="line-clamp-2 text-sm font-medium leading-tight text-foreground/90">
                        {imageName(item.image.source_path)}
                      </div>
                      
                      {/* 第二行：路径 */}
                      <div className="line-clamp-2 text-[11px] leading-4 text-muted-foreground/80">
                        {item.image.folder_path || '直接上传'}
                      </div>
                      
                      {/* 第三行：数据统计（用 · 分隔符替代 Badge 堆叠） */}
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground/70">{maskCount} 遮罩</span>
                        <span className="text-border/80">|</span>
                        <span className="line-clamp-2">{item.draft.deck?.trim() || '未分牌组'}</span>
                      </div>
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
})
