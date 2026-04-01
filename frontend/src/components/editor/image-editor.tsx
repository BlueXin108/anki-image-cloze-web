import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { CropIcon, PlusIcon, Redo2Icon, ScanSearchIcon, Trash2Icon, Undo2Icon } from 'lucide-react'

import type { BBox, CardDraft, MaskRect } from '@/types'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'
const HISTORY_LIMIT = 50

interface EditorSnapshot {
  masks: MaskRect[]
  crop: BBox
}

type DragState =
  | {
      kind: 'mask-move'
      startX: number
      startY: number
      startMasks: Record<string, BBox>
      maskIds: string[]
    }
  | {
      kind: 'mask-resize'
      startX: number
      startY: number
      startBBox: BBox
      maskId: string
      handle: ResizeHandle
    }
  | {
      kind: 'crop-move'
      startX: number
      startY: number
      startBBox: BBox
    }
  | {
      kind: 'crop-resize'
      startX: number
      startY: number
      startBBox: BBox
      handle: ResizeHandle
    }
  | {
      kind: 'mask-draw'
      startX: number
      startY: number
      startPoint: { x: number; y: number }
      maskId: string
    }
  | {
      kind: 'selection-marquee'
      startX: number
      startY: number
      currentX: number
      currentY: number
      startPoint: { x: number; y: number }
      currentPoint: { x: number; y: number }
    }
  | {
      kind: 'selection-resize'
      startX: number
      startY: number
      startMasks: Record<string, BBox>
      maskIds: string[]
      startGroupBox: BBox
      handle: ResizeHandle
    }
  | {
      kind: 'order-trace'
      points: { x: number; y: number }[]
      visitedGroupIds: string[]
    }

interface ImageEditorProps {
  draft: CardDraft
  sourceImageUrl: string
  imageWidth: number
  imageHeight: number
  onMasksCommit: (masks: MaskRect[]) => Promise<void>
  onCropCommit: (bbox: BBox) => Promise<void>
  showOcrTools?: boolean
  showCropSubmit?: boolean
  shortcutHintText?: ReactNode
  footerSlot?: ReactNode
  imageClassName?: string
  focusLayout?: boolean
}

function resolveDisplayedCrop(draft: CardDraft, imageWidth: number, imageHeight: number): BBox {
  if (draft.crop?.source === 'manual') {
    return draft.crop.bbox
  }
  return [0, 0, imageWidth, imageHeight]
}

function clampBox([x1, y1, x2, y2]: BBox, width: number, height: number): BBox {
  const nx1 = Math.max(0, Math.min(x1, width - 1))
  const ny1 = Math.max(0, Math.min(y1, height - 1))
  const nx2 = Math.max(nx1 + 1, Math.min(x2, width))
  const ny2 = Math.max(ny1 + 1, Math.min(y2, height))
  return [Math.round(nx1), Math.round(ny1), Math.round(nx2), Math.round(ny2)]
}

function sameBox(a: BBox, b: BBox): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]
}

function sameMasks(a: MaskRect[], b: MaskRect[]): boolean {
  if (a.length != b.length) return false
  return a.every((mask, index) => {
    const other = b[index]
    return (
      !!other &&
      mask.id === other.id &&
      sameBox(mask.bbox, other.bbox) &&
      mask.label === other.label &&
      mask.manual === other.manual &&
      mask.source === other.source &&
      (mask.card_group_id ?? null) === (other.card_group_id ?? null) &&
      (mask.card_order ?? null) === (other.card_order ?? null)
    )
  })
}

function maskGroupId(mask: MaskRect): string {
  return mask.card_group_id || mask.id
}

function normalizeMaskGroups(masks: MaskRect[]): MaskRect[] {
  const orderByGroup = new Map<string, number>()
  const firstSeen: string[] = []
  masks.forEach((mask, index) => {
    const groupId = maskGroupId(mask)
    if (!orderByGroup.has(groupId)) {
      firstSeen.push(groupId)
      orderByGroup.set(groupId, mask.card_order ?? index + 1)
      return
    }
    orderByGroup.set(groupId, Math.min(orderByGroup.get(groupId) ?? index + 1, mask.card_order ?? index + 1))
  })
  const sortedGroupIds = [...firstSeen].sort((left, right) => {
    const leftOrder = orderByGroup.get(left) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = orderByGroup.get(right) ?? Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder || firstSeen.indexOf(left) - firstSeen.indexOf(right)
  })
  const normalizedOrder = new Map(sortedGroupIds.map((groupId, index) => [groupId, index + 1]))
  return masks.map((mask) => {
    const groupId = maskGroupId(mask)
    return {
      ...mask,
      card_group_id: groupId,
      card_order: normalizedOrder.get(groupId) ?? masks.length,
    }
  })
}

function moveBox(box: BBox, dx: number, dy: number, width: number, height: number): BBox {
  const [x1, y1, x2, y2] = box
  const boxWidth = x2 - x1
  const boxHeight = y2 - y1
  const nextX1 = Math.max(0, Math.min(x1 + dx, width - boxWidth))
  const nextY1 = Math.max(0, Math.min(y1 + dy, height - boxHeight))
  return [
    Math.round(nextX1),
    Math.round(nextY1),
    Math.round(nextX1 + boxWidth),
    Math.round(nextY1 + boxHeight),
  ]
}

function resizeBox(box: BBox, handle: ResizeHandle, dx: number, dy: number, width: number, height: number): BBox {
  let [x1, y1, x2, y2] = box
  if (handle.includes('n')) y1 += dy
  if (handle.includes('s')) y2 += dy
  if (handle.includes('w')) x1 += dx
  if (handle.includes('e')) x2 += dx
  return clampBox([x1, y1, x2, y2], width, height)
}

function boxFromPoints(x1: number, y1: number, x2: number, y2: number, width: number, height: number): BBox {
  return clampBox([Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)], width, height)
}

function cloneMasks(masks: MaskRect[]): MaskRect[] {
  return masks.map((mask) => ({
    ...mask,
    bbox: [...mask.bbox] as BBox,
  }))
}

function mergeMasksIntoCard(masks: MaskRect[], selectedMaskIds: string[]): MaskRect[] {
  if (selectedMaskIds.length < 2) return normalizeMaskGroups(masks)
  const selected = new Set(selectedMaskIds)
  const normalized = normalizeMaskGroups(masks)
  const touched = normalized.filter((mask) => selected.has(mask.id))
  if (touched.length < 2) return normalized
  const mergedGroupId = crypto.randomUUID()
  const mergedOrder = Math.min(...touched.map((mask) => mask.card_order ?? 1))
  return normalizeMaskGroups(
    normalized.map((mask) =>
      selected.has(mask.id)
        ? { ...mask, card_group_id: mergedGroupId, card_order: mergedOrder }
        : mask,
    ),
  )
}

function masksInGroups(masks: MaskRect[], groupIds: string[]): string[] {
  const groupIdSet = new Set(groupIds)
  return masks.filter((mask) => groupIdSet.has(maskGroupId(mask))).map((mask) => mask.id)
}

function splitMasksIntoCards(masks: MaskRect[], selectedMaskIds: string[]): MaskRect[] {
  if (selectedMaskIds.length < 2) return normalizeMaskGroups(masks)
  const selectedIdSet = new Set(selectedMaskIds)
  const normalized = normalizeMaskGroups(masks)
  const selectedMasks = normalized.filter((mask) => selectedIdSet.has(mask.id))
  if (selectedMasks.length < 2) return normalized
  const baseOrder = Math.min(...selectedMasks.map((mask) => mask.card_order ?? 1))
  const expansion = selectedMasks.length - 1
  let nextSelectedOrder = baseOrder
  return normalizeMaskGroups(
    normalized.map((mask) => {
      if (selectedIdSet.has(mask.id)) {
        const nextMask = {
          ...mask,
          card_group_id: mask.id,
          card_order: nextSelectedOrder,
        }
        nextSelectedOrder += 1
        return nextMask
      }
      const currentOrder = mask.card_order ?? 1
      if (currentOrder > baseOrder) {
        return { ...mask, card_order: currentOrder + expansion }
      }
      return mask
    }),
  )
}

function reorderCardGroupsByTrace(masks: MaskRect[], tracedGroupIds: string[]): MaskRect[] {
  if (tracedGroupIds.length === 0) return normalizeMaskGroups(masks)
  const normalized = normalizeMaskGroups(masks)
  const uniqueTrace = tracedGroupIds.filter((groupId, index) => tracedGroupIds.indexOf(groupId) === index)
  const existingGroupIds = [...new Set(normalized.map((mask) => maskGroupId(mask)))]
  const rest = existingGroupIds.filter((groupId) => !uniqueTrace.includes(groupId))
  const orderedGroupIds = [...uniqueTrace, ...rest]
  const orderMap = new Map(orderedGroupIds.map((groupId, index) => [groupId, index + 1]))
  return normalized.map((mask) => ({
    ...mask,
    card_group_id: maskGroupId(mask),
    card_order: orderMap.get(maskGroupId(mask)) ?? normalized.length,
  }))
}

function boxesIntersect(a: BBox, b: BBox): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]
}

function pointInBox(point: { x: number; y: number }, box: BBox): boolean {
  return point.x >= box[0] && point.x <= box[2] && point.y >= box[1] && point.y <= box[3]
}

function boundingBoxOfMasks(masks: MaskRect[]): BBox | null {
  if (masks.length === 0) return null
  return [
    Math.min(...masks.map((mask) => mask.bbox[0])),
    Math.min(...masks.map((mask) => mask.bbox[1])),
    Math.max(...masks.map((mask) => mask.bbox[2])),
    Math.max(...masks.map((mask) => mask.bbox[3])),
  ]
}

function resizeBoxesAroundOwnCenter(
  startMasks: Record<string, BBox>,
  maskIds: string[],
  handle: ResizeHandle,
  dx: number,
  dy: number,
  width: number,
  height: number,
): Record<string, BBox> {
  const widthDelta = handle.includes('e') ? dx * 2 : handle.includes('w') ? -dx * 2 : 0
  const heightDelta = handle.includes('s') ? dy * 2 : handle.includes('n') ? -dy * 2 : 0

  return Object.fromEntries(
    maskIds.map((maskId) => {
      const box = startMasks[maskId]
      const centerX = (box[0] + box[2]) / 2
      const centerY = (box[1] + box[3]) / 2
      const nextWidth = Math.max(12, box[2] - box[0] + widthDelta)
      const nextHeight = Math.max(12, box[3] - box[1] + heightDelta)
      return [
        maskId,
        clampBox(
          [
            Math.round(centerX - nextWidth / 2),
            Math.round(centerY - nextHeight / 2),
            Math.round(centerX + nextWidth / 2),
            Math.round(centerY + nextHeight / 2),
          ],
          width,
          height,
        ),
      ]
    }),
  )
}

function toStyle(box: BBox, imageWidth: number, imageHeight: number) {
  const [x1, y1, x2, y2] = box
  return {
    left: `${(x1 / imageWidth) * 100}%`,
    top: `${(y1 / imageHeight) * 100}%`,
    width: `${((x2 - x1) / imageWidth) * 100}%`,
    height: `${((y2 - y1) / imageHeight) * 100}%`,
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, [contenteditable="true"]'))
}

function makeHandle(
  handle: ResizeHandle,
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, handle: ResizeHandle) => void,
  options?: { dimmed?: boolean; sizeClass?: string },
) {
  const positions: Record<ResizeHandle, string> = {
    n: 'left-1/2 -top-2.5 -translate-x-1/2 cursor-ns-resize',
    s: 'left-1/2 -bottom-2.5 -translate-x-1/2 cursor-ns-resize',
    e: 'top-1/2 -right-2.5 -translate-y-1/2 cursor-ew-resize',
    w: 'top-1/2 -left-2.5 -translate-y-1/2 cursor-ew-resize',
    nw: '-left-2 -top-2 cursor-nwse-resize',
    ne: '-right-2 -top-2 cursor-nesw-resize',
    sw: '-bottom-2 -left-2 cursor-nesw-resize',
    se: '-bottom-2 -right-2 cursor-nwse-resize',
  }

  const shapeClass =
    options?.sizeClass ??
    (handle === 'n' || handle === 's' ? 'h-[8px] w-[18px]' : handle === 'e' || handle === 'w' ? 'h-[18px] w-[8px]' : 'size-[9px]')

  return (
    <button
      type="button"
      className={cn(
        'absolute z-20 rounded-full border border-white/90 bg-sky-500/80 shadow-sm shadow-sky-950/15 transition-opacity',
        shapeClass,
        options?.dimmed && 'opacity-55',
        positions[handle],
      )}
      onPointerDown={(event) => onPointerDown(event, handle)}
    />
  )
}

export function ImageEditor({
  draft,
  sourceImageUrl,
  imageWidth,
  imageHeight,
  onMasksCommit,
  onCropCommit,
  showOcrTools = true,
  showCropSubmit = true,
  shortcutHintText,
  footerSlot,
  imageClassName,
  focusLayout = false,
}: ImageEditorProps) {
  const normalizedDraftMasks = normalizeMaskGroups(draft.masks)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const editorViewportRef = useRef<HTMLDivElement | null>(null)
  const localMasksRef = useRef<MaskRect[]>(normalizedDraftMasks)
  const localCropRef = useRef<BBox>(resolveDisplayedCrop(draft, imageWidth, imageHeight))
  const lastDraftMasksRef = useRef<MaskRect[]>(normalizedDraftMasks)
  const lastDraftCropRef = useRef<BBox>(resolveDisplayedCrop(draft, imageWidth, imageHeight))
  const lastDraftIdRef = useRef<string>(draft.id)
  const undoStackRef = useRef<EditorSnapshot[]>([])
  const redoStackRef = useRef<EditorSnapshot[]>([])
  const wheelHistoryRef = useRef<{ key: string; at: number } | null>(null)
  const [localMasks, setLocalMasks] = useState<MaskRect[]>(normalizedDraftMasks)
  const [localCrop, setLocalCrop] = useState<BBox>(resolveDisplayedCrop(draft, imageWidth, imageHeight))
  const [selectedMaskIds, setSelectedMaskIds] = useState<string[]>([])
  const [drag, setDrag] = useState<DragState | null>(null)
  const [showOcrOverlay, setShowOcrOverlay] = useState(false)
  const [showMaskOverlay, setShowMaskOverlay] = useState(true)
  const [hoveredMaskId, setHoveredMaskId] = useState<string | null>(null)
  const [pointerInsideEditor, setPointerInsideEditor] = useState(false)
  const normalizedLocalMasks = normalizeMaskGroups(localMasks)
  const selectedMasks = localMasks.filter((mask) => selectedMaskIds.includes(mask.id))
  const selectedGroupBox = boundingBoxOfMasks(selectedMasks)
  const orderByMaskId = new Map(normalizedLocalMasks.map((mask) => [mask.id, mask.card_order ?? 1]))
  const groupSizeByMaskId = new Map(
    normalizedLocalMasks.map((mask) => [mask.id, normalizedLocalMasks.filter((entry) => maskGroupId(entry) === maskGroupId(mask)).length]),
  )
  const selectedGroupIds = [...new Set(selectedMasks.map((mask) => maskGroupId(mask)))]
  const canMergeSelectedMasks = selectedMaskIds.length > 1 && selectedGroupIds.length > 1
  const canSplitSelectedMasks =
    selectedMaskIds.length > 1 &&
    selectedGroupIds.length === 1 &&
    masksInGroups(localMasks, selectedGroupIds).length === selectedMaskIds.length

  const getDisplaySize = () => {
    if (!imageRef.current) {
      return { width: 0, height: 0 }
    }
    const rect = imageRef.current.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }

  const clientToImagePoint = (clientX: number, clientY: number) => {
    if (!imageRef.current) {
      return { x: 0, y: 0 }
    }
    const rect = imageRef.current.getBoundingClientRect()
    const relativeX = ((clientX - rect.left) / Math.max(rect.width, 1)) * imageWidth
    const relativeY = ((clientY - rect.top) / Math.max(rect.height, 1)) * imageHeight
    return {
      x: Math.max(0, Math.min(imageWidth, Math.round(relativeX))),
      y: Math.max(0, Math.min(imageHeight, Math.round(relativeY))),
    }
  }

  useEffect(() => {
    if (drag) return
    const draftChanged = lastDraftIdRef.current !== draft.id
    const nextDraftMasks = normalizeMaskGroups(draft.masks)
    const draftMasksChanged = !sameMasks(lastDraftMasksRef.current, nextDraftMasks)
    if (draftChanged || draftMasksChanged) {
      setLocalMasks((current) => (sameMasks(current, nextDraftMasks) ? current : nextDraftMasks))
      lastDraftMasksRef.current = nextDraftMasks
      lastDraftIdRef.current = draft.id
    }
    setSelectedMaskIds((current) => {
      if (current.length === 0) return []
      const valid = current.filter((maskId) => nextDraftMasks.some((mask) => mask.id === maskId))
      if (valid.length > 0) return valid
      return []
    })
  }, [draft.id, draft.masks, drag])

  useEffect(() => {
    if (drag) return
    const nextCrop = resolveDisplayedCrop(draft, imageWidth, imageHeight)
    if (!sameBox(lastDraftCropRef.current, nextCrop)) {
      setLocalCrop((current) => (sameBox(current, nextCrop) ? current : nextCrop))
      lastDraftCropRef.current = nextCrop
    }
  }, [draft.id, draft.crop, drag, imageWidth, imageHeight])

  useEffect(() => {
    localMasksRef.current = localMasks
  }, [localMasks])

  useEffect(() => {
    localCropRef.current = localCrop
  }, [localCrop])

  const captureSnapshot = (): EditorSnapshot => ({
    masks: cloneMasks(localMasksRef.current),
    crop: [...localCropRef.current] as BBox,
  })

  const pushHistorySnapshot = () => {
    undoStackRef.current = [...undoStackRef.current, captureSnapshot()].slice(-HISTORY_LIMIT)
    redoStackRef.current = []
  }

  const applySnapshot = async (snapshot: EditorSnapshot) => {
    const nextMasks = cloneMasks(snapshot.masks)
    const nextCrop = [...snapshot.crop] as BBox
    setLocalMasks(nextMasks)
    setLocalCrop(nextCrop)
    localMasksRef.current = nextMasks
    localCropRef.current = nextCrop
    setSelectedMaskIds((current) => current.filter((maskId) => nextMasks.some((mask) => mask.id === maskId)))
    await Promise.all([onMasksCommit(nextMasks), onCropCommit(nextCrop)])
  }

  const undo = async () => {
    const snapshot = undoStackRef.current.at(-1)
    if (!snapshot) return
    undoStackRef.current = undoStackRef.current.slice(0, -1)
    redoStackRef.current = [...redoStackRef.current, captureSnapshot()].slice(-HISTORY_LIMIT)
    await applySnapshot(snapshot)
  }

  const redo = async () => {
    const snapshot = redoStackRef.current.at(-1)
    if (!snapshot) return
    redoStackRef.current = redoStackRef.current.slice(0, -1)
    undoStackRef.current = [...undoStackRef.current, captureSnapshot()].slice(-HISTORY_LIMIT)
    await applySnapshot(snapshot)
  }

  useEffect(() => {
    const shouldLockScroll = pointerInsideEditor && (selectedMaskIds.length > 0 || hoveredMaskId !== null)
    if (!shouldLockScroll) return

    const onWindowWheel = (event: WheelEvent) => {
      const viewport = editorViewportRef.current
      if (!viewport) return
      const target = event.target
      if (!(target instanceof Node) || !viewport.contains(target)) return
      event.preventDefault()
    }

    window.addEventListener('wheel', onWindowWheel, { passive: false, capture: true })
    return () => window.removeEventListener('wheel', onWindowWheel, { capture: true } as EventListenerOptions)
  }, [hoveredMaskId, pointerInsideEditor, selectedMaskIds.length])

  const removeMasksByIds = async (maskIds: string[]) => {
    if (maskIds.length === 0) return
    pushHistorySnapshot()
    const maskIdSet = new Set(maskIds)
    const next = localMasksRef.current.filter((mask) => !maskIdSet.has(mask.id))
    setLocalMasks(next)
    setSelectedMaskIds([])
    await onMasksCommit(next)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          void redo()
        } else {
          void undo()
        }
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        void redo()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setSelectedMaskIds(localMasksRef.current.map((mask) => mask.id))
        return
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'Tab') {
        if (canMergeSelectedMasks || canSplitSelectedMasks) {
          event.preventDefault()
          if (canMergeSelectedMasks) {
            void mergeSelectedMasksAsCard()
          } else {
            void splitSelectedMasksToCards()
          }
        }
        return
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key.toLowerCase() === 'v') {
          event.preventDefault()
          setShowMaskOverlay((current) => !current)
          return
        }
        if (event.key.toLowerCase() === 'r') {
          event.preventDefault()
          setShowOcrOverlay((current) => !current)
          return
        }
        if (event.key.toLowerCase() === 'd' && selectedMaskIds.length > 0) {
          event.preventDefault()
          void removeMasksByIds(selectedMaskIds)
          return
        }
      }
      if (/^[1-9]$/.test(event.key)) {
        const nextIndex = Number(event.key) - 1
        const orderedMasks = normalizeMaskGroups(localMasksRef.current)
        const targetGroupMasks = orderedMasks.filter((mask) => (mask.card_order ?? 0) === nextIndex + 1)
        if (targetGroupMasks.length > 0) {
          event.preventDefault()
          setSelectedMaskIds(targetGroupMasks.map((mask) => mask.id))
        }
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedMaskIds.length > 0) {
        event.preventDefault()
        void removeMasksByIds(selectedMaskIds)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canMergeSelectedMasks, canSplitSelectedMasks, selectedMaskIds])

  useEffect(() => {
    if (!drag) return

    const onPointerMove = (event: PointerEvent) => {
      if (drag.kind === 'order-trace') {
        const point = clientToImagePoint(event.clientX, event.clientY)
        const hitMask = [...localMasksRef.current].reverse().find((mask) => pointInBox(point, mask.bbox))
        const hitGroupId = hitMask ? maskGroupId(hitMask) : null
        setDrag({
          kind: 'order-trace',
          points: [...drag.points, point],
          visitedGroupIds:
            hitGroupId && !drag.visitedGroupIds.includes(hitGroupId)
              ? [...drag.visitedGroupIds, hitGroupId]
              : drag.visitedGroupIds,
        })
        return
      }

      const displaySize = getDisplaySize()
      const dx = ((event.clientX - drag.startX) / Math.max(displaySize.width, 1)) * imageWidth
      const dy = ((event.clientY - drag.startY) / Math.max(displaySize.height, 1)) * imageHeight

      if (drag.kind === 'mask-move') {
        setLocalMasks((current) =>
          current.map((mask) => {
            const startBBox = drag.startMasks[mask.id]
            if (!startBBox) return mask
            return { ...mask, bbox: moveBox(startBBox, dx, dy, imageWidth, imageHeight) }
          }),
        )
        return
      }

      if (drag.kind === 'mask-resize') {
        setLocalMasks((current) =>
          current.map((mask) =>
            mask.id === drag.maskId
              ? { ...mask, bbox: resizeBox(drag.startBBox, drag.handle, dx, dy, imageWidth, imageHeight) }
              : mask,
          ),
        )
        return
      }

      if (drag.kind === 'crop-move') {
        setLocalCrop(moveBox(drag.startBBox, dx, dy, imageWidth, imageHeight))
        return
      }

      if (drag.kind === 'crop-resize') {
        setLocalCrop(resizeBox(drag.startBBox, drag.handle, dx, dy, imageWidth, imageHeight))
        return
      }

      if (drag.kind === 'selection-resize') {
        const resized = resizeBoxesAroundOwnCenter(
          drag.startMasks,
          drag.maskIds,
          drag.handle,
          dx,
          dy,
          imageWidth,
          imageHeight,
        )
        setLocalMasks((current) =>
          current.map((mask) => (resized[mask.id] ? { ...mask, bbox: resized[mask.id] } : mask)),
        )
        return
      }

      if (drag.kind === 'selection-marquee') {
        const point = clientToImagePoint(event.clientX, event.clientY)
        const marqueeBox = boxFromPoints(drag.startPoint.x, drag.startPoint.y, point.x, point.y, imageWidth, imageHeight)
        setDrag({
          ...drag,
          currentX: event.clientX,
          currentY: event.clientY,
          currentPoint: point,
        })
        setSelectedMaskIds(
          localMasksRef.current.filter((mask) => boxesIntersect(mask.bbox, marqueeBox)).map((mask) => mask.id),
        )
        return
      }

      const point = clientToImagePoint(event.clientX, event.clientY)
      setLocalMasks((current) =>
        current.map((mask) =>
          mask.id === drag.maskId
            ? { ...mask, bbox: boxFromPoints(drag.startPoint.x, drag.startPoint.y, point.x, point.y, imageWidth, imageHeight) }
            : mask,
        ),
      )
    }

    const onPointerUp = async () => {
      const active = drag
      setDrag(null)
      if (active.kind === 'selection-marquee') {
        return
      }
      if (active.kind === 'order-trace') {
        if (active.visitedGroupIds.length > 0) {
          const next = reorderCardGroupsByTrace(localMasksRef.current, active.visitedGroupIds)
          setLocalMasks(next)
          localMasksRef.current = next
          setSelectedMaskIds(masksInGroups(next, active.visitedGroupIds))
          await onMasksCommit(next)
        }
        return
      }
      if (active.kind === 'crop-move' || active.kind === 'crop-resize') {
        await onCropCommit(localCropRef.current)
        return
      }
      await onMasksCommit(localMasksRef.current)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [drag, imageHeight, imageWidth, onCropCommit, onMasksCommit])


  const beginCropDrag = (event: ReactPointerEvent<HTMLElement>, kind: 'crop-move' | 'crop-resize', handle?: ResizeHandle) => {
    const displaySize = getDisplaySize()
    if (displaySize.width < 2 || displaySize.height < 2 || event.altKey || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    pushHistorySnapshot()
    setDrag(
      kind === 'crop-move'
        ? {
            kind,
            startX: event.clientX,
            startY: event.clientY,
            startBBox: localCropRef.current,
          }
        : {
            kind,
            startX: event.clientX,
            startY: event.clientY,
            startBBox: localCropRef.current,
            handle: handle ?? 'se',
          },
    )
  }

  const beginMaskMove = (event: ReactPointerEvent<HTMLElement>, mask: MaskRect) => {
    const displaySize = getDisplaySize()
    if (displaySize.width < 2 || displaySize.height < 2 || event.altKey) return
    if (event.button === 1) {
      beginOrderTrace(event as unknown as ReactPointerEvent<HTMLDivElement>)
      return
    }
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    if (event.ctrlKey || event.metaKey) {
      setSelectedMaskIds((current) =>
        current.includes(mask.id) ? current.filter((id) => id !== mask.id) : [...current, mask.id],
      )
      return
    }

    const maskIds = selectedMaskIds.includes(mask.id) ? selectedMaskIds : [mask.id]
    setSelectedMaskIds(maskIds)
    pushHistorySnapshot()
    const startMasks = Object.fromEntries(
      localMasksRef.current
        .filter((entry) => maskIds.includes(entry.id))
        .map((entry) => [entry.id, entry.bbox]),
    )
    setDrag({
      kind: 'mask-move',
      startX: event.clientX,
      startY: event.clientY,
      startMasks,
      maskIds,
    })
  }

  const beginSelectionResize = (event: ReactPointerEvent<HTMLButtonElement>, handle: ResizeHandle) => {
    if (!selectedGroupBox || selectedMaskIds.length < 2) return
    const displaySize = getDisplaySize()
    if (displaySize.width < 2 || displaySize.height < 2 || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    pushHistorySnapshot()
    const startMasks = Object.fromEntries(
      localMasksRef.current
        .filter((entry) => selectedMaskIds.includes(entry.id))
        .map((entry) => [entry.id, entry.bbox]),
    )
    setDrag({
      kind: 'selection-resize',
      startX: event.clientX,
      startY: event.clientY,
      startMasks,
      maskIds: selectedMaskIds,
      startGroupBox: selectedGroupBox,
      handle,
    })
  }

  const beginMaskResize = (event: ReactPointerEvent<HTMLButtonElement>, mask: MaskRect, handle: ResizeHandle) => {
    const displaySize = getDisplaySize()
    if (displaySize.width < 2 || displaySize.height < 2 || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    pushHistorySnapshot()
    setSelectedMaskIds([mask.id])
    setDrag({
      kind: 'mask-resize',
      startX: event.clientX,
      startY: event.clientY,
      startBBox: mask.bbox,
      maskId: mask.id,
      handle,
    })
  }

  const beginMaskDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    const displaySize = getDisplaySize()
    if (displaySize.width < 2 || displaySize.height < 2) return
    const point = clientToImagePoint(event.clientX, event.clientY)

    if (!event.altKey) {
      if (event.target === event.currentTarget) {
        event.preventDefault()
        event.stopPropagation()
        setSelectedMaskIds([])
        setHoveredMaskId(null)
        setDrag({
          kind: 'selection-marquee',
          startX: event.clientX,
          startY: event.clientY,
          currentX: event.clientX,
          currentY: event.clientY,
          startPoint: point,
          currentPoint: point,
        })
      }
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const maskId = crypto.randomUUID()
    const nextMask: MaskRect = {
      id: maskId,
      bbox: clampBox([point.x, point.y, point.x + 1, point.y + 1], imageWidth, imageHeight),
      label: '手动挖空',
      confidence: 1,
      source: 'manual',
      manual: true,
      card_group_id: maskId,
      card_order: normalizeMaskGroups(localMasksRef.current).length + 1,
    }
    pushHistorySnapshot()
    const next = normalizeMaskGroups([...localMasksRef.current, nextMask])
    setLocalMasks(next)
    localMasksRef.current = next
    setSelectedMaskIds([maskId])
    setDrag({
      kind: 'mask-draw',
      startX: event.clientX,
      startY: event.clientY,
      startPoint: point,
      maskId,
    })
  }

  const addMask = async () => {
    pushHistorySnapshot()
    const bbox = clampBox(
      [
        Math.round(imageWidth * 0.28),
        Math.round(imageHeight * 0.22),
        Math.round(imageWidth * 0.72),
        Math.round(imageHeight * 0.36),
      ],
      imageWidth,
      imageHeight,
    )
    const next = [
      ...localMasks,
      {
        id: crypto.randomUUID(),
        bbox,
        label: '手动挖空',
        confidence: 1,
        source: 'manual',
        manual: true,
        card_group_id: null,
        card_order: null,
      },
    ] satisfies MaskRect[]
    const normalized = normalizeMaskGroups(next)
    setLocalMasks(normalized)
    localMasksRef.current = normalized
    setSelectedMaskIds(normalized.at(-1)?.id ? [normalized.at(-1)!.id] : [])
    await onMasksCommit(normalized)
  }

  const removeSelectedMask = async () => {
    await removeMasksByIds(selectedMaskIds)
  }

  const mergeSelectedMasksAsCard = async () => {
    if (!canMergeSelectedMasks) return
    pushHistorySnapshot()
    const next = mergeMasksIntoCard(localMasksRef.current, selectedMaskIds)
    setLocalMasks(next)
    localMasksRef.current = next
    const mergedGroupIds = [...new Set(next.filter((mask) => selectedMaskIds.includes(mask.id)).map((mask) => maskGroupId(mask)))]
    setSelectedMaskIds(masksInGroups(next, mergedGroupIds))
    await onMasksCommit(next)
  }

  const splitSelectedMasksToCards = async () => {
    if (!canSplitSelectedMasks) return
    pushHistorySnapshot()
    const next = splitMasksIntoCards(localMasksRef.current, selectedMaskIds)
    setLocalMasks(next)
    localMasksRef.current = next
    setSelectedMaskIds(selectedMaskIds)
    await onMasksCommit(next)
  }

  const beginOrderTrace = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 1) return
    const displaySize = getDisplaySize()
    if (displaySize.width < 2 || displaySize.height < 2) return
    event.preventDefault()
    event.stopPropagation()
    const point = clientToImagePoint(event.clientX, event.clientY)
    const hitMask = [...localMasksRef.current].reverse().find((mask) => pointInBox(point, mask.bbox))
    const visitedGroupIds = hitMask ? [maskGroupId(hitMask)] : []
    pushHistorySnapshot()
    setDrag({
      kind: 'order-trace',
      points: [point],
      visitedGroupIds,
    })
  }

  const resizeMasksByWheel = async (maskIds: string[], deltaY: number) => {
    if (maskIds.length === 0) return
    const historyKey = maskIds.slice().sort().join('|')
    const now = Date.now()
    if (!wheelHistoryRef.current || wheelHistoryRef.current.key !== historyKey || now - wheelHistoryRef.current.at > 400) {
      pushHistorySnapshot()
    }
    wheelHistoryRef.current = { key: historyKey, at: now }
    const targetMaskIds = new Set(maskIds)
    const direction = deltaY < 0 ? -1 : 1
    const step = 10
    const next = localMasksRef.current.map((mask) => {
      if (!targetMaskIds.has(mask.id)) return mask
      const [x1, y1, x2, y2] = mask.bbox
      return {
        ...mask,
        bbox: clampBox([x1 - direction * step, y1 - direction * step, x2 + direction * step, y2 + direction * step], imageWidth, imageHeight),
      }
    })
    setLocalMasks(next)
    await onMasksCommit(next)
  }

  const selectedCount = selectedMaskIds.length

  return (
    <div className={cn('flex flex-col gap-4', focusLayout && 'h-full min-h-0')}>
      <div className="flex flex-wrap items-center gap-2">
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
        {showOcrTools && (
          <Button variant={showOcrOverlay ? 'secondary' : 'outline'} size="sm" onClick={() => setShowOcrOverlay((current) => !current)}>
            <ScanSearchIcon data-icon="inline-start" />
            {showOcrOverlay ? '隐藏 OCR 预览' : '显示 OCR 预览'}
          </Button>
        )}
        <Button
          variant={showMaskOverlay ? 'secondary' : 'outline'}
          size="sm"
          className={cn(showMaskOverlay && 'border-sky-400/60 bg-sky-500/10 text-sky-700')}
          onClick={() => setShowMaskOverlay((current) => !current)}
        >
          <ScanSearchIcon data-icon="inline-start" />
          {showMaskOverlay ? '隐藏遮罩' : '显示遮罩'}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">{shortcutHintText || <><Kbd>Alt</Kbd><span>+</span><span>拖动新建遮罩</span></>}</span>
          <span className="inline-flex items-center gap-1.5"><Kbd>Ctrl</Kbd><span>+</span><span>点击多选</span></span>
          <span className="inline-flex items-center gap-1.5"><Kbd>Ctrl</Kbd><span>+</span><Kbd>A</Kbd><span>全选</span></span>
          <span className="inline-flex items-center gap-1.5"><Kbd>1-9</Kbd><span>快速选中</span></span>
          <span className="inline-flex items-center gap-1.5"><Kbd>Tab</Kbd><span>合并 / 拆分卡片</span></span>
          <span className="inline-flex items-center gap-1.5"><Kbd>中键</Kbd><span>拖线重排序号</span></span>
          <span className="inline-flex items-center gap-1.5"><Kbd>Ctrl</Kbd><span>+</span><Kbd>Z</Kbd><span>/</span><Kbd>Y</Kbd><span>撤回重做</span></span>
          <span className="inline-flex items-center gap-1.5"><Kbd>V</Kbd><span>显隐遮罩</span></span>
          <span className="inline-flex items-center gap-1.5"><Kbd>R</Kbd><span>显隐 OCR</span></span>
          <span className="inline-flex items-center gap-1.5"><Kbd>Del</Kbd><span>删除选中</span></span>
          <span>原图坐标系: {imageWidth} × {imageHeight}</span>
        </div>
      </div>

      <div
        ref={editorViewportRef}
        className={cn(
          'relative overflow-hidden rounded-2xl border border-border bg-[radial-gradient(circle_at_top,_rgba(255,202,117,0.14),_transparent_42%),linear-gradient(180deg,rgba(10,14,18,0.06),transparent_30%)] p-4',
          focusLayout && 'min-h-0 flex flex-1 items-start justify-center overflow-hidden p-2',
        )}
        onPointerEnter={() => setPointerInsideEditor(true)}
        onPointerLeave={() => {
          setPointerInsideEditor(false)
          setHoveredMaskId(null)
        }}
      >
        <div className={cn('flex justify-center', focusLayout && 'h-full w-full items-start justify-center')}>
          <div className={cn('inline-block max-w-full rounded-xl border border-border bg-background/90 shadow-sm', focusLayout && 'max-h-full max-w-full overflow-hidden')}>
            <div className="relative inline-block max-w-full align-top">
              <img
                ref={imageRef}
                src={sourceImageUrl}
                alt="Source"
                className={cn('block h-auto max-h-[70vh] w-auto max-w-full object-contain align-top', imageClassName)}
              />

              <div
                className="absolute inset-0"
                onPointerDown={(event) => {
                  if (event.button === 1) {
                    beginOrderTrace(event)
                    return
                  }
                  beginMaskDraw(event)
                }}
                onWheelCapture={(event) => {
                  const activeMaskIds =
                    selectedMaskIds.length > 0 ? selectedMaskIds : hoveredMaskId ? [hoveredMaskId] : []
                  if (activeMaskIds.length === 0 || drag) return
                  event.preventDefault()
                  event.stopPropagation()
                  void resizeMasksByWheel(activeMaskIds, event.deltaY)
                }}
              >
                {showOcrOverlay &&
                  draft.ocr_regions.map((region) => (
                    <div
                      key={region.id}
                      className="pointer-events-none absolute rounded-md border border-sky-400/60 bg-sky-300/10"
                      style={toStyle(region.bbox, imageWidth, imageHeight)}
                    >
                      <span className="absolute -top-6 left-0 rounded-md bg-sky-950/80 px-1.5 py-0.5 text-[11px] text-sky-100">
                        {region.text || region.region_type}
                      </span>
                    </div>
                  ))}

                <div
                  className="pointer-events-none absolute rounded-xl border-2 border-dashed border-emerald-400/90 bg-emerald-300/10"
                  style={toStyle(localCrop, imageWidth, imageHeight)}
                >
                  <div className="absolute -top-7 left-0 rounded-md bg-emerald-950/90 px-2 py-1 text-xs font-medium text-emerald-100">
                    裁切框
                  </div>
                  <div className="pointer-events-auto">
                    {(['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'] as const).map((handle) =>
                      makeResizeHotzone(handle, (event, selectedHandle) => beginCropDrag(event, 'crop-resize', selectedHandle)),
                    )}
                    {(['nw', 'ne', 'sw', 'se'] as const).map((handle) =>
                      makeHandle(handle, (event, selectedHandle) => beginCropDrag(event, 'crop-resize', selectedHandle)),
                    )}
                  </div>
                </div>

                {showMaskOverlay &&
                  localMasks.map((mask) => {
                    const isSelected = selectedMaskIds.includes(mask.id)
                    const showHandles = (isSelected && selectedMaskIds.length === 1) || (!selectedMaskIds.length && hoveredMaskId === mask.id)
                    return (
                      <div
                        key={mask.id}
                        className={cn(
                          'absolute rounded-sm border bg-white/60 transition-colors',
                          hoveredMaskId === mask.id && 'bg-white/30',
                          isSelected
                            ? 'border-sky-500/75 shadow-[0_0_0_2px_rgba(14,165,233,0.14)]'
                            : (groupSizeByMaskId.get(mask.id) ?? 1) > 1
                              ? 'border-cyan-600/45 bg-cyan-50/55 shadow-[0_0_0_1px_rgba(8,145,178,0.08)]'
                            : 'border-amber-500/45 shadow-[0_0_0_1px_rgba(251,191,36,0.08)]',
                        )}
                        style={toStyle(mask.bbox, imageWidth, imageHeight)}
                        onPointerDown={(event) => beginMaskMove(event, mask)}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          void removeMasksByIds([mask.id])
                        }}
                        onPointerEnter={() => setHoveredMaskId(mask.id)}
                        onPointerLeave={() => setHoveredMaskId((current) => (current === mask.id ? null : current))}
                      >
                        <div className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 -translate-y-[15%] rounded-sm border border-slate-300/55 bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm">
                          {orderByMaskId.get(mask.id) ?? 1}
                        </div>
                        {showHandles &&
                          (
                            <>
                              {(['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'] as const).map((handle) =>
                                makeResizeHotzone(handle, (event, selectedHandle) => beginMaskResize(event, mask, selectedHandle)),
                              )}
                              {(['nw', 'ne', 'sw', 'se'] as const).map((handle) =>
                                makeHandle(handle, (event, selectedHandle) => beginMaskResize(event, mask, selectedHandle), {
                                  dimmed: drag?.kind === 'mask-resize' || drag?.kind === 'selection-resize',
                                }),
                              )}
                            </>
                          )}
                      </div>
                    )
                  })}

                {selectedGroupBox && selectedMaskIds.length > 1 ? (
                  <div
                    className="pointer-events-none absolute rounded-md border border-sky-500/60 border-dashed"
                    style={toStyle(selectedGroupBox, imageWidth, imageHeight)}
                  >
                    {canMergeSelectedMasks || canSplitSelectedMasks ? (
                      <div className="pointer-events-auto absolute bottom-full left-1/2 mb-2 -translate-x-1/2">
                       
                            <Button
                              type="button"
                              size="default"
                              variant="secondary"
                              className="h-8 rounded-full px-2.5 py-1"
                              onClick={() => void (canMergeSelectedMasks ? mergeSelectedMasksAsCard() : splitSelectedMasksToCards())}
                            >
                              {canMergeSelectedMasks ? '合并为一张卡' : '拆回独立卡片'}
                              <span className="ml-1 inline-flex items-center gap-1">
                                <Kbd className="min-w-0 px-1">Tab</Kbd>
                              </span>
                            </Button>
            
                      </div>
                    ) : null}
                    <div className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 rounded-md border border-sky-200/80 bg-sky-50/80 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 shadow-sm">
                      已选 {selectedMaskIds.length}
                    </div>
                    <div className="pointer-events-auto">
                      {(['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'] as const).map((handle) =>
                        makeResizeHotzone(handle, (event, selectedHandle) => beginSelectionResize(event, selectedHandle)),
                      )}
                      {(['nw', 'ne', 'sw', 'se'] as const).map((handle) =>
                        makeHandle(handle, (event, selectedHandle) => beginSelectionResize(event, selectedHandle), {
                          dimmed: drag?.kind === 'selection-resize',
                          sizeClass: 'size-[12px]',
                        }),
                      )}
                    </div>
                  </div>
                ) : null}

                {drag?.kind === 'selection-marquee' ? (
                  <div
                    className="pointer-events-none absolute rounded-md border border-sky-500/70 border-dashed bg-sky-500/5"
                    style={toStyle(
                      boxFromPoints(
                        drag.startPoint.x,
                        drag.startPoint.y,
                        drag.currentPoint.x,
                        drag.currentPoint.y,
                        imageWidth,
                        imageHeight,
                      ),
                      imageWidth,
                      imageHeight,
                    )}
                  />
                ) : null}

                {drag?.kind === 'order-trace' ? (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${imageWidth} ${imageHeight}`} preserveAspectRatio="none">
                    <polyline
                      points={drag.points
                        .map((point) => `${point.x},${point.y}`)
                        .join(' ')}
                      fill="none"
                      stroke="rgba(14,165,233,0.95)"
                      strokeWidth={12}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
      {footerSlot}
    </div>
  )
}

function makeResizeHotzone(
  handle: ResizeHandle,
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, handle: ResizeHandle) => void,
) {
  const positions: Record<ResizeHandle, string> = {
    n: 'left-1 right-1 -top-2 h-4 cursor-ns-resize',
    s: 'left-1 right-1 -bottom-2 h-4 cursor-ns-resize',
    e: 'top-1 bottom-1 -right-2 w-4 cursor-ew-resize',
    w: 'top-1 bottom-1 -left-2 w-4 cursor-ew-resize',
    nw: '-left-3 -top-3 size-6 cursor-nwse-resize',
    ne: '-right-3 -top-3 size-6 cursor-nesw-resize',
    sw: '-left-3 -bottom-3 size-6 cursor-nesw-resize',
    se: '-right-3 -bottom-3 size-6 cursor-nwse-resize',
  }

  return (
    <button
      type="button"
      aria-label={`resize-zone-${handle}`}
      className={cn('absolute z-10 rounded-full bg-transparent', positions[handle])}
      onPointerDown={(event) => onPointerDown(event, handle)}
    />
  )
}
