import { BookOpenCheckIcon, Layers3Icon, ScanTextIcon, WorkflowIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card'

export function PipelinePlaceholder() {
  const items = [
    {
      title: '自动识别',
      description: '以后会在这里提供 OCR 和基础分类，帮助你先做一轮初筛。',
      icon: ScanTextIcon,
    },
    {
      title: '建议遮罩',
      description: '以后会在这里给出可参考的遮罩建议，方便你再手动微调。',
      icon: Layers3Icon,
    },
    {
      title: '批量审核',
      description: '以后会支持成批查看和确认，减少逐张重复操作。',
      icon: BookOpenCheckIcon,
    },
  ]

  return (
    <Card className="rounded-[28px] border border-border/70 bg-background/90 shadow-lg shadow-slate-900/5">
      <CardContent className="flex flex-col gap-5 p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/35 text-foreground">
              <WorkflowIcon className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg tracking-tight md:text-xl">自动处理功能正在规划中</CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                当前版本先专注把手动处理做好。等后续功能开放后，你可以在这里使用自动识别、建议遮罩和批量检查。
              </CardDescription>
            </div>
          </div>

          <Badge variant="outline" className="w-fit rounded-full bg-background/80">
            <Layers3Icon className="size-3.5" />
            现阶段建议优先使用手动处理
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {items.map((item) => (
            <div key={item.title} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <item.icon className="size-4" />
                {item.title}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">{item.description}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
