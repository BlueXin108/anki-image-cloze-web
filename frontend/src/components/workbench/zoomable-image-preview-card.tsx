import { useEffect, useRef, useState } from 'react'
import { ImageIcon, RotateCcwIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function ZoomableImagePreviewCard({
  previewUrl,
  previewAlt,
  title,
  description,
  dialogTitle,
  dialogDescription,
  compact = false,
  imageClassName,
}: {
  previewUrl: string | null
  previewAlt: string
  title: string
  description: string
  dialogTitle: string
  dialogDescription: string
  compact?: boolean
  imageClassName?: string
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const previewViewportRef = useRef<HTMLDivElement | null>(null)
  const previewImageRef = useRef<HTMLImageElement | null>(null)
  const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)

  const clampPan = (nextPan: { x: number; y: number }, nextZoom: number) => {
    const viewport = previewViewportRef.current
    const image = previewImageRef.current
    if (!viewport || !image || nextZoom <= 1) {
      return { x: 0, y: 0 }
    }

    const scaledWidth = image.offsetWidth * nextZoom
    const scaledHeight = image.offsetHeight * nextZoom
    const maxX = Math.max(0, (scaledWidth - viewport.clientWidth) / 2)
    const maxY = Math.max(0, (scaledHeight - viewport.clientHeight) / 2)

    return {
      x: Math.max(-maxX, Math.min(maxX, nextPan.x)),
      y: Math.max(-maxY, Math.min(maxY, nextPan.y)),
    }
  }

  const updateZoom = (nextZoom: number, anchor?: { clientX: number; clientY: number }) => {
    const viewport = previewViewportRef.current
    const image = previewImageRef.current
    const clampedZoom = Math.max(1, Math.min(5, Number(nextZoom.toFixed(2))))

    if (!viewport || !image) {
      setZoom(clampedZoom)
      if (clampedZoom === 1) setPan({ x: 0, y: 0 })
      return
    }

    if (clampedZoom === 1) {
      setZoom(1)
      setPan({ x: 0, y: 0 })
      return
    }

    if (!anchor || zoom === clampedZoom) {
      setZoom(clampedZoom)
      setPan((current) => clampPan(current, clampedZoom))
      return
    }

    const viewportRect = viewport.getBoundingClientRect()
    const anchorX = anchor.clientX - viewportRect.left - viewport.clientWidth / 2
    const anchorY = anchor.clientY - viewportRect.top - viewport.clientHeight / 2
    const zoomRatio = clampedZoom / zoom
    const nextPan = clampPan(
      {
        x: (pan.x - anchorX) * zoomRatio + anchorX,
        y: (pan.y - anchorY) * zoomRatio + anchorY,
      },
      clampedZoom,
    )

    setZoom(clampedZoom)
    setPan(nextPan)
  }

  const resetPreviewTransform = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setDragging(false)
    dragStateRef.current = null
  }

  useEffect(() => {
    if (!previewOpen) {
      resetPreviewTransform()
    }
  }, [previewOpen, previewUrl])

  return (
    <>
      <div className={cn('flex items-center gap-3 rounded-2xl border border-border/60 bg-background/80', compact ? 'p-2.5' : 'p-3')}>
        {previewUrl ? (
          <button
            type="button"
            className="group relative overflow-hidden rounded-xl border border-border/60 transition hover:border-border"
            onClick={() => setPreviewOpen(true)}
          >
            <img
              src={previewUrl}
              alt={previewAlt}
              loading="lazy"
              decoding="async"
              className={cn(compact ? 'h-16 w-16' : 'h-20 w-20', imageClassName ?? 'object-cover')}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 text-white transition group-hover:bg-black/35">
              <ZoomInIcon className="size-4 opacity-0 transition group-hover:opacity-100" />
            </div>
          </button>
        ) : (
          <div className={cn('flex items-center justify-center rounded-xl border border-border/60 bg-muted/20 text-muted-foreground', compact ? 'h-16 w-16' : 'h-20 w-20')}>
            <ImageIcon className="size-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className={cn('font-medium', compact ? 'text-[12px]' : 'text-sm')}>{title}</div>
            {previewUrl ? (
              <Button variant="ghost" size="sm" className={cn('rounded-lg px-2.5', compact ? 'h-7 text-[11px]' : 'h-8')} onClick={() => setPreviewOpen(true)}>
                <ZoomInIcon data-icon="inline-start" />
                放大
              </Button>
            ) : null}
          </div>
          <div className={cn('mt-1 text-muted-foreground', compact ? 'text-[11px]' : 'text-sm')}>{description}</div>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-[92vw] max-w-[92vw] overflow-hidden rounded-[1.5rem] border-border/70 bg-background/95 p-0 shadow-2xl sm:w-[64vw] sm:max-w-[64vw] sm:rounded-[1.75rem] md:w-[60vw]">
          <DialogHeader className="border-b border-border/60 p-4 sm:px-6 sm:py-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <DialogTitle>{dialogTitle}</DialogTitle>
                <DialogDescription>{dialogDescription}</DialogDescription>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <div className="flex h-8 items-center overflow-hidden rounded-lg border border-border/70 bg-muted/20 shadow-sm transition-colors hover:bg-muted/30">
                  <Button variant="ghost" size="icon" className="h-full w-9 rounded-none hover:bg-black/5 dark:hover:bg-white/10" onClick={() => updateZoom(zoom - 0.25)} title="缩小">
                    <ZoomOutIcon className="size-4 text-muted-foreground" />
                  </Button>
                  <div className="flex w-12 items-center justify-center border-x border-border/50 text-xs font-medium tabular-nums text-foreground/80">
                    {Math.round(zoom * 100)}%
                  </div>
                  <Button variant="ghost" size="icon" className="h-full w-9 rounded-none hover:bg-black/5 dark:hover:bg-white/10" onClick={() => updateZoom(zoom + 0.25)} title="放大">
                    <ZoomInIcon className="size-4 text-muted-foreground" />
                  </Button>
                </div>

                <div className="h-4 w-px bg-border/70" />

                <Button variant="outline" size="sm" className="h-8 rounded-lg px-3 shadow-sm" onClick={resetPreviewTransform}>
                  <RotateCcwIcon data-icon="inline-start" className="size-3.5 text-muted-foreground" />
                  复位
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div
            ref={previewViewportRef}
            className="flex min-h-[50vh] max-h-[78vh] items-center justify-center overflow-hidden bg-muted/15 p-4 md:p-6"
            onWheel={(event) => {
              event.preventDefault()
              updateZoom(zoom + (event.deltaY < 0 ? 0.2 : -0.2), {
                clientX: event.clientX,
                clientY: event.clientY,
              })
            }}
            onPointerMove={(event) => {
              const dragState = dragStateRef.current
              if (!dragState) return
              const nextPan = clampPan(
                {
                  x: dragState.originX + (event.clientX - dragState.startX),
                  y: dragState.originY + (event.clientY - dragState.startY),
                },
                zoom,
              )
              setPan(nextPan)
            }}
            onPointerUp={() => {
              dragStateRef.current = null
              setDragging(false)
            }}
            onPointerCancel={() => {
              dragStateRef.current = null
              setDragging(false)
            }}
          >
            {previewUrl ? (
              <img
                ref={previewImageRef}
                src={previewUrl}
                alt={previewAlt}
                decoding="async"
                className={cn(
                  'max-h-[70vh] max-w-full rounded-2xl border border-border/60 bg-background object-contain shadow-sm select-none',
                  zoom > 1 ? 'cursor-grab' : 'cursor-zoom-in',
                  dragging && 'cursor-grabbing',
                )}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: dragging ? 'none' : 'transform 120ms ease-out',
                }}
                draggable={false}
                onDoubleClick={() => {
                  if (zoom > 1) resetPreviewTransform()
                  else updateZoom(2)
                }}
                onPointerDown={(event) => {
                  if (zoom <= 1) return
                  event.preventDefault()
                  dragStateRef.current = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    originX: pan.x,
                    originY: pan.y,
                  }
                  setDragging(true)
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
