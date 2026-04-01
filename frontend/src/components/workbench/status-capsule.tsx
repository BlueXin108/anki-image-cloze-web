import { memo, useEffect, useMemo, useState, type ComponentProps } from 'react'
import {
  AlertTriangleIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  FolderUpIcon,
  RotateCcwIcon,
  SaveIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type StatusTaskId = 'anki' | 'files' | 'restore' | 'save' | 'export'
export type StatusTaskStateKind = 'idle' | 'running' | 'success' | 'error'

export interface StatusTaskState {
  id: StatusTaskId
  label: string
  detail: string
  progress: number
  state: StatusTaskStateKind
}

function statusLabel(state: StatusTaskStateKind): string {
  switch (state) {
    case 'running':
      return '进行中'
    case 'success':
      return '已完成'
    case 'error':
      return '异常'
    default:
      return '待命'
  }
}

function badgeVariant(state: StatusTaskStateKind): ComponentProps<typeof Badge>['variant'] {
  switch (state) {
    case 'success':
      return 'secondary'
    case 'error':
      return 'destructive'
    default:
      return 'outline'
  }
}

function rowClass(state: StatusTaskStateKind): string {
  switch (state) {
    case 'running':
      return 'border-amber-300/70 bg-amber-50/80 dark:bg-amber-500/10'
    case 'success':
      return 'border-border/70 bg-muted/30'
    case 'error':
      return 'border-destructive/30 bg-destructive/5'
    default:
      return 'border-border/60 border-dashed bg-background/50'
  }
}

function progressClass(state: StatusTaskStateKind): string {
  switch (state) {
    case 'running':
      return '[&_[data-slot=progress-indicator]]:bg-amber-500'
    case 'success':
      return '[&_[data-slot=progress-indicator]]:bg-foreground'
    case 'error':
      return '[&_[data-slot=progress-indicator]]:bg-destructive'
    default:
      return 'opacity-40 [&_[data-slot=progress-indicator]]:bg-border'
  }
}

function capsuleToneClass(task: StatusTaskState): string {
  switch (task.state) {
    case 'running':
      return 'border-amber-300 bg-amber-100 text-amber-900 shadow-sm dark:bg-amber-900/50 dark:text-amber-400'
    case 'success':
      return 'border-foreground bg-foreground text-background shadow-sm'
    case 'error':
      return 'border-destructive bg-destructive text-destructive-foreground shadow-sm'
    default:
      return 'border-border/70 bg-background text-muted-foreground'
  }
}

function AnkiGlyphIcon(props: ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <path
        d="M33.816 38.123v.556h0a2.8 2.8 0 0 1-2.793 2.793h-2.115m-5.958 0H8.75a2.8 2.8 0 0 1-2.794-2.793V6.793A2.8 2.8 0 0 1 8.75 4h22.274a2.8 2.8 0 0 1 2.793 2.793v14.229M9.564 8.399h15.245M9.564 13.24h4.282m2.724 0h4.282M9.68 18.244h7.634m-7.75 7.913h8.379M9.564 31.44h3.724m-3.84 5.005h8.844"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M25.483 15.079a2.6 2.6 0 0 0-.721.093c-.977.326-1.466 1.256-1.699 2.118s-.28 1.815-.302 2.77s-.047 1.931-.117 2.722s-.279 1.374-.395 1.537s-.629.535-1.35.838c-.722.326-1.63.628-2.537.954c-.908.326-1.793.675-2.56 1.14c-.745.466-1.49 1.21-1.49 2.258s.721 1.769 1.49 2.258s1.629.814 2.536 1.163c.908.326 1.816.629 2.537.955s1.234.675 1.35.837s.303.768.373 1.56c.07.79.093 1.746.116 2.723c.023.954.093 1.909.302 2.77s.699 1.792 1.676 2.118c.978.325 1.909-.14 2.607-.722s1.303-1.303 1.885-2.048s1.164-1.536 1.7-2.118s1.023-.978 1.233-1.024c.186-.07.814-.047 1.582.116s1.7.466 2.607.722c.931.256 1.839.512 2.723.558c.885.047 1.909-.116 2.537-.954c.605-.838.466-1.862.14-2.7s-.838-1.629-1.373-2.42c-.536-.791-1.094-1.583-1.49-2.258s-.605-1.28-.605-1.49c0-.232.256-.93.768-1.722c.489-.79 1.164-1.698 1.746-2.583c.465-.698.86-1.42 1.117-2.141c.232-.745.302-1.653-.233-2.398c-.605-.837-1.63-1-2.537-.954c-.884.046-1.815.303-2.746.559s-1.84.558-2.607.721s-1.396.163-1.582.116c-.187-.046-.699-.441-1.234-1.023c-.535-.605-1.094-1.374-1.676-2.142s-1.187-1.49-1.885-2.071c-.535-.443-1.187-.815-1.885-.838Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function taskIcon(task: StatusTaskState) {
  if (task.state === 'running') {
    return <Spinner className="size-3.5" />
  }

  switch (task.id) {
    case 'anki':
      return <AnkiGlyphIcon className="size-3.5" />
    case 'files':
      return <FolderUpIcon className="size-3.5" />
    case 'restore':
      return <RotateCcwIcon className="size-3.5" />
    case 'save':
      return <SaveIcon className="size-3.5" />
    case 'export':
      return <DownloadIcon className="size-3.5" />
    default:
      return <AlertTriangleIcon className="size-3.5" />
  }
}

export const StatusCapsule = memo(function StatusCapsule({
  tasks,
  side = 'left',
}: {
  tasks: StatusTaskState[]
  side?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [lastStatusRefreshAt, setLastStatusRefreshAt] = useState(() => Date.now())

  const shouldAutoExpand = useMemo(
    () => tasks.some((task) => task.state === 'error' || (task.state === 'running' && task.id !== 'save')),
    [tasks],
  )

  useEffect(() => {
    setLastStatusRefreshAt(Date.now())
  }, [tasks])

  useEffect(() => {
    if (shouldAutoExpand) {
      setOpen(true)
    }
  }, [shouldAutoExpand])

  useEffect(() => {
    if (!open || isHovered) return

    const elapsed = Date.now() - lastStatusRefreshAt
    if (elapsed >= 5000) {
      setOpen(false)
      return
    }

    const timeoutId = window.setTimeout(() => {
      setOpen(false)
    }, 5000 - elapsed)

    return () => window.clearTimeout(timeoutId)
  }, [isHovered, lastStatusRefreshAt, open])

  const sideClass = side === 'left' ? 'left-4 items-start' : 'right-4 items-end'

  return (
    <TooltipProvider delayDuration={120}>
      <div
        className={cn('pointer-events-none fixed bottom-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col gap-3', sideClass)}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
      >
        
        {/* 详情面板 - 添加了过渡动画 animate-in */}
        {open && (
          <Card className="pointer-events-auto w-[min(320px,calc(100vw-2rem))] rounded-[18px] border-border/70 bg-background/60 shadow-xl shadow-black/5 backdrop-blur-xl animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200">
            <CardHeader className="pb-0 pt-0 px-4">
              <div className="flex items-center justify-between gap-2.5">
                <CardTitle className="text-sm font-semibold text-foreground/80">任务状态</CardTitle>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-7 rounded-full px-2.5 text-xs text-muted-foreground hover:bg-muted/50" 
                  onClick={() => setOpen(false)} 
                  aria-label="收起状态面板"
                >
                  收起
                  <ChevronsUpDownIcon className="ml-1 size-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 px-4 pb-4">
              {tasks.map((task) => (
                <div key={task.id} className={cn('rounded-xl border p-3 transition-colors', rowClass(task.state))}>
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-full border bg-background',
                        capsuleToneClass(task),
                      )}
                    >
                      {taskIcon(task)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-foreground">{task.label}</div>
                        <Badge variant={badgeVariant(task.state)} className="text-[10px] h-4 px-1.5 py-0">
                          {statusLabel(task.state)}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-xs leading-tight text-muted-foreground/80">{task.detail}</div>
                      
                      <div className="mt-2.5 flex items-center gap-2.5">
                        <Progress value={task.progress} className={cn('h-1.5', progressClass(task.state))} />
                        <div className={cn('w-9 text-right text-[11px] tabular-nums tracking-tight', task.progress === 100 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                          {Math.round(task.progress)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* 底部真正的“胶囊栏” - 移除Card，使用原生div，圆角调整为 rounded-full */}
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/50 bg-background/70 p-1.5 pr-2 shadow-lg shadow-black/5 backdrop-blur-md transition-all hover:shadow-xl hover:bg-background/90 group">
          
          {/* 图标叠加区：使用 -space-x-1.5 制造头像组重叠的紧凑视觉，并修复嵌套 button 语意问题 */}
          <div 
            role="button"
            tabIndex={0}
            onClick={() => setOpen((current) => !current)}
            className="flex items-center space-x-1.5 pl-1 cursor-pointer"
            aria-label={open ? '收起状态面板' : '展开状态面板'}
          >
            {tasks.map((task, index) => (
              <Tooltip key={task.id}>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      'relative flex size-6 items-center justify-center rounded-full border-2 border-background transition-transform hover:z-10 hover:scale-[1.01] cursor-default',
                      capsuleToneClass(task),
                      task.state === 'idle' && 'border-dashed',
                      /* 确保第一个元素不被后面的盖住，保持视觉层级 */
                      `z-[${tasks.length - index}]`
                    )}
                  >
                    {taskIcon(task)}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={12} className="font-sans">
                  <div className="flex max-w-[200px] flex-col gap-0.5">
                    <div className="font-medium text-sm">
                      {task.label} <span className="text-muted-foreground font-normal ml-1">· {statusLabel(task.state)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{task.detail}</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          <div className="h-4 w-px bg-border/50 mx-1" aria-hidden="true" />

          {/* 右侧控制按钮 */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-full px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            onClick={() => setOpen((current) => !current)}
          >
            状态
            <ChevronsUpDownIcon className="ml-1.5 size-3.5 opacity-70" />
          </Button>
        </div>
        
      </div>
    </TooltipProvider>
  )
})
