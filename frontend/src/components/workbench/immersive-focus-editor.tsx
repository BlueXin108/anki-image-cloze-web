import {
  ChevronLeft,
  MousePointer2,
  Brush,
  Eraser,
  Square,
  Lasso,
  Undo2,
  Redo2,
  RotateCcw,
  HelpCircle,
  Crop,
  Plus,
  Minus,
  LayoutGrid,
  ChevronRight,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ImmersiveFocusEditorProps {
  onClose: () => void
}

export function ImmersiveFocusEditor({ onClose }: ImmersiveFocusEditorProps) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background overflow-hidden">
      {/* Top Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 bg-background">
        <div className="flex items-center gap-2 w-64">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="mr-1 h-4 w-4" />
            返回选择
          </Button>
        </div>

        {/* Toolbar Center */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1 rounded-md bg-muted/50 p-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 bg-background shadow-sm">
              <MousePointer2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <Brush className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <Crop className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <Square className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Minus className="h-4 w-4 text-muted-foreground" />
            <input type="range" defaultValue={100} max={200} step={1} className="w-32 h-1.5 bg-muted rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:rounded-full" />
            <span className="text-xs font-medium w-9">100%</span>
            <Plus className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="flex items-center gap-1 border-l pl-6">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Top Right Actions */}
        <div className="flex items-center justify-end gap-2 w-64">
          <Button variant="outline" size="sm" className="h-8 text-xs">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            重置
          </Button>
          <Button size="sm" className="h-8 text-xs bg-zinc-800 text-zinc-50 hover:bg-zinc-700">
            应用到全部
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-64 shrink-0 border-r flex flex-col overflow-y-auto bg-background/50">
          {/* Tools Area */}
          <div className="p-4 flex flex-col gap-3 border-b">
            <h3 className="text-xs font-semibold text-muted-foreground">遮罩工具</h3>
            <div className="flex flex-col gap-1">
              <Button variant="secondary" className="justify-start h-9 px-3 bg-muted">
                <Brush className="mr-2 h-4 w-4" />
                画笔
              </Button>
              <Button variant="ghost" className="justify-start h-9 px-3 text-muted-foreground">
                <Eraser className="mr-2 h-4 w-4" />
                橡皮擦
              </Button>
              <Button variant="ghost" className="justify-start h-9 px-3 text-muted-foreground">
                <Square className="mr-2 h-4 w-4" />
                矩形
              </Button>
              <Button variant="ghost" className="justify-start h-9 px-3 text-muted-foreground">
                <Lasso className="mr-2 h-4 w-4" />
                套索
              </Button>
            </div>
          </div>

          {/* Settings Area */}
          <div className="p-4 flex flex-col gap-4 border-b">
            <h3 className="text-xs font-semibold text-muted-foreground mb-1">画笔设置</h3>
            <div className="flex flex-col gap-1.5 py-1">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span>大小</span>
                <span className="text-muted-foreground">40</span>
              </div>
              <input type="range" defaultValue={40} max={100} step={1} className="w-full h-1 bg-muted rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:rounded-full" />
            </div>
            <div className="flex flex-col gap-1.5 py-1">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span>硬度</span>
                <span className="text-muted-foreground">80</span>
              </div>
              <input type="range" defaultValue={80} max={100} step={1} className="w-full h-1 bg-muted rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:rounded-full" />
            </div>
            <div className="flex flex-col gap-1.5 py-1">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span>透明度</span>
                <span className="text-muted-foreground">100</span>
              </div>
              <input type="range" defaultValue={100} max={100} step={1} className="w-full h-1 bg-muted rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:rounded-full" />
            </div>
          </div>

          {/* View Toggles Area */}
          <div className="p-4 flex flex-col gap-3">
            <h3 className="text-xs font-semibold text-muted-foreground">遮罩显示</h3>
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-md">
              <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs bg-background shadow-sm">
                遮罩
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs text-muted-foreground">
                半透明
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs text-muted-foreground">
                原图
              </Button>
            </div>
          </div>
        </aside>

        {/* Center Canvas */}
        <main className="flex-1 min-w-0 flex flex-col bg-muted/20 relative">
          <div className="flex-1 m-4 rounded-lg bg-white shadow-sm border overflow-hidden flex items-center justify-center relative">
            <div className="absolute inset-4 border-2 border-dashed border-muted-foreground/20 rounded-md flex items-center justify-center text-muted-foreground">
              [主画布区域]
            </div>
          </div>

          {/* Bottom Carousel Placeholder */}
          <div className="h-20 shrink-0 border-t bg-background flex items-center px-4 gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex-1 flex gap-2 overflow-hidden px-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className={cn("h-12 w-20 shrink-0 rounded-md border bg-muted", i === 2 && "ring-2 ring-primary ring-offset-1")}></div>
              ))}
            </div>

            <div className="text-xs font-medium text-muted-foreground px-4 shrink-0 border-r border-l mx-2">
              6 / 12
            </div>

            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground">
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </main>

        {/* Right Sidebar */}
        <aside className="w-64 shrink-0 border-l flex flex-col bg-background/50 overflow-y-auto">
          {/* Info */}
          <div className="p-4 border-b flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-muted-foreground mb-1">图片信息</h3>
            <div className="text-sm font-medium">3.webp</div>
            <div className="text-xs text-muted-foreground">1920 × 1080</div>
          </div>

          {/* Stats */}
          <div className="p-4 border-b flex flex-col gap-3">
            <h3 className="text-xs font-semibold text-muted-foreground">遮罩统计</h3>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span>遮罩面积</span>
                <span className="text-muted-foreground font-medium">32.4%</span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-foreground w-1/3 rounded-full" />
              </div>
            </div>
          </div>

          {/* Shortcuts */}
          <div className="p-4 flex flex-col gap-4 flex-1">
            <h3 className="text-xs font-semibold text-muted-foreground">快捷键</h3>
            <div className="flex flex-col gap-3 text-[11px]">
              <div className="flex justify-between items-center text-muted-foreground"><span className="text-foreground">画笔</span><span>B</span></div>
              <div className="flex justify-between items-center text-muted-foreground"><span className="text-foreground">橡皮擦</span><span>E</span></div>
              <div className="flex justify-between items-center text-muted-foreground"><span className="text-foreground">撤销</span><span>Ctrl + Z</span></div>
              <div className="flex justify-between items-center text-muted-foreground"><span className="text-foreground">重做</span><span>Ctrl + Y</span></div>
              <div className="flex justify-between items-center text-muted-foreground"><span className="text-foreground">放大</span><span>Ctrl + +</span></div>
              <div className="flex justify-between items-center text-muted-foreground"><span className="text-foreground">缩小</span><span>Ctrl + -</span></div>
              <div className="flex justify-between items-center text-muted-foreground"><span className="text-foreground">重置视图</span><span>0</span></div>
              <div className="flex justify-between items-center text-muted-foreground"><span className="text-foreground">切换显示</span><span>D</span></div>
            </div>
          </div>

          {/* Help */}
          <div className="p-4 mt-auto">
            <Button variant="ghost" className="w-full justify-start text-xs text-muted-foreground h-8 px-2">
              <HelpCircle className="mr-2 h-3.5 w-3.5" />
              帮助
            </Button>
          </div>
        </aside>
      </div>
    </div>
  )
}
