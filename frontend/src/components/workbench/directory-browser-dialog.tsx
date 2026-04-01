import { ArrowUpIcon, FolderIcon, FolderOpenIcon, RefreshCcwIcon } from 'lucide-react'

import type { DirectoryEntry } from '@/types'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

interface DirectoryBrowserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pathInput: string
  currentPath: string
  parentPath?: string | null
  items: DirectoryEntry[]
  loading: boolean
  onPathInputChange: (value: string) => void
  onBrowse: (path?: string) => void
  onConfirm: () => void
}

export function DirectoryBrowserDialog({
  open,
  onOpenChange,
  pathInput,
  currentPath,
  parentPath,
  items,
  loading,
  onPathInputChange,
  onBrowse,
  onConfirm,
}: DirectoryBrowserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>选择扫描目录</DialogTitle>
          <DialogDescription>
            可以直接输入完整路径，也可以在下面逐级进入目录，不必再一个一个点系统窗口。
          </DialogDescription>
        </DialogHeader>

        <Card className="border-border/70 bg-background/80 shadow-none">
          <CardHeader>
            <CardTitle>路径浏览器</CardTitle>
            <CardDescription>解决“我知道路径，但系统目录窗口不能直接输入”的问题。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel>目标路径</FieldLabel>
                <FieldContent>
                  <div className="flex gap-2">
                    <Input
                      value={pathInput}
                      onChange={(event) => onPathInputChange(event.target.value)}
                      placeholder="例如 D:\\Notes\\Calculus"
                    />
                    <Button variant="outline" onClick={() => onBrowse(pathInput)}>
                      {loading ? <Spinner data-icon="inline-start" /> : <RefreshCcwIcon data-icon="inline-start" />}
                      打开
                    </Button>
                    <Button onClick={onConfirm}>
                      <FolderOpenIcon data-icon="inline-start" />
                      选中此路径
                    </Button>
                  </div>
                  <FieldDescription>当前浏览位置：{currentPath}</FieldDescription>
                </FieldContent>
              </Field>
            </FieldGroup>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => parentPath && onBrowse(parentPath)} disabled={!parentPath}>
                <ArrowUpIcon data-icon="inline-start" />
                返回上级
              </Button>
              <div className="text-sm text-muted-foreground">点击任意目录卡片会进入该目录。</div>
            </div>

            <ScrollArea className="h-[360px] rounded-xl border border-border/60 bg-muted/15 p-3">
              {items.length === 0 ? (
                <Empty className="min-h-[260px] border-border bg-background/70">
                  <EmptyHeader>
                    <EmptyTitle>这里还没有可显示的目录</EmptyTitle>
                    <EmptyDescription>你可以手动输入路径后点击“打开”，或者返回上级目录。</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items
                    .filter((item) => item.kind === 'directory')
                    .map((item) => (
                      <button
                        key={item.path}
                        type="button"
                        className={cn(
                          'rounded-2xl border border-border/60 bg-background/80 p-4 text-left transition-colors hover:bg-muted/40',
                          pathInput === item.path && 'border-primary/70 ring-2 ring-primary/15',
                        )}
                        onClick={() => {
                          onPathInputChange(item.path)
                          onBrowse(item.path)
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="rounded-xl bg-primary/10 p-2 text-primary">
                            <FolderIcon />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{item.name}</div>
                            <div className="truncate text-sm text-muted-foreground">{item.path}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  )
}
