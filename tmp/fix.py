import re

file_path = 'frontend/src/components/editor/image-editor.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update imports
content = content.replace(
    "import { CropIcon, PlusIcon, Redo2Icon, RotateCcwIcon, ScanSearchIcon, Trash2Icon, Undo2Icon } from 'lucide-react'",
    "import { CropIcon, PlusIcon, Redo2Icon, RotateCcwIcon, ScanSearchIcon, Trash2Icon, Undo2Icon, EyeIcon, EyeOffIcon } from 'lucide-react'"
)
content = content.replace(
    "import { Button } from '@/components/ui/button'",
    "import { Button } from '@/components/ui/button'\nimport { Skeleton } from '@/components/ui/skeleton'"
)

# 2. Update ImageEditorProps
props_target = '''  imageClassName?: string
  focusLayout?: boolean
  readOnly?: boolean
  hideMetaBar?: boolean
}'''
props_repl = '''  imageClassName?: string
  focusLayout?: boolean
  readOnly?: boolean
  hideMetaBar?: boolean
  disableWheelResize?: boolean
  touchOptimized?: boolean
}'''
content = content.replace(props_target, props_repl)

# 3. Update ImageEditor function signature
sig_target = '''  footerSlot,
  imageClassName,
  focusLayout = false,
  readOnly = false,
}: ImageEditorProps) {'''
sig_repl = '''  footerSlot,
  imageClassName,
  focusLayout = false,
  readOnly = false,
  disableWheelResize = false,
  touchOptimized: _touchOptimized = false,
}: ImageEditorProps) {'''
content = content.replace(sig_target, sig_repl)

# 4. Update state variables to include sourceImageLoaded
state_target = '''  const [showMaskOverlay, setShowMaskOverlay] = useState(true)
  const [hoveredMaskId, setHoveredMaskId] = useState<string | null>(null)'''
state_repl = '''  const [showMaskOverlay, setShowMaskOverlay] = useState(true)
  const [sourceImageLoaded, setSourceImageLoaded] = useState(false)
  const [hoveredMaskId, setHoveredMaskId] = useState<string | null>(null)'''
content = content.replace(state_target, state_repl)

# 5. Add useEffect for sourceImageLoaded
effect_target = '''  const getDisplaySize = () => {'''
effect_repl = '''  useEffect(() => {
    setSourceImageLoaded(false)
  }, [draft.id, sourceImageUrl])

  const getDisplaySize = () => {'''
content = content.replace(effect_target, effect_repl)

# 6. Update focusImageStyle logic bypass
focus_target = '''  const focusImageStyle =
    focusLayout && focusViewportSize
      ? {
          maxWidth: `${focusViewportSize.width}px`,
          maxHeight: `${focusViewportSize.height}px`,
        }
      : undefined'''
focus_repl = '''  // 【核心经验固化】：为什么移动端绝对不能开启此计算逻辑？
  // 当 DialogContent 也是 h-fit 脱离绝对全屏限制时，如果内部 Image 尝试根据父容器的大小（focusViewportSize）去 max-width/max-height 去限制自身，
  // 就会触发“缩小死循环”，因此只要是自适应模式（_touchOptimized），此规则直接 bypass
  const focusImageStyle =
    focusLayout && focusViewportSize && !_touchOptimized
      ? {
          maxWidth: `${focusViewportSize.width}px`,
          maxHeight: `${focusViewportSize.height}px`,
        }
      : undefined'''
content = content.replace(focus_target, focus_repl)

# 7. Update toolbar
toolbar_target = '''      {hasLeadingControls ? (
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly ? (
            <>
              <Button variant="outline" size="sm" onClick={() => void undo()} disabled={undoStackRef.current.length === 0}>
                <Undo2Icon data-icon="inline-start" />
                撤回
              </Button>
              <Button variant="outline" size="sm" onClick={() => void redo()} disabled={redoStackRef.current.length === 0}>
                <Redo2Icon data-icon="inline-start" />
                重做
              </Button>
              <Button variant="outline" size="sm" onClick={addMask}>
                <PlusIcon data-icon="inline-start" />
                新建遮罩
              </Button>
              <Button variant="outline" size="sm" onClick={() => void resetEditor()}>
                <RotateCcwIcon data-icon="inline-start" />
                重置编辑区域
              </Button>
              <Button variant="outline" size="sm" onClick={removeSelectedMask} disabled={selectedCount === 0}>
                <Trash2Icon data-icon="inline-start" />
                {selectedCount > 1 ? `删除选中遮罩（${selectedCount}）` : '删除当前遮罩'}
              </Button>
              {showCropSubmit && (
                <Button variant="outline" size="sm" onClick={() => onCropCommit(localCrop)}>
                  <CropIcon data-icon="inline-start" />
                  提交裁切
                </Button>
              )}
            </>
          ) : null}
          {showOcrTools && (
            <Button variant={showOcrOverlay ? 'secondary' : 'outline'} size="sm" onClick={() => setShowOcrOverlay((current) => !current)}>
              <ScanSearchIcon data-icon="inline-start" />
              {showOcrOverlay ? '隐藏 OCR 预览' : '显示 OCR 预览'}
            </Button>
          )}
          {!readOnly ? (
            <Button
              variant={showMaskOverlay ? 'secondary' : 'outline'}
              size="sm"
              className={cn(showMaskOverlay && 'border-amber-400/60 bg-amber-500/10 text-foreground')}
              onClick={() => setShowMaskOverlay((current) => !current)}
            >
              <ScanSearchIcon data-icon="inline-start" />
              {showMaskOverlay ? '隐藏遮罩' : '显示遮罩'}
            </Button>
          ) : null}
        </div>
      ) : null}'''

toolbar_repl = '''      {hasLeadingControls ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex flex-wrap items-center gap-2">
            {!readOnly ? (
              <>
                <Button variant="outline" size="sm" onClick={addMask}>
                  <PlusIcon data-icon="inline-start" />
                  新建遮罩
                </Button>
                <Button variant="outline" size="sm" onClick={removeSelectedMask} disabled={selectedCount === 0}>
                  <Trash2Icon data-icon="inline-start" />
                  {selectedCount > 1 ? `删除选中（${selectedCount}）` : '删除遮罩'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void undo()} disabled={undoStackRef.current.length === 0}>
                  <Undo2Icon data-icon="inline-start" />
                  撤回
                </Button>
                <Button variant="outline" size="sm" onClick={() => void redo()} disabled={redoStackRef.current.length === 0}>
                  <Redo2Icon data-icon="inline-start" />
                  重做
                </Button>
                {showCropSubmit && (
                  <Button variant="outline" size="sm" onClick={() => onCropCommit(localCrop)}>
                    <CropIcon data-icon="inline-start" />
                    提交裁切
                  </Button>
                )}
              </>
            ) : null}
            {showOcrTools && (
              <Button variant={showOcrOverlay ? 'secondary' : 'outline'} size="sm" onClick={() => setShowOcrOverlay((current) => !current)}>
                <ScanSearchIcon data-icon="inline-start" />
                {showOcrOverlay ? '隐藏 OCR 预览' : '显示 OCR 预览'}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!readOnly ? (
              <>
                <Button
                  variant="outline"
                  size="icon-sm"
                  title="重置"
                  className={cn("size-8")}
                  onClick={() => {
                    if (window.confirm("确定要重置当前图片的所有编辑吗？此操作不可逆。")) {
                      void resetEditor()
                    }
                  }}
                >
                  <RotateCcwIcon className="size-4" />
                </Button>
                <Button
                  variant={showMaskOverlay ? 'secondary' : 'outline'}
                  size="icon-sm"
                  title={showMaskOverlay ? '隐藏遮罩' : '显示遮罩'}
                  className={cn("size-8", showMaskOverlay && 'border-amber-400/60 bg-amber-500/10 text-foreground')}
                  onClick={() => setShowMaskOverlay((current) => !current)}
                >
                  {showMaskOverlay ? <EyeIcon className="size-4" /> : <EyeOffIcon className="size-4" />}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}'''
content = content.replace(toolbar_target, toolbar_repl)

# 8. Update img element
img_target = '''            <div className="relative inline-block max-w-full align-top">
              <img
                ref={imageRef}
                src={sourceImageUrl}
                alt="Source"
                className={resolvedImageClassName}
                style={
                  focusLayout
                    ? focusImageStyle
                    : normalTargetWidth
                      ? {
                          width: `${normalTargetWidth}px`,
                          maxWidth: '100%',
                        }
                      : undefined
                }
              />'''
img_repl = '''            <div className="relative inline-block max-w-full align-top">
              {!sourceImageLoaded ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/82 backdrop-blur-[1px]">
                  <div className="flex w-full max-w-[26rem] flex-col gap-3 px-4">
                    <Skeleton className="h-5 w-28 rounded-full" />
                    <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
                    <div className="flex items-center justify-between gap-3">
                      <Skeleton className="h-4 w-20 rounded-full" />
                      <Skeleton className="h-4 w-14 rounded-full" />
                    </div>
                  </div>
                </div>
              ) : null}
              <img
                ref={imageRef}
                src={sourceImageUrl}
                alt="Source"
                className={resolvedImageClassName}
                onLoad={() => setSourceImageLoaded(true)}
                onError={() => setSourceImageLoaded(true)}
                style={
                  focusLayout
                    ? focusImageStyle
                    : normalTargetWidth
                      ? {
                          width: `${normalTargetWidth}px`,
                          maxWidth: '100%',
                        }
                      : undefined
                }
              />'''
content = content.replace(img_target, img_repl)

# 9. Update onWheelCapture disableWheelResize
wheel_target = '''                onWheelCapture={(event) => {
                  if (readOnly) return
                  const activeMaskIds ='''
wheel_repl = '''                onWheelCapture={(event) => {
                  if (readOnly) return
                  if (disableWheelResize) return
                  const activeMaskIds ='''
content = content.replace(wheel_target, wheel_repl)

# 10. Selected mask color fix
mask_target = '''                        className={cn(
                          'absolute rounded-sm border bg-white/60 transition-colors',
                          hoveredMaskId === mask.id && 'bg-white/30',
                          isSelected
                            ? 'border-amber-500/80 shadow-[0_0_0_2px_rgba(245,158,11,0.16)]'
                            : (groupSizeByMaskId.get(mask.id) ?? 1) > 1
                              ? 'border-slate-500/45 bg-slate-100/60 shadow-[0_0_0_1px_rgba(100,116,139,0.08)]'
                            : 'border-amber-500/45 shadow-[0_0_0_1px_rgba(251,191,36,0.08)]',
                        )}'''
mask_repl = '''                        className={cn(
                          'absolute rounded-sm border transition-colors',
                          isSelected
                            ? 'border-amber-500 bg-amber-400/25 shadow-[0_0_0_2px_rgba(245,158,11,0.35)]'
                            : (groupSizeByMaskId.get(mask.id) ?? 1) > 1
                              ? 'border-slate-500/45 bg-slate-100/60 shadow-[0_0_0_1px_rgba(100,116,139,0.08)]'
                            : 'border-amber-500/45 bg-white/60 shadow-[0_0_0_1px_rgba(251,191,36,0.08)]',
                          !isSelected && hoveredMaskId === mask.id && 'bg-white/30',
                          isSelected && hoveredMaskId === mask.id && 'bg-amber-400/15',
                        )}'''
content = content.replace(mask_target, mask_repl)

# 11. Badge color fix
badge_target = '''<div className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 -translate-y-[15%] rounded-sm border border-slate-300/55 bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm">
                          {orderByMaskId.get(mask.id) ?? 1}
                        </div>'''
badge_repl = '''<div className={cn(
                          "pointer-events-none absolute left-1/2 top-full -translate-x-1/2 -translate-y-[15%] rounded-sm border px-1.5 py-0.5 text-[10px] font-medium shadow-sm transition-colors",
                          isSelected 
                            ? "border-amber-400/60 bg-amber-50 text-amber-900" 
                            : "border-slate-300/55 bg-white/80 text-slate-600"
                        )}>
                          {orderByMaskId.get(mask.id) ?? 1}
                        </div>'''
content = content.replace(badge_target, badge_repl)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('SUCCESS!')
