import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils' // 确保引入了 cn 工具类
import type { DraftListItem } from '@/types'
import { ImageEditor } from '@/components/editor/image-editor'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'

interface FocusEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: DraftListItem | null
  cardCount: number
  onMasksCommit: (masks: DraftListItem['draft']['masks']) => Promise<void>
  onCropCommit: (bbox: [number, number, number, number]) => Promise<void>
  title?: string
  description?: string
}

const focusShortcuts = [
  { key: 'Q', label: '退出聚焦' },
  { key: 'Alt + 拖动', label: '新建遮罩' },
  { key: 'Ctrl + 点击', label: '多选' },
  { key: 'Ctrl + A', label: '全选' },
  { key: '1-9', label: '快速选中' },
  { key: 'Tab', label: '合并/拆分卡片' },
  { key: '中键', label: '拖线重排序号' },
  { key: 'Ctrl + Z/Y', label: '撤回重做' },
  { key: 'V', label: '显隐遮罩' },
  { key: 'R', label: '显隐 OCR' },
  { key: 'Del', label: '删除选中' },
] as const

export function FocusEditorDialog({
  open,
  onOpenChange,
  item,
  cardCount,
  onMasksCommit,
  onCropCommit,
  title = '聚焦编辑',
  description = '这里只保留图像编辑本身。',
}: FocusEditorDialogProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!item) return null

  return (
   <Dialog open={open} onOpenChange={onOpenChange}>
      {/* --- 核心修改区：常驻底部的快捷键提示 --- */}
      {mounted && open
        ? createPortal(
            <div
              aria-hidden="true"
              className={cn(
                // 1. 定位：固定在屏幕底部，加高 paddingTop (pt-16) 让渐变过渡更自然
                'pointer-events-none fixed inset-x-0 bottom-0 z-[99999] flex flex-col items-center pb-4 pt-8',
                // 2. 渐变：从下往上 (to-t) 消散。使用 theme 变量自适应深浅色模式
                'bg-gradient-to-t from-background/100 via-background/95 to-transparent'
              )}
            >
              {/* 第一层：文字提示与轻柔的横线 */}
              <div className="mb-2 flex w-full max-w-2xl flex-col items-center px-4">
                <div className="text-[11px] font-medium tracking-wide text-muted-foreground">
                  使用快捷键进行编辑
                </div>
                <div className="mt-1 h-px w-full bg-border/60" />
              </div>

              {/* 第二层：快捷键列表 */}
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-6">
                {focusShortcuts.map((shortcut) => (
                  <span
                    key={shortcut.key}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-bold"
                  >
                    <Kbd>{shortcut.key}</Kbd>
                    <span className="font-medium text-foreground/80">{shortcut.label}</span>
                  </span>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
      {/* --- 核心修改区结束 --- */}
      <DialogContent className="flex h-[95vh] !w-[90vw] !max-w-[95vw] flex-col gap-0 overflow-hidden rounded-[2rem] border-border/70 bg-background/95 px-0 py-2 shadow-2xl pb-10">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{cardCount} 张卡片</span>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden px-4 py-3 md:px-5 md:py-4">
          <ImageEditor
            key={`focus-${item.draft.id}`}
            draft={item.draft}
            sourceImageUrl={item.image.source_url || ''}
            imageWidth={item.image.width}
            imageHeight={item.image.height}
            onMasksCommit={onMasksCommit}
            onCropCommit={onCropCommit}
            showOcrTools={false}
            showCropSubmit={false}
            focusLayout
            hideMetaBar
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
