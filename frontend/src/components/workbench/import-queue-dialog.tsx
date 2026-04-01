import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  Clock3Icon,
  LoaderCircleIcon,
  Trash2Icon,
  XCircleIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'

export interface ImportQueueItemView {
  draftId: string
  label: string
  status: 'pending' | 'running' | 'success' | 'failed'
  message?: string
}

interface ImportQueueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: ImportQueueItemView[]
  running: boolean
  onRemoveItem: (draftId: string) => void
  onClearFinished: () => void
  title?: string
  description?: string
  runningText?: string
  finishedText?: string
  removeFinishedLabel?: string
}

const statusVariant = {
  pending: 'outline',
  running: 'secondary',
  success: 'default',
  failed: 'destructive',
} as const

const statusLabel = {
  pending: '等待中',
  running: '导入中',
  success: '已完成',
  failed: '失败',
} as const

const FLOAT_TRANSITION = {
  duration: 0.36,
  ease: [0.22, 1, 0.36, 1] as const,
}

export function ImportQueueDialog({
  open,
  onOpenChange,
  items,
  running,
  onRemoveItem,
  onClearFinished,
  title = '导入队列',
  description = '这里会实时显示每一张卡片的导入进度，而不是等全部结束后才告诉你结果。',
  runningText = '导入仍在进行中，请保持窗口打开。',
  finishedText = '本轮导入已经结束。',
  removeFinishedLabel = '移除已结束项',
}: ImportQueueDialogProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [drag, setDrag] = useState<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)

  useEffect(() => {
    if (!drag) return

    const handleMove = (event: PointerEvent) => {
      const nextX = drag.baseX + (event.clientX - drag.startX)
      const nextY = drag.baseY + (event.clientY - drag.startY)
      setPosition({ x: nextX, y: nextY })
    }

    const handleUp = () => {
      setDrag(null)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [drag])

  if (items.length === 0 && !open) {
    return null
  }

  const doneCount = items.filter((item) => item.status === 'success' || item.status === 'failed').length
  const runningCount = items.filter((item) => item.status === 'running').length
  const progress = items.length === 0 ? 0 : Math.round((doneCount / items.length) * 100)

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="import-queue-open"
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={FLOAT_TRANSITION}
          className="fixed bottom-4 left-4 z-40 w-[min(560px,calc(100vw-2rem))]"
          style={{ x: position.x, y: position.y }}
        >
          <Card className="border-border/80 bg-background/96 shadow-2xl shadow-amber-950/15 backdrop-blur">
            <CardHeader
              className="flex cursor-move flex-row items-start justify-between gap-3"
              onPointerDown={(event) =>
                setDrag({
                  startX: event.clientX,
                  startY: event.clientY,
                  baseX: position.x,
                  baseY: position.y,
                })
              }
            >
              <div>
                <CardTitle className="flex items-center gap-2">
                  {title}
                  <Badge variant="outline">{items.length} 项</Badge>
                </CardTitle>
                <CardDescription>{description}</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onOpenChange(false)}
              >
                <ChevronDownIcon />
              </Button>
            </CardHeader>

            <CardContent className="flex flex-col gap-3">
              <Card className="border-border/70 bg-background/80 shadow-none">
                <CardHeader>
                  <CardTitle>整体进度</CardTitle>
                  <CardDescription>
                    已完成 {doneCount} / {items.length} 项
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Progress value={progress} className="h-2" />
                  <div className="text-sm text-muted-foreground">
                    {running ? runningText : finishedText}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {runningCount > 0 && <Badge variant="secondary">{runningCount} 项进行中</Badge>}
                    <Button variant="outline" onClick={onClearFinished} disabled={doneCount === 0}>
                      <Trash2Icon data-icon="inline-start" />
                      {removeFinishedLabel}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <ScrollArea className="h-[320px] rounded-xl border border-border/60 bg-muted/15 p-3">
                <div className="flex flex-col gap-3">
                  {items.map((item) => (
                    <Card key={item.draftId} className="border-border/60 bg-background/85 shadow-none">
                      <CardContent className="flex items-center gap-3 py-4">
                        <div className="rounded-xl bg-muted p-2 text-muted-foreground">
                          {item.status === 'pending' && <Clock3Icon />}
                          {item.status === 'running' && <LoaderCircleIcon className="animate-spin" />}
                          {item.status === 'success' && <CheckCircle2Icon />}
                          {item.status === 'failed' && <XCircleIcon />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{item.label}</div>
                          <div className="truncate text-sm text-muted-foreground">{item.message || item.draftId}</div>
                        </div>
                        <Badge variant={statusVariant[item.status]}>{statusLabel[item.status]}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemoveItem(item.draftId)}
                          disabled={item.status === 'running'}
                        >
                          <Trash2Icon data-icon="inline-start" />
                          移除
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>
      ) : items.length > 0 ? (
        <motion.div
          key="import-queue-closed"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={FLOAT_TRANSITION}
          className="fixed bottom-4 left-4 z-40"
          style={{ x: position.x, y: position.y }}
        >
          <Button
            variant="outline"
            className="h-auto rounded-full px-3 py-2 shadow-lg"
            onClick={() => onOpenChange(true)}
          >
            <ChevronUpIcon data-icon="inline-start" />
            {title}
            <Badge variant="secondary">{items.length}</Badge>
          </Button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
