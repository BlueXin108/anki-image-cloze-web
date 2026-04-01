import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { DraftListItem } from '@/types'

interface ManualDraftListProps {
  items: DraftListItem[]
  selectedDraftId: string | null
  onSelect: (draftId: string) => void
}

function imageName(sourcePath: string): string {
  return sourcePath.split(/[\\/]/).pop() || sourcePath
}

export const ManualDraftList = memo(function ManualDraftList({ items, selectedDraftId, onSelect }: ManualDraftListProps) {
  const activeItems = items.filter((item) => !item.image.ignored)

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
              const isExported = item.draft.review_status === 'imported'

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
                      {item.image.source_url ? (
                        <img src={item.image.source_url} alt={imageName(item.image.source_path)} className="h-full w-full object-cover" />
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
                      <div className="truncate text-sm font-medium leading-tight text-foreground/90">
                        {imageName(item.image.source_path)}
                      </div>
                      
                      {/* 第二行：路径 */}
                      <div className="truncate text-[11px] text-muted-foreground/80">
                        {item.image.folder_path || '直接上传'}
                      </div>
                      
                      {/* 第三行：数据统计（用 · 分隔符替代 Badge 堆叠） */}
                      <div className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground/70">{maskCount} 遮罩</span>
                        <span className="text-border/80">|</span>
                        <span className="truncate">{item.draft.deck?.trim() || '未分牌组'}</span>
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
