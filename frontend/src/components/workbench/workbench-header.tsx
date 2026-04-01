import React, { memo } from 'react'
import {
  BookOpenTextIcon,
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  FolderUpIcon,
  RefreshCcwIcon,
  RotateCcwIcon,
  Trash2Icon,
  UploadIcon,
  WorkflowIcon,
} from 'lucide-react'

import type { WorkspaceMode } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AnkiConnectHelpPopover } from '@/components/workbench/anki-connect-help-popover'
import { cn } from '@/lib/utils'

export type WorkspaceGuideAction = 'upload' | 'refresh-anki' | 'open-export' | null
type ManualGuideStep = 'import' | 'mask' | 'anki' | 'export'

interface ManualGuide {
  step: ManualGuideStep
  hint: string
  action: WorkspaceGuideAction
  actionLabel: string | null
}

interface WorkbenchHeaderProps {
  workspaceMode: WorkspaceMode
  onWorkspaceModeChange: (mode: WorkspaceMode) => void
  manualGuide: ManualGuide
  loadingKey: string | null
  onUploadImages: () => void
  onImportFolder: () => void
  onRestoreProject: () => void
  onRefreshAnki: () => void
  onClearProject: () => void
  onGuideAction: (action: WorkspaceGuideAction) => void
}

const GUIDE_ORDER: ManualGuideStep[] = ['import', 'mask', 'anki', 'export']

// --- 图标组件 ---

const AnkiIcon = memo(({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 48 48" className={className}>
    <path
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m30.63 9.21l.735 3.685l3.452 1.482l-3.286 1.842l-.345 3.744l-2.76-2.554l-3.665.829l1.57-3.413l-1.921-3.237l3.734.442l2.476-2.828zM17.565 24.906l4.456 3.003l5.001-1.97l-1.482 5.168l3.413 4.144l-5.372.188l-2.886 4.534l-1.843-5.05l-5.197-1.346l4.232-3.306l-.328-5.362zM35.5 4.5h-23a4 4 0 0 0-4 4v31a4 4 0 0 0 4 4h23a4 4 0 0 0 4-4v-31a4 4 0 0 0-4-4"
      strokeWidth="2"
    />
  </svg>
))

const MainIcon = memo(() => (
  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/35 text-foreground">
    <AnkiIcon className="size-6 text-foreground/80" />
  </div>
))

// --- 静态数据提取 ---

const GUIDE_STEPS = [
  { step: 'import' as const, label: '导入' },
  { step: 'mask' as const, label: '挖空' },
  { step: 'anki' as const, label: 'Anki' },
  { step: 'export' as const, label: '导出' },
]

// --- 全新的步骤条组件 (Stepper) ---
const GuideStepper = memo(function GuideStepper({
  currentGuideIndex,
}: {
  currentGuideIndex: number
}) {
  return (
    <div className="flex w-full items-center overflow-x-auto pb-1 sm:w-auto sm:pb-0" style={{ scrollbarWidth: 'none' }}>
      {GUIDE_STEPS.map((item, index) => {
        const isDone = index < currentGuideIndex
        const isActive = index === currentGuideIndex
        const isUpcoming = index > currentGuideIndex

        return (
          <React.Fragment key={item.step}>
            {/* 单个步骤节点 */}
            <div
              className={cn(
                'flex shrink-0 items-center gap-2 transition-colors',
                isUpcoming ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {/* 数字/打勾圆圈 */}
              <div
                className={cn(
                  'flex size-6 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                  isActive && 'border-primary bg-primary text-primary-foreground shadow-sm',
                  isDone && 'border-primary bg-primary/10 text-primary',
                  isUpcoming && 'border-border/70 bg-muted/50',
                )}
              >
                {isDone ? <CheckIcon className="size-3.5" strokeWidth={3} /> : index + 1}
              </div>
              {/* 步骤文字 */}
              <span className={cn('text-sm font-medium', isActive && 'text-primary')}>{item.label}</span>
            </div>

            {/* 步骤间的连线 (最后一步不需要) */}
            {index < GUIDE_STEPS.length - 1 && (
              <div
                className={cn(
                  'mx-2 h-[2px] w-4 shrink-0 rounded-full transition-colors sm:mx-3 sm:w-8',
                  isDone ? 'bg-primary/50' : 'bg-border/60',
                )}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
})

// --- 主组件 ---

export const WorkbenchHeader = memo(function WorkbenchHeader({
  workspaceMode,
  onWorkspaceModeChange,
  manualGuide,
  loadingKey,
  onUploadImages,
  onImportFolder,
  onRestoreProject,
  onRefreshAnki,
  onClearProject,
  onGuideAction,
}: WorkbenchHeaderProps) {
  const currentGuideIndex = GUIDE_ORDER.indexOf(manualGuide.step)

  return (
    <Card className="overflow-hidden border border-border/70 bg-background/92 shadow-sm">
      <CardContent className="p-0">
        <div className="flex flex-col gap-4 border-b border-border/70 bg-muted/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 md:px-5 md:py-5">
          <div className="flex items-start gap-3">
            <MainIcon />
            <div className="min-w-0">
              <CardTitle className="text-lg tracking-tight md:text-xl">Anki 图像挖空网页工作台</CardTitle>
              <CardDescription className="mt-1">导入图片，画遮挡，检查一下，然后直接送进你本机的 Anki。</CardDescription>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Tabs
              value={workspaceMode}
              onValueChange={(value) => value && onWorkspaceModeChange(value as WorkspaceMode)}
              className="w-full sm:w-auto"
            >
              <TabsList className="h-auto w-full gap-1.5 rounded-2xl bg-muted/60 p-1">
                <TabsTrigger
                  value="manual"
                  className="h-auto min-w-0 flex-1 justify-start gap-1.5 rounded-xl px-2.5 py-2 text-sm"
                >
                  <BookOpenTextIcon className="size-4" />
                  手动处理
                </TabsTrigger>
                <TabsTrigger
                  value="pipeline"
                  className="h-auto min-w-0 flex-1 justify-start gap-1.5 rounded-xl px-2.5 py-2 text-sm"
                >
                  <WorkflowIcon className="size-4" />
                  自动化流
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap gap-2">
              <Button size="lg" className="h-11 flex-1 rounded-xl px-4 sm:flex-none" onClick={onUploadImages}>
                <UploadIcon data-icon="inline-start" />
                上传图片
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="h-11 flex-1 rounded-xl px-4 sm:flex-none"
                onClick={onImportFolder}
              >
                <FolderUpIcon data-icon="inline-start" />
                导入文件夹
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="lg" variant="outline" className="h-11 rounded-xl px-4">
                    更多
                    <ChevronDownIcon data-icon="inline-end" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>更多操作</DropdownMenuLabel>
                  <DropdownMenuGroup>
                    <DropdownMenuItem onSelect={onRestoreProject}>
                      {loadingKey === 'restore-project' ? <Spinner /> : <RotateCcwIcon />}
                      恢复上次项目
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={onRefreshAnki}>
                      {loadingKey === 'refresh-anki' ? <Spinner /> : <RefreshCcwIcon />}
                      获取牌组
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={onClearProject}>
                    {loadingKey === 'clear-project' ? <Spinner /> : <Trash2Icon />}
                    清空本地项目
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <AnkiConnectHelpPopover />
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-4 md:px-5 md:py-5">
          {workspaceMode === 'manual' ? (
            <>
              {/* <div className="flex flex-wrap gap-2">
                {summaryItems.map((item) => (
                  <SummaryPill key={item.label} label={item.label} value={item.value} icon={item.icon} />
                ))}
              </div> */}

              <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-4 md:space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  
                  {/* 使用全新的步骤条组件 */}
                  <GuideStepper currentGuideIndex={currentGuideIndex} />

                  {manualGuide.action && manualGuide.actionLabel && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl sm:shrink-0"
                      onClick={() => onGuideAction(manualGuide.action!)}
                    >
                      {manualGuide.action === 'refresh-anki' && loadingKey === 'refresh-anki' ? (
                        <Spinner data-icon="inline-start" />
                      ) : manualGuide.action === 'upload' ? (
                        <UploadIcon data-icon="inline-start" />
                      ) : (
                        <DownloadIcon data-icon="inline-start" />
                      )}
                      {manualGuide.actionLabel}
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="size-1.5 rounded-full bg-foreground/60" />
                  <span>{manualGuide.hint}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
              <Badge variant="outline" className="rounded-full bg-background/80">
                <WorkflowIcon className="size-3.5" />
                流水线区域预留中
              </Badge>
              <span>这里先留入口位，等手动流程稳定后，再把自动识别、建议遮挡和批量审核逐步接回。</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
})
