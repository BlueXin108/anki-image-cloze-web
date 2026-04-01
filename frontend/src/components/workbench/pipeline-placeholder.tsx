import { BookOpenCheckIcon, Layers3Icon, ScanTextIcon, WorkflowIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card'

export function PipelinePlaceholder() {
  const items = [
    {
      title: '自动识别',
      description: '后面可以把 OCR 和基础归类慢慢接回来。',
      icon: ScanTextIcon,
    },
    {
      title: '建议遮罩',
      description: '先预留自动建议入口，等规则稳定后再上线。',
      icon: Layers3Icon,
    },
    {
      title: '批量审核',
      description: '后续再补一套成批检查和确认的节奏。',
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
              <CardTitle className="text-lg tracking-tight md:text-xl">流水线区域预留中</CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                这里先保留自动链路的入口位，等手动流程稳定以后，再把识别、建议和批量审核一段段接回来。
              </CardDescription>
            </div>
          </div>

          <Badge variant="outline" className="w-fit rounded-full bg-background/80">
            <Layers3Icon className="size-3.5" />
            先不和手动流程抢焦点
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
