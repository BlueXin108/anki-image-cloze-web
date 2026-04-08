import { ImageDownIcon, Loader2Icon, Settings2Icon } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

export type ProcessingProgressView = {
  percent: number
  completed: number
  total: number
  fileName: string
  stageLabel: string
}

export const MOBILE_FOOTER_CHECKLIST = [
  'Web 加载处理库，本地处理',
  '支持 PWA，安装到桌面',
] as const

export function WorkspaceLoadingShell({ mobile }: { mobile: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border/70 bg-background/92 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Skeleton className="size-11 rounded-2xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-52 rounded-full" />
            <Skeleton className="h-4 w-full max-w-xl rounded-full" />
          </div>
        </div>
      </div>
      <div className={mobile ? 'flex flex-col gap-4' : 'grid min-h-[calc(100vh-220px)] grid-cols-[340px_minmax(0,1fr)] gap-4'}>
        <div className="rounded-2xl border border-border/70 bg-background/90 p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-28 rounded-full" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/90 p-4 shadow-sm">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-40 rounded-full" />
            <Skeleton className="aspect-[4/3] w-full rounded-3xl" />
            <div className="grid gap-4 xl:grid-cols-2">
              <Skeleton className="h-44 w-full rounded-2xl" />
              <Skeleton className="h-44 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ImportCompressionOverlay({
  open,
  progress,
}: {
  open: boolean
  progress: ProcessingProgressView | null
}) {
  if (!open || !progress) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/58 px-4 backdrop-blur-md animate-in fade-in duration-300">
      <Card className="w-full max-w-xl border-border/70 bg-background/94 shadow-2xl shadow-slate-900/10 animate-in zoom-in-95 duration-300">
        <CardHeader className="gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-muted/30 text-foreground/85">
              <ImageDownIcon className="size-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle>正在预处理导入图片</CardTitle>
              <CardDescription>已开启导入压缩，当前会先统一缩图和压缩，再加入项目。</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border/60 bg-muted/15 p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="truncate font-medium text-foreground/88">{progress.stageLabel}</div>
              <div className="shrink-0 text-xs tabular-nums text-muted-foreground">{progress.percent}%</div>
            </div>
            <div className="mt-3">
              <Progress value={progress.percent} className="h-2" />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="truncate">{progress.fileName}</span>
              <span className="shrink-0">{Math.min(progress.completed + 1, progress.total)}/{progress.total}</span>
            </div>
          </div>
          <div className="text-xs leading-5 text-muted-foreground">
            大图压缩时会比普通导入更久一些；处理完成后会自动回到工作台。
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function ProjectOptimizationOverlay({
  open,
  progress,
}: {
  open: boolean
  progress: ProcessingProgressView | null
}) {
  if (!open || !progress) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/58 px-4 backdrop-blur-md animate-in fade-in duration-300">
      <Card className="w-full max-w-xl border-border/70 bg-background/94 shadow-2xl shadow-slate-900/10 animate-in zoom-in-95 duration-300">
        <CardHeader className="gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-muted/30 text-foreground/85">
              <ImageDownIcon className="size-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle>正在压缩当前项目</CardTitle>
              <CardDescription>会按默认档位压缩图片，并同步保留裁切与遮罩位置。</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border/60 bg-muted/15 p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="truncate font-medium text-foreground/88">{progress.stageLabel}</div>
              <div className="shrink-0 text-xs tabular-nums text-muted-foreground">{progress.percent}%</div>
            </div>
            <div className="mt-3">
              <Progress value={progress.percent} className="h-2" />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="truncate">{progress.fileName || '正在整理项目'}</span>
              <span className="shrink-0">{Math.min(progress.completed + 1, progress.total)}/{progress.total}</span>
            </div>
          </div>
          <div className="text-xs leading-5 text-muted-foreground">
            压缩完成后，当前项目会自动换成更轻的本地图片版本。
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function DeferredDialogFallback({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/58 px-4 backdrop-blur-md animate-in fade-in duration-300">
      <Card className="w-full max-w-lg border-border/70 bg-background/94 shadow-2xl shadow-slate-900/10 animate-in zoom-in-95 duration-300">
        <CardHeader className="gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-muted/30 text-foreground/85">
              <Settings2Icon className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground shrink-0" />
          <Progress value={65} className="h-2 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
