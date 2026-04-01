import { AnimatePresence, motion } from 'framer-motion'
import { BotIcon, ChevronDownIcon, ChevronUpIcon, FileTextIcon, LogsIcon, XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const FLOAT_TRANSITION = {
  duration: 0.36,
  ease: [0.22, 1, 0.36, 1] as const,
}

export interface AnalysisLogEntry {
  id: string
  time: string
  channel: 'system' | 'ocr' | 'routing' | 'llm'
  title: string
  detail: string
  body?: string | null
  requestBody?: string | null
  responseBody?: string | null
  targets?: string[]
  tone: 'info' | 'success' | 'error'
}

interface AnalysisLogFloatProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: AnalysisLogEntry[]
}

const toneLabel = {
  info: '记录',
  success: '完成',
  error: '失败',
} as const

const toneVariant = {
  info: 'outline',
  success: 'default',
  error: 'destructive',
} as const

function LogList({ entries }: { entries: AnalysisLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <Empty className="border-border bg-muted/20">
        <EmptyHeader>
          <EmptyTitle>还没有日志</EmptyTitle>
          <EmptyDescription>运行 OCR 或 LLM 后，这里会显示完整回读内容。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <LogCard key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

function LogCard({ entry }: { entry: AnalysisLogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const hasDebugPayload = !!entry.requestBody || !!entry.responseBody

  return (
    <Card className="border-border/60 bg-background/85 shadow-none">
      <CardContent className="flex flex-col gap-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">{entry.title}</div>
            <div className="text-sm text-muted-foreground">{entry.detail}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={toneVariant[entry.tone]}>{toneLabel[entry.tone]}</Badge>
            <div className="text-xs text-muted-foreground">{entry.time}</div>
          </div>
        </div>

        {entry.targets && entry.targets.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {entry.targets.map((target) => (
              <Badge key={`${entry.id}-${target}`} variant="secondary">
                {target}
              </Badge>
            ))}
          </div>
        )}

        {entry.body && (
          <pre className="max-h-64 overflow-auto rounded-xl border border-border/60 bg-muted/25 p-3 text-xs whitespace-pre-wrap text-foreground">
            {entry.body}
          </pre>
        )}

        {hasDebugPayload && (
          <div className="flex flex-col gap-3">
            <Button variant="outline" size="sm" onClick={() => setExpanded((current) => !current)}>
              {expanded ? <ChevronUpIcon data-icon="inline-start" /> : <ChevronDownIcon data-icon="inline-start" />}
              {expanded ? '收起请求 / 返回' : '展开请求 / 返回'}
            </Button>

            {expanded && (
              <div className="flex flex-col gap-3">
                {entry.requestBody && (
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Request</div>
                    <pre className="max-h-72 overflow-auto rounded-xl border border-border/60 bg-muted/25 p-3 text-xs whitespace-pre-wrap text-foreground">
                      {entry.requestBody}
                    </pre>
                  </div>
                )}

                {entry.responseBody && (
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Response</div>
                    <pre className="max-h-72 overflow-auto rounded-xl border border-border/60 bg-muted/25 p-3 text-xs whitespace-pre-wrap text-foreground">
                      {entry.responseBody}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function AnalysisLogFloat({
  open,
  onOpenChange,
  entries,
}: AnalysisLogFloatProps) {
  const ocrEntries = entries.filter((entry) => entry.channel === 'ocr')
  const routingEntries = entries.filter((entry) => entry.channel === 'routing')
  const llmEntries = entries.filter((entry) => entry.channel === 'llm')
  const systemEntries = entries.filter((entry) => entry.channel === 'system')
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

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={FLOAT_TRANSITION}
          className="fixed bottom-4 right-4 z-50 w-[min(480px,calc(100vw-2rem))]"
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
                  <LogsIcon />
                  OCR / LLM 日志窗
                </CardTitle>
                <CardDescription>这里会集中展示识别全文、模型回读文字，以及具体挖空目标。</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onOpenChange(false)}
              >
                <XIcon />
              </Button>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="ocr" className="flex flex-col gap-4">
                <TabsList className="grid grid-cols-4">
                  <TabsTrigger value="ocr">
                    <FileTextIcon data-icon="inline-start" />
                    OCR
                  </TabsTrigger>
                  <TabsTrigger value="routing">归档</TabsTrigger>
                  <TabsTrigger value="llm">
                    <BotIcon data-icon="inline-start" />
                    LLM
                  </TabsTrigger>
                  <TabsTrigger value="system">系统</TabsTrigger>
                </TabsList>
                <ScrollArea className="h-[520px] pr-2">
                  <TabsContent value="ocr" className="mt-0">
                    <LogList entries={ocrEntries} />
                  </TabsContent>
                  <TabsContent value="routing" className="mt-0">
                    <LogList entries={routingEntries} />
                  </TabsContent>
                  <TabsContent value="llm" className="mt-0">
                    <LogList entries={llmEntries} />
                  </TabsContent>
                  <TabsContent value="system" className="mt-0">
                    <LogList entries={systemEntries} />
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
