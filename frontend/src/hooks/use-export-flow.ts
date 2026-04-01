import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { parseTagInput } from '@/lib/workbench-state'
import type { CardDraft, DraftListItem } from '@/types'

export type ExportFlowStage = 'review' | 'confirm'
type ExportDraftEdit = { deck: string; tags: string[] }

interface UseExportFlowParams {
  draftItems: DraftListItem[]
  exportQueue: DraftListItem[]
  selectedItem: DraftListItem | null
  loadingKey: string | null
  patchDraft: (payload: {
    draftId: string
    deck?: string | null
    tags?: string[]
    reviewStatus?: CardDraft['review_status']
    importedNoteId?: number | null
    lastImportedAt?: string | null
  }) => Promise<CardDraft | null>
  importDraftsToAnki: (targets: DraftListItem[]) => Promise<{ successCount: number; failedCount: number }>
  run: (key: string, action: () => Promise<void>) => Promise<void>
}

export function useExportFlow({
  draftItems,
  exportQueue,
  selectedItem,
  loadingKey,
  patchDraft,
  importDraftsToAnki,
  run,
}: UseExportFlowParams) {
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportStage, setExportStage] = useState<ExportFlowStage>('review')
  const [exportIndex, setExportIndex] = useState(0)
  const [reviewedDraftIds, setReviewedDraftIds] = useState<string[]>([])
  const [exportDraftEdits, setExportDraftEdits] = useState<Record<string, ExportDraftEdit>>({})
  const [deckInput, setDeckInput] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [quality, setQuality] = useState(80)
  const deferredPersistTimeoutRef = useRef<number | null>(null)

  const persistDraftEdit = async (draftId: string, deck: string, tags: string[]) => {
    await patchDraft({ draftId, deck, tags })
  }

  useEffect(() => {
    return () => {
      if (deferredPersistTimeoutRef.current !== null) {
        window.clearTimeout(deferredPersistTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!exportDialogOpen) return
    if (exportQueue.length === 0) {
      setExportDialogOpen(false)
      return
    }
    if (exportIndex >= exportQueue.length) {
      setExportIndex(Math.max(0, exportQueue.length - 1))
    }
  }, [exportDialogOpen, exportIndex, exportQueue.length])

  useEffect(() => {
    if (!exportDialogOpen) return
    const currentItem = exportQueue[exportIndex]
    if (!currentItem) return
    const currentEdit = exportDraftEdits[currentItem.draft.id]
    setDeckInput(currentEdit?.deck ?? currentItem.draft.deck ?? '')
    setTagsInput((currentEdit?.tags ?? currentItem.draft.tags).join(', '))
  }, [exportDialogOpen, exportDraftEdits, exportIndex, exportQueue])

  const startExportFlow = () => {
    if (exportQueue.length === 0) {
      toast.error('当前还没有可导出的图片', { description: '先给至少一张图片画出遮挡，再打开导出流程。' })
      return false
    }
    const initialIndex = selectedItem ? Math.max(0, exportQueue.findIndex((item) => item.draft.id === selectedItem.draft.id)) : 0
    setExportStage('review')
    setExportIndex(initialIndex)
    setReviewedDraftIds([])
    setExportDraftEdits({})
    setExportDialogOpen(true)
    return true
  }

  const handleExportDialogChange = (open: boolean) => {
    if (!open && loadingKey === 'manual-export-all') return
    if (!open && deferredPersistTimeoutRef.current !== null) {
      window.clearTimeout(deferredPersistTimeoutRef.current)
      deferredPersistTimeoutRef.current = null
    }
    setExportDialogOpen(open)
    if (!open) {
      setExportStage('review')
      setReviewedDraftIds([])
      setExportDraftEdits({})
    }
  }

  const confirmCurrentExportCard = async () => {
    const currentItem = exportQueue[exportIndex]
    if (!currentItem) return
    const nextDeck = deckInput.trim()
    const nextTags = parseTagInput(tagsInput)
    if (!nextDeck) {
      toast.error('请先确认当前卡片的牌组', { description: '这一步必须给当前图片选好牌组，才能继续到下一张。' })
      return
    }

    setExportDraftEdits((current) => ({
      ...current,
      [currentItem.draft.id]: { deck: nextDeck, tags: nextTags },
    }))
    setReviewedDraftIds((current) => [...new Set([...current, currentItem.draft.id])])

    if (exportIndex >= exportQueue.length - 1) {
      setExportStage('confirm')
      if (deferredPersistTimeoutRef.current !== null) {
        window.clearTimeout(deferredPersistTimeoutRef.current)
      }
      deferredPersistTimeoutRef.current = window.setTimeout(() => {
        deferredPersistTimeoutRef.current = null
        void persistDraftEdit(currentItem.draft.id, nextDeck, nextTags)
      }, 320)
      return
    }
    await persistDraftEdit(currentItem.draft.id, nextDeck, nextTags)
    setExportIndex((current) => current + 1)
  }

  const goToPreviousExportCard = () => {
    setExportStage('review')
    setExportIndex((current) => Math.max(0, current - 1))
  }

  const exportAllFromFlow = async () => {
    await run('manual-export-all', async () => {
      if (deferredPersistTimeoutRef.current !== null) {
        window.clearTimeout(deferredPersistTimeoutRef.current)
        deferredPersistTimeoutRef.current = null
      }
      const pendingEdits = Object.entries(exportDraftEdits)
      for (const [draftId, edit] of pendingEdits) {
        await persistDraftEdit(draftId, edit.deck, edit.tags)
      }
      const targets = draftItems
        .map((item) => {
          const pendingEdit = exportDraftEdits[item.draft.id]
          if (!pendingEdit) return item
          return {
            ...item,
            draft: {
              ...item.draft,
              deck: pendingEdit.deck,
              tags: pendingEdit.tags,
            },
          }
        })
        .filter((item) => !item.image.ignored && item.draft.masks.length > 0 && Boolean(item.draft.deck?.trim()))
      const result = await importDraftsToAnki(targets)
      if (result.failedCount === 0) {
        setExportDialogOpen(false)
      }
    })
  }

  return {
    exportDialogOpen,
    exportStage,
    exportIndex,
    reviewedDraftIds,
    deckInput,
    tagsInput,
    quality,
    setDeckInput,
    setTagsInput,
    setQuality,
    setExportStage,
    startExportFlow,
    handleExportDialogChange,
    confirmCurrentExportCard,
    goToPreviousExportCard,
    exportAllFromFlow,
  }
}
