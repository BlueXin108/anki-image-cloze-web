import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ChevronDownIcon, ChevronUpIcon, CropIcon, PlusIcon, RotateCcwIcon, ScanSearchIcon, Undo2Icon, Redo2Icon, Trash2Icon, EyeIcon, EyeOffIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import type { BBox, CardDraft, MaskRect } from '@/types'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { ImageEditorInlineNavigation } from '@/components/editor/image-editor-inline-navigation'
import { ImageEditorLoadingOverlay } from '@/components/editor/image-editor-loading-overlay'
import { ImageEditorResetDialog } from '@/components/editor/image-editor-reset-dialog'
import { ImageEditorToolbar } from '@/components/editor/image-editor-toolbar'
import { cn } from '@/lib/utils'

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'
const HISTORY_LIMIT = 50
const WHEEL_HISTORY_INTERVAL_MS = 1200
const WHEEL_COMMIT_DEBOUNCE_MS = 1400

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
  readOnly?: boolean
  hideMetaBar?: boolean
  disableWheelResize?: boolean
  touchOptimized?: boolean
  onPreviousItem?: () => void
  onNextItem?: () => void
  canGoPrevious?: boolean
  canGoNext?: boolean
  onImageHoverChange?: (hovered: boolean) => void
  modernFloatingToolbar?: boolean
  allowLongPressDelete?: boolean
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
        'absolute z-20 rounded-full border border-white/90 bg-amber-400/85 shadow-sm shadow-amber-950/15 transition-opacity',
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
  footerSlot,
  imageClassName,
  focusLayout = false,
  readOnly = false,
  disableWheelResize = false,
  touchOptimized: _touchOptimized = false,
  onPreviousItem,
  onNextItem,
  canGoPrevious = false,
  canGoNext = false,
  onImageHoverChange,
  modernFloatingToolbar = true,
  allowLongPressDelete = true,
}: ImageEditorProps) {
  const mobileModeEnabled = _touchOptimized && !readOnly
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
  const wheelCommitTimeoutRef = useRef<number | null>(null)
  const wheelPendingMasksRef = useRef<MaskRect[] | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const pendingPointerRef = useRef<{ clientX: number; clientY: number } | null>(null)
  const pointerFrameRef = useRef<number | null>(null)
  const mergeBounceTimeoutRef = useRef<number | null>(null)
  const [localMasks, setLocalMasks] = useState<MaskRect[]>(normalizedDraftMasks)
  const [localCrop, setLocalCrop] = useState<BBox>(resolveDisplayedCrop(draft, imageWidth, imageHeight))
  const [selectedMaskIds, setSelectedMaskIds] = useState<string[]>([])
  const [mergeBouncedMaskIds, setMergeBouncedMaskIds] = useState<string[]>([])
  const [drag, setDrag] = useState<DragState | null>(null)
  const [showOcrOverlay, setShowOcrOverlay] = useState(false)
  const [showMaskOverlay, setShowMaskOverlay] = useState(true)
  const [sourceImageLoaded, setSourceImageLoaded] = useState(false)
  const [showViewportScrollButtons, setShowViewportScrollButtons] = useState(false)
  const [mobileInteractionMode, setMobileInteractionMode] = useState<'navigate' | 'crop' | 'select' | 'sort'>('navigate')

  const scrollViewport = (offsetY: number) => {
    if (editorViewportRef.current) {
      editorViewportRef.current.scrollBy({ top: offsetY, behavior: 'smooth' })
    }
  }
  const [hoveredMaskId, setHoveredMaskId] = useState<string | null>(null)
  const [imageFrameHovered, setImageFrameHovered] = useState(false)
  const [pointerInsideEditor, setPointerInsideEditor] = useState(false)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [normalViewportWidth, setNormalViewportWidth] = useState<number | null>(null)
  const [focusViewportSize, setFocusViewportSize] = useState<{ width: number; height: number } | null>(null)
  const [windowHeight, setWindowHeight] = useState<number>(() => (typeof window === 'undefined' ? 900 : window.innerHeight))
  useEffect(() => {
    if (!_touchOptimized) {
      setShowViewportScrollButtons(false)
      return
    }

    const viewport = editorViewportRef.current
    if (!viewport) return

    const updateVisibility = () => {
      setShowViewportScrollButtons(viewport.scrollHeight - viewport.clientHeight > 12)
    }

    updateVisibility()
    viewport.addEventListener('scroll', updateVisibility, { passive: true })
    window.addEventListener('resize', updateVisibility)

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateVisibility())
      observer.observe(viewport)
    }

    return () => {
      viewport.removeEventListener('scroll', updateVisibility)
      window.removeEventListener('resize', updateVisibility)
      observer?.disconnect()
    }
  }, [_touchOptimized, focusLayout, imageWidth, imageHeight, localCrop, localMasks.length, sourceImageLoaded])

  const selectedMaskIdSet = useMemo(() => new Set(selectedMaskIds), [selectedMaskIds])
  const normalizedLocalMasks = useMemo(() => normalizeMaskGroups(localMasks), [localMasks])
  const selectedMasks = useMemo(
    () => localMasks.filter((mask) => selectedMaskIdSet.has(mask.id)),
    [localMasks, selectedMaskIdSet],
  )
  const selectedGroupBox = boundingBoxOfMasks(selectedMasks)
  const orderByMaskId = useMemo(
    () => new Map(normalizedLocalMasks.map((mask) => [mask.id, mask.card_order ?? 1])),
    [normalizedLocalMasks],
  )
  const groupSizeByMaskId = useMemo(() => {
    const counts = new Map<string, number>()
    normalizedLocalMasks.forEach((mask) => {
      const groupId = maskGroupId(mask)
      counts.set(groupId, (counts.get(groupId) ?? 0) + 1)
    })
    return new Map(normalizedLocalMasks.map((mask) => [mask.id, counts.get(maskGroupId(mask)) ?? 1]))
  }, [normalizedLocalMasks])
  const selectedGroupIds = useMemo(
    () => [...new Set(selectedMasks.map((mask) => maskGroupId(mask)))],
    [selectedMasks],
  )
  const canMergeSelectedMasks = selectedMaskIds.length > 1 && selectedGroupIds.length > 1
  const canSplitSelectedMasks =
    selectedMaskIds.length > 1 &&
    selectedGroupIds.length === 1 &&
    masksInGroups(localMasks, selectedGroupIds).length === selectedMaskIds.length
  const showInlineImageNavigation = !focusLayout && (canGoPrevious || canGoNext)
  const showInlineImageNavigationWhileHovered =
    showInlineImageNavigation && (_touchOptimized || imageFrameHovered || pointerInsideEditor)
  const mobileCropMode = mobileModeEnabled && mobileInteractionMode === 'crop'
  const mobileSelectMode = mobileModeEnabled && mobileInteractionMode === 'select'
  const mobileSortMode = mobileModeEnabled && mobileInteractionMode === 'sort'
  const cropModeActive = !_touchOptimized || mobileCropMode
  const selectionModeActive = !_touchOptimized || mobileSelectMode

  useEffect(() => {
    setSourceImageLoaded(false)
    const img = imageRef.current
    if (img && img.complete && img.naturalWidth > 0) {
      setSourceImageLoaded(true)
    }
  }, [draft.id, sourceImageUrl])

  useEffect(() => {
    if (!mobileModeEnabled) {
      setMobileInteractionMode('navigate')
    }
  }, [mobileModeEnabled, draft.id])

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

  const captureSnapshot = (): EditorSnapshot => ({
    masks: cloneMasks(localMasksRef.current),
    crop: [...localCropRef.current] as BBox,
  })

  const pushHistorySnapshot = () => {
    undoStackRef.current = [...undoStackRef.current, captureSnapshot()].slice(-HISTORY_LIMIT)
    redoStackRef.current = []
  }

  const cancelPendingWheelCommit = () => {
    if (wheelCommitTimeoutRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(wheelCommitTimeoutRef.current)
    }
    wheelCommitTimeoutRef.current = null
    wheelPendingMasksRef.current = null
  }

  const commitMasksImmediate = async (masks: MaskRect[]) => {
    cancelPendingWheelCommit()
    wheelHistoryRef.current = null
    await onMasksCommit(masks)
  }

  const queueWheelMasksCommit = (masks: MaskRect[]) => {
    cancelPendingWheelCommit()
    wheelPendingMasksRef.current = cloneMasks(masks)
    if (typeof window === 'undefined') {
      return
    }
    wheelCommitTimeoutRef.current = window.setTimeout(() => {
      wheelCommitTimeoutRef.current = null
      const pendingMasks = wheelPendingMasksRef.current
      wheelPendingMasksRef.current = null
      wheelHistoryRef.current = null
      if (!pendingMasks) return
      void onMasksCommit(pendingMasks)
    }, WHEEL_COMMIT_DEBOUNCE_MS)
  }

  useEffect(
    () => () => {
      cancelPendingWheelCommit()
      if (mergeBounceTimeoutRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(mergeBounceTimeoutRef.current)
      }
      if (pointerFrameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(pointerFrameRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (drag) return
    const draftChanged = lastDraftIdRef.current !== draft.id
    const nextDraftMasks = normalizeMaskGroups(draft.masks)
    const draftMasksChanged = !sameMasks(lastDraftMasksRef.current, nextDraftMasks)
    if (draftChanged || draftMasksChanged) {
      cancelPendingWheelCommit()
      wheelHistoryRef.current = null
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
      cancelPendingWheelCommit()
      wheelHistoryRef.current = null
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

  useEffect(() => {
    dragRef.current = drag
  }, [drag])

  const applySnapshot = async (snapshot: EditorSnapshot) => {
    const nextMasks = cloneMasks(snapshot.masks)
    const nextCrop = [...snapshot.crop] as BBox
    cancelPendingWheelCommit()
    wheelHistoryRef.current = null
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
    const viewport = editorViewportRef.current
    if (!viewport) return

    const measure = () => {
      if (focusLayout) {
        const viewportPadding = 16
        setFocusViewportSize({
          width: Math.max(0, viewport.clientWidth - viewportPadding),
          height: Math.max(0, viewport.clientHeight - viewportPadding),
        })
        return
      }

      const horizontalPadding = 32
      setNormalViewportWidth(Math.max(0, viewport.clientWidth - horizontalPadding))
    }

    measure()

    const observer = new ResizeObserver(() => {
      measure()
    })
    observer.observe(viewport)

    return () => {
      observer.disconnect()
    }
  }, [focusLayout])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const updateWindowHeight = () => {
      setWindowHeight(window.innerHeight)
    }

    updateWindowHeight()
    window.addEventListener('resize', updateWindowHeight)
    return () => window.removeEventListener('resize', updateWindowHeight)
  }, [])

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
    if (readOnly) return
    if (maskIds.length === 0) return
    pushHistorySnapshot()
    const maskIdSet = new Set(maskIds)
    const next = localMasksRef.current.filter((mask) => !maskIdSet.has(mask.id))
    setLocalMasks(next)
    localMasksRef.current = next
    setSelectedMaskIds([])
    await commitMasksImmediate(next)
  }

  useEffect(() => {
    if (readOnly) return
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
        if (event.key.toLowerCase() === 'a' && canGoPrevious) {
          event.preventDefault()
          onPreviousItem?.()
          return
        }
        if (event.key.toLowerCase() === 'd' && canGoNext) {
          event.preventDefault()
          onNextItem?.()
          return
        }
        if (event.key.toLowerCase() === 'e' && selectedMaskIds.length > 0) {
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
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canGoNext, canGoPrevious, canMergeSelectedMasks, canSplitSelectedMasks, onNextItem, onPreviousItem, readOnly, selectedMaskIds])

  useEffect(() => {
    if (!drag) return

    const flushPendingPointerMove = () => {
      pointerFrameRef.current = null
      const activeDrag = dragRef.current
      const pendingPointer = pendingPointerRef.current
      if (!activeDrag || !pendingPointer) return

      if (activeDrag.kind === 'order-trace') {
        const point = clientToImagePoint(pendingPointer.clientX, pendingPointer.clientY)
        const hitMask = [...localMasksRef.current].reverse().find((mask) => pointInBox(point, mask.bbox))
        const hitGroupId = hitMask ? maskGroupId(hitMask) : null
        setDrag((current) => {
          if (!current || current.kind !== 'order-trace') return current
          return {
            kind: 'order-trace',
            points: [...current.points, point],
            visitedGroupIds:
              hitGroupId && !current.visitedGroupIds.includes(hitGroupId)
                ? [...current.visitedGroupIds, hitGroupId]
                : current.visitedGroupIds,
          }
        })
        return
      }

      const displaySize = getDisplaySize()
      const dx = ((pendingPointer.clientX - activeDrag.startX) / Math.max(displaySize.width, 1)) * imageWidth
      const dy = ((pendingPointer.clientY - activeDrag.startY) / Math.max(displaySize.height, 1)) * imageHeight

      if (activeDrag.kind === 'mask-move') {
        setLocalMasks((current) =>
          current.map((mask) => {
            const startBBox = activeDrag.startMasks[mask.id]
            if (!startBBox) return mask
            return { ...mask, bbox: moveBox(startBBox, dx, dy, imageWidth, imageHeight) }
          }),
        )
        return
      }

      if (activeDrag.kind === 'mask-resize') {
        setLocalMasks((current) =>
          current.map((mask) =>
            mask.id === activeDrag.maskId
              ? { ...mask, bbox: resizeBox(activeDrag.startBBox, activeDrag.handle, dx, dy, imageWidth, imageHeight) }
              : mask,
          ),
        )
        return
      }

      if (activeDrag.kind === 'crop-move') {
        setLocalCrop(moveBox(activeDrag.startBBox, dx, dy, imageWidth, imageHeight))
        return
      }

      if (activeDrag.kind === 'crop-resize') {
        setLocalCrop(resizeBox(activeDrag.startBBox, activeDrag.handle, dx, dy, imageWidth, imageHeight))
        return
      }

      if (activeDrag.kind === 'selection-resize') {
        const resized = resizeBoxesAroundOwnCenter(
          activeDrag.startMasks,
          activeDrag.maskIds,
          activeDrag.handle,
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

      if (activeDrag.kind === 'selection-marquee') {
        const point = clientToImagePoint(pendingPointer.clientX, pendingPointer.clientY)
        const marqueeBox = boxFromPoints(activeDrag.startPoint.x, activeDrag.startPoint.y, point.x, point.y, imageWidth, imageHeight)
        setDrag((current) => {
          if (!current || current.kind !== 'selection-marquee') return current
          return {
            ...current,
            currentX: pendingPointer.clientX,
            currentY: pendingPointer.clientY,
            currentPoint: point,
          }
        })
        setSelectedMaskIds(localMasksRef.current.filter((mask) => boxesIntersect(mask.bbox, marqueeBox)).map((mask) => mask.id))
        return
      }

      const point = clientToImagePoint(pendingPointer.clientX, pendingPointer.clientY)
      setLocalMasks((current) =>
        current.map((mask) =>
          mask.id === activeDrag.maskId
            ? { ...mask, bbox: boxFromPoints(activeDrag.startPoint.x, activeDrag.startPoint.y, point.x, point.y, imageWidth, imageHeight) }
            : mask,
        ),
      )
    }

    const onPointerMove = (event: PointerEvent) => {
      pendingPointerRef.current = { clientX: event.clientX, clientY: event.clientY }
      if (pointerFrameRef.current !== null || typeof window === 'undefined') return
      pointerFrameRef.current = window.requestAnimationFrame(flushPendingPointerMove)
    }

    const onPointerUp = async () => {
      if (pointerFrameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(pointerFrameRef.current)
        flushPendingPointerMove()
      }
      const active = drag
      pendingPointerRef.current = null
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
          await commitMasksImmediate(next)
        }
        return
      }
      if (active.kind === 'crop-move' || active.kind === 'crop-resize') {
        await onCropCommit(localCropRef.current)
        return
      }
      await commitMasksImmediate(localMasksRef.current)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
    window.addEventListener('pointercancel', onPointerUp, { once: true })
    return () => {
      if (pointerFrameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(pointerFrameRef.current)
        pointerFrameRef.current = null
      }
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [drag, imageHeight, imageWidth, onCropCommit, onMasksCommit])


  const beginCropDrag = (event: ReactPointerEvent<HTMLElement>, kind: 'crop-move' | 'crop-resize', handle?: ResizeHandle) => {
    if (readOnly) return
    if (_touchOptimized && !mobileCropMode) return
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
    if (readOnly) return
    const displaySize = getDisplaySize()
    if (displaySize.width < 2 || displaySize.height < 2 || event.altKey) return
    if (_touchOptimized && mobileSortMode) {
      beginOrderTrace(event as unknown as ReactPointerEvent<HTMLDivElement>, true)
      return
    }
    if (event.button === 1) {
      beginOrderTrace(event as unknown as ReactPointerEvent<HTMLDivElement>)
      return
    }
    if (event.button !== 0) return
    if (_touchOptimized && mobileSelectMode) {
      event.preventDefault()
      event.stopPropagation()
      setSelectedMaskIds((current) =>
        current.includes(mask.id) ? current.filter((id) => id !== mask.id) : [...current, mask.id],
      )
      return
    }
    event.preventDefault()
    event.stopPropagation()

    if (event.ctrlKey || event.metaKey) {
      setSelectedMaskIds((current) =>
        current.includes(mask.id) ? current.filter((id) => id !== mask.id) : [...current, mask.id],
      )
      return
    }

    event.preventDefault()
    event.stopPropagation()
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
    if (readOnly) return
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
    if (readOnly) return
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
    if (readOnly) return
    const displaySize = getDisplaySize()
    if (displaySize.width < 2 || displaySize.height < 2) return
    const point = clientToImagePoint(event.clientX, event.clientY)

    if (_touchOptimized && mobileSortMode) {
      beginOrderTrace(event, true)
      return
    }

    if (!event.altKey) {
      if (event.target === event.currentTarget) {
        event.preventDefault()
        event.stopPropagation()
        if (selectionModeActive) {
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
          return
        }
      }
      return
    }

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
    event.preventDefault()
    event.stopPropagation()
    const next = normalizeMaskGroups([...localMasksRef.current, nextMask])
    pushHistorySnapshot()
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
    if (readOnly) return
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
    await commitMasksImmediate(normalized)
  }

  const removeSelectedMask = async () => {
    if (readOnly) return
    await removeMasksByIds(selectedMaskIds)
  }

  const resetEditor = async () => {
    if (readOnly) return
    pushHistorySnapshot()
    cancelPendingWheelCommit()
    wheelHistoryRef.current = null
    const nextMasks: MaskRect[] = []
    const nextCrop: BBox = [0, 0, imageWidth, imageHeight]
    setLocalMasks(nextMasks)
    setLocalCrop(nextCrop)
    localMasksRef.current = nextMasks
    localCropRef.current = nextCrop
    setSelectedMaskIds([])
    setHoveredMaskId(null)
    setDrag(null)
    await Promise.all([onMasksCommit(nextMasks), onCropCommit(nextCrop)])
  }

  const mergeSelectedMasksAsCard = async () => {
    if (readOnly) return
    if (!canMergeSelectedMasks) return
    pushHistorySnapshot()
    const bouncedMaskIds = [...selectedMaskIds]
    const next = mergeMasksIntoCard(localMasksRef.current, selectedMaskIds)
    setLocalMasks(next)
    localMasksRef.current = next
    const mergedGroupIds = [...new Set(next.filter((mask) => selectedMaskIds.includes(mask.id)).map((mask) => maskGroupId(mask)))]
    setSelectedMaskIds(masksInGroups(next, mergedGroupIds))
    setMergeBouncedMaskIds(bouncedMaskIds)
    if (mergeBounceTimeoutRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(mergeBounceTimeoutRef.current)
    }
    if (typeof window !== 'undefined') {
      mergeBounceTimeoutRef.current = window.setTimeout(() => {
        setMergeBouncedMaskIds([])
        mergeBounceTimeoutRef.current = null
      }, 460)
    }
    await commitMasksImmediate(next)
  }

  const splitSelectedMasksToCards = async () => {
    if (readOnly) return
    if (!canSplitSelectedMasks) return
    pushHistorySnapshot()
    const next = splitMasksIntoCards(localMasksRef.current, selectedMaskIds)
    setLocalMasks(next)
    localMasksRef.current = next
    setSelectedMaskIds(selectedMaskIds)
    await commitMasksImmediate(next)
  }

  const beginOrderTrace = (event: ReactPointerEvent<HTMLDivElement>, allowPrimary = false) => {
    if (readOnly) return
    if (!allowPrimary && event.button !== 1) return
    if (allowPrimary && event.button !== 0) return
    const displaySize = getDisplaySize()
    if (displaySize.width < 2 || displaySize.height < 2) return
    const point = clientToImagePoint(event.clientX, event.clientY)
    const hitMask = [...localMasksRef.current].reverse().find((mask) => pointInBox(point, mask.bbox))
    const visitedGroupIds = hitMask ? [maskGroupId(hitMask)] : []
    event.preventDefault()
    event.stopPropagation()
    pushHistorySnapshot()
    setDrag({
      kind: 'order-trace',
      points: [point],
      visitedGroupIds,
    })
  }

  const resizeMasksByWheel = async (maskIds: string[], deltaY: number) => {
    if (readOnly) return
    if (maskIds.length === 0) return
    const historyKey = maskIds.slice().sort().join('|')
    const now = Date.now()
    if (
      !wheelHistoryRef.current ||
      wheelHistoryRef.current.key !== historyKey ||
      now - wheelHistoryRef.current.at > WHEEL_HISTORY_INTERVAL_MS
    ) {
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
    localMasksRef.current = next
    queueWheelMasksCommit(next)
  }

  const selectedCount = selectedMaskIds.length
  const aspectRatio = imageHeight > 0 ? imageWidth / imageHeight : 1
  const normalMaxHeight = Math.max(240, Math.floor(windowHeight * 0.9))
  const normalTargetWidth =
    !focusLayout && normalViewportWidth
      ? Math.max(120, Math.min(normalViewportWidth, Math.floor(normalMaxHeight * aspectRatio)))
      : null
  // 【核心经验固化】：为什么移动端绝对不能开启此计算逻辑？
  // 当 DialogContent 也是 h-fit 脱离绝对全屏限制时，如果内部 Image 尝试根据父容器的大小（focusViewportSize）去 max-width/max-height 去限制自身，
  // 就会触发“缩小死循环”，因此只要是自适应模式（_touchOptimized），此规则直接 bypass
  const isFocusImageSmallerThanViewport =
    focusLayout &&
    !!focusViewportSize &&
    imageWidth <= focusViewportSize.width &&
    imageHeight <= focusViewportSize.height
  const shouldFillTouchFocusViewport = focusLayout && _touchOptimized && !!focusViewportSize && !isFocusImageSmallerThanViewport
  const focusImageStyle =
    focusLayout && focusViewportSize
      ? _touchOptimized
        ? shouldFillTouchFocusViewport
          ? {
              width: `${focusViewportSize.width}px`,
              maxWidth: 'none',
            }
          : undefined
        : {
            maxWidth: `${focusViewportSize.width}px`,
            maxHeight: `${focusViewportSize.height}px`,
          }
      : undefined
  const resolvedImageClassName = cn(
    focusLayout
      ? shouldFillTouchFocusViewport
        ? 'block h-auto w-full max-w-none object-contain align-top'
        : 'block h-auto w-auto max-w-full object-contain align-top'
      : 'block h-auto w-auto object-contain align-top',
    imageClassName,
  )

  const hasLeadingControls = !readOnly || showOcrTools
  const useModernUI = modernFloatingToolbar && !readOnly
  const renderLegacyControls = hasLeadingControls && !useModernUI
  
  const modernToolbarElement = useModernUI ? (
    <ImageEditorToolbar
      touchOptimized={_touchOptimized}
      focusLayout={focusLayout}
      mobileInteractionMode={mobileInteractionMode}
      selectedCount={selectedCount}
      canUndo={undoStackRef.current.length > 0}
      canRedo={redoStackRef.current.length > 0}
      showMaskOverlay={showMaskOverlay}
      showCropSubmit={showCropSubmit && (!_touchOptimized || mobileCropMode)}
      onAddMask={addMask}
      onRemoveSelected={removeSelectedMask}
      onUndo={() => void undo()}
      onRedo={() => void redo()}
      onSetMobileInteractionMode={setMobileInteractionMode}
      onToggleMaskOverlay={() => setShowMaskOverlay((current) => !current)}
      onSubmitCrop={() => void onCropCommit(localCrop)}
      onReset={() => setResetConfirmOpen(true)}
    />
  ) : null

  return (
    <div
      className={cn('flex flex-col gap-4', focusLayout && 'h-full min-h-0 overflow-hidden')}
      onContextMenuCapture={(event) => {
        if (!_touchOptimized) return
        event.preventDefault()
      }}
      style={_touchOptimized ? { WebkitTouchCallout: 'none' } : undefined}
    >
      {useModernUI && !_touchOptimized && !focusLayout ? (
        <div className="flex shrink-0 w-full justify-center">{modernToolbarElement}</div>
      ) : null}
      
      {renderLegacyControls ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
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
            {showOcrTools && (
              <Button variant={showOcrOverlay ? 'secondary' : 'outline'} size="sm" onClick={() => setShowOcrOverlay((current) => !current)}>
                <ScanSearchIcon data-icon="inline-start" />
                {showOcrOverlay ? '隐藏 OCR 预览' : '显示 OCR 预览'}
              </Button>
            )}
            <Button
              variant={showMaskOverlay ? 'secondary' : 'outline'}
              size="icon-sm"
              title={showMaskOverlay ? '隐藏遮罩' : '显示遮罩'}
              className={cn("size-8", showMaskOverlay && 'border-amber-400/60 bg-amber-500/10 text-foreground')}
              onClick={() => setShowMaskOverlay((current) => !current)}
            >
              {showMaskOverlay ? <EyeIcon className="size-4" /> : <EyeOffIcon className="size-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              title="重置"
              className={cn("size-8")}
              onClick={() => setResetConfirmOpen(true)}
            >
              <RotateCcwIcon className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <div className={cn('relative', focusLayout && 'min-h-0 flex flex-1')}>
        <div
          ref={editorViewportRef}
          className={cn(
            'relative rounded-2xl border border-border bg-[radial-gradient(circle_at_top,_rgba(255,202,117,0.14),_transparent_42%),linear-gradient(180deg,rgba(10,14,18,0.06),transparent_30%)] p-4',
            _touchOptimized
              ? cn(
                  'overflow-y-auto overflow-x-hidden scrollbar-hide [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
                  selectionModeActive || mobileCropMode || mobileSortMode ? 'touch-none' : '[touch-action:pinch-zoom]',
                )
              : 'overflow-hidden touch-none',
            focusLayout && 'min-h-0 flex flex-1 p-2',
          )}
          onPointerEnter={() => setPointerInsideEditor(true)}
          onPointerLeave={() => {
            setPointerInsideEditor(false)
            setHoveredMaskId(null)
          }}
        >
          {useModernUI && !_touchOptimized && focusLayout ? modernToolbarElement : null}
          <div
          className={cn(
            'flex justify-center',
            focusLayout &&
              (_touchOptimized
                ? 'w-full flex-1 items-start'
                : 'w-full min-h-full flex-1 items-center justify-center'),
          )}
        >
          <div
            className={cn(
              'inline-block max-w-full rounded-xl border border-border bg-background/90 shadow-sm',
              focusLayout && 'overflow-visible',
              shouldFillTouchFocusViewport && 'w-full',
            )}
          >
            <div
              className="relative inline-block max-w-full align-top"
              onPointerEnter={() => {
                setImageFrameHovered(true)
                onImageHoverChange?.(true)
              }}
              onPointerLeave={() => {
                setImageFrameHovered(false)
                onImageHoverChange?.(false)
              }}
            >
              {!sourceImageLoaded ? <ImageEditorLoadingOverlay /> : null}
              <img
                ref={imageRef}
                src={sourceImageUrl}
                alt="Source"
                decoding="async"
                draggable={false}
                className={resolvedImageClassName}
                onLoad={() => setSourceImageLoaded(true)}
                onError={() => setSourceImageLoaded(true)}
                style={{
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  ...(focusLayout
                    ? focusImageStyle
                    : normalTargetWidth
                      ? {
                          width: `${normalTargetWidth}px`,
                          maxWidth: '100%',
                        }
                      : {})
                }}
              />

              <ImageEditorInlineNavigation
                visible={showInlineImageNavigationWhileHovered}
                canGoPrevious={canGoPrevious}
                canGoNext={canGoNext}
                onPreviousItem={onPreviousItem}
                onNextItem={onNextItem}
              />

              <div
                className="absolute inset-0"
                onPointerDown={(event) => {
                  if (readOnly) return
                  if (_touchOptimized && mobileSortMode) {
                    beginOrderTrace(event, true)
                    return
                  }
                  if (event.button === 1) {
                    beginOrderTrace(event)
                    return
                  }
                  beginMaskDraw(event)
                }}
                onWheelCapture={(event) => {
                  if (readOnly) return
                  if (disableWheelResize) return
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
                      className="pointer-events-none absolute rounded-md border border-border/70 bg-foreground/5"
                      style={toStyle(region.bbox, imageWidth, imageHeight)}
                    >
                      <span className="absolute -top-6 left-0 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[11px] text-background">
                        {region.text || region.region_type}
                      </span>
                    </div>
                  ))}

                {cropModeActive ? (
                  <div
                    className="pointer-events-none absolute rounded-xl border-2 border-dashed border-amber-400/90 bg-amber-300/10"
                    style={toStyle(localCrop, imageWidth, imageHeight)}
                  >
                    <div className="absolute top-[98%] mb-4 left-0 rounded-sm bg-amber-950/90 px-1.5 py-0.5 text-[10px] leading-none font-medium text-amber-100">
                      裁切框
                    </div>
                    {!readOnly ? (
                      <div className="pointer-events-auto">
                        {(['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'] as const).map((handle) =>
                          <Fragment key={`crop-hotzone-${handle}`}>
                            {makeResizeHotzone(handle, (event, selectedHandle) => beginCropDrag(event, 'crop-resize', selectedHandle))}
                          </Fragment>,
                        )}
                        {(['nw', 'ne', 'sw', 'se'] as const).map((handle) =>
                          <Fragment key={`crop-handle-${handle}`}>
                            {makeHandle(handle, (event, selectedHandle) => beginCropDrag(event, 'crop-resize', selectedHandle))}
                          </Fragment>,
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {showMaskOverlay &&
                  localMasks.map((mask) => {
                    const isSelected = selectedMaskIds.includes(mask.id)
                    const showHandles =
                      !readOnly &&
                      ((isSelected && selectedMaskIds.length === 1) || (!selectedMaskIds.length && hoveredMaskId === mask.id))
                    return (
                      <motion.div
                        key={mask.id}
                        className={cn(
                          'absolute rounded-sm border transition-colors',
                          isSelected
                            ? 'border-amber-500 bg-amber-400/25 shadow-[0_0_0_2px_rgba(245,158,11,0.35)]'
                            : (groupSizeByMaskId.get(mask.id) ?? 1) > 1
                              ? 'border-slate-500/45 bg-slate-100/60 shadow-[0_0_0_1px_rgba(100,116,139,0.08)]'
                            : 'border-amber-500/45 bg-white/60 shadow-[0_0_0_1px_rgba(251,191,36,0.08)]',
                          !isSelected && hoveredMaskId === mask.id && 'bg-white/30',
                          isSelected && hoveredMaskId === mask.id && 'bg-amber-400/15',
                        )}
                        style={toStyle(mask.bbox, imageWidth, imageHeight)}
                        animate={
                          mergeBouncedMaskIds.includes(mask.id)
                            ? { scale: [1, 1.06, 0.97, 1] }
                            : { scale: 1 }
                        }
                        transition={
                          mergeBouncedMaskIds.includes(mask.id)
                            ? { duration: 0.46, ease: [0.34, 1.56, 0.64, 1], times: [0, 0.28, 0.62, 1] }
                            : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }
                        }
                        onPointerDown={(event) => beginMaskMove(event, mask)}
                        onContextMenu={(event) => {
                          if (_touchOptimized && !allowLongPressDelete) return
                          event.preventDefault()
                          event.stopPropagation()
                          void removeMasksByIds([mask.id])
                        }}
                        onPointerEnter={() => setHoveredMaskId(mask.id)}
                        onPointerLeave={() => setHoveredMaskId((current) => (current === mask.id ? null : current))}
                      >
                        <div className={cn(
                          "pointer-events-none absolute left-1/2 top-full -translate-x-1/2 -translate-y-[15%] rounded-sm border px-1.5 py-0.5 text-[10px] font-medium shadow-sm transition-colors",
                          isSelected 
                            ? "border-amber-400/60 bg-amber-50 text-amber-900" 
                            : "border-slate-300/55 bg-white/80 text-slate-600"
                        )}>
                          {orderByMaskId.get(mask.id) ?? 1}
                        </div>
                        {showHandles &&
                          (
                            <>
                              {(['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'] as const).map((handle) =>
                                <Fragment key={`mask-${mask.id}-hotzone-${handle}`}>
                                  {makeResizeHotzone(handle, (event, selectedHandle) => beginMaskResize(event, mask, selectedHandle))}
                                </Fragment>,
                              )}
                              {(['nw', 'ne', 'sw', 'se'] as const).map((handle) =>
                                <Fragment key={`mask-${mask.id}-handle-${handle}`}>
                                  {makeHandle(handle, (event, selectedHandle) => beginMaskResize(event, mask, selectedHandle), {
                                    dimmed: drag?.kind === 'mask-resize' || drag?.kind === 'selection-resize',
                                  })}
                                </Fragment>,
                              )}
                            </>
                          )}
                      </motion.div>
                    )
                  })}

                {selectedGroupBox && selectedMaskIds.length > 1 && !readOnly && (!_touchOptimized || mobileSelectMode) ? (
                  <div
                    className="pointer-events-none absolute rounded-md border border-amber-500/70 border-dashed"
                    style={toStyle(selectedGroupBox, imageWidth, imageHeight)}
                  >
                    <AnimatePresence initial={false}>
                      {canMergeSelectedMasks || canSplitSelectedMasks ? (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                          className="pointer-events-auto absolute bottom-full left-1/2 mb-2 -translate-x-1/2 z-[70]"
                        >
                          <Button
                            type="button"
                            size="default"
                            variant="secondary"
                            className="h-8 rounded-full px-2.5 py-1"
                            onClick={() => void (canMergeSelectedMasks ? mergeSelectedMasksAsCard() : splitSelectedMasksToCards())}
                          >
                            <span>{canMergeSelectedMasks ? '合并为一张卡' : '拆回独立卡片'}</span>
                            <Kbd className="ml-1.5 px-1.5 py-0 text-[10px] leading-none">Tab</Kbd>
                          </Button>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                    <div className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 rounded-md border border-amber-200/80 bg-amber-50/85 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 shadow-sm">
                      已选 {selectedMaskIds.length}
                    </div>
                    <div className="pointer-events-auto">
                      {(['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'] as const).map((handle) =>
                        <Fragment key={`selection-hotzone-${handle}`}>
                          {makeResizeHotzone(handle, (event, selectedHandle) => beginSelectionResize(event, selectedHandle))}
                        </Fragment>,
                      )}
                      {(['nw', 'ne', 'sw', 'se'] as const).map((handle) =>
                        <Fragment key={`selection-handle-${handle}`}>
                          {makeHandle(handle, (event, selectedHandle) => beginSelectionResize(event, selectedHandle), {
                            dimmed: drag?.kind === 'selection-resize',
                            sizeClass: 'size-[12px]',
                          })}
                        </Fragment>,
                      )}
                    </div>
                  </div>
                ) : null}

                {drag?.kind === 'selection-marquee' ? (
                  <div
                    className="pointer-events-none absolute rounded-md border border-amber-500/70 border-dashed bg-amber-500/5"
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
                      stroke="rgba(245,158,11,0.95)"
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
        {_touchOptimized && showViewportScrollButtons ? (
          <>
            <div className="pointer-events-none absolute right-2 top-2 z-[45] flex justify-end">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="pointer-events-auto size-8 rounded-full border border-border/55 bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => scrollViewport(-250)}
              >
                <ChevronUpIcon className="size-4" />
                <span className="sr-only">向上滚动图片</span>
              </Button>
            </div>
            <div className="pointer-events-none absolute right-2 bottom-2 z-[45] flex justify-end">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="pointer-events-auto size-8 rounded-full border border-border/55 bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => scrollViewport(250)}
              >
                <ChevronDownIcon className="size-4" />
                <span className="sr-only">向下滚动图片</span>
              </Button>
            </div>
          </>
        ) : null}
      </div>
      
      {useModernUI && _touchOptimized ? (
        <div className="shrink-0 pt-2 pb-1 relative z-[60]">
          {modernToolbarElement}
        </div>
      ) : null}


      {footerSlot}

      <ImageEditorResetDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        onConfirm={() => void resetEditor()}
      />
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
