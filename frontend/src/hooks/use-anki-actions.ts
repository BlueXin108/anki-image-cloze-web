import { toast } from 'sonner'
import type { Dispatch, SetStateAction } from 'react'

import { api } from '@/lib/api'
import { ankiLoadingState, classifyAnkiFailure, EMPTY_ANKI_STATE, nowIso } from '@/lib/workbench-state'
import { loadDeckQuickPicks, rememberDeckName } from '@/lib/deck-pool'
import type { AnkiConnectionState } from '@/types'

type RefreshSource = 'startup' | 'manual' | 'create-deck'

type UseAnkiActionsOptions = {
  canDirectAnki: boolean
  setAnkiState: Dispatch<SetStateAction<AnkiConnectionState>>
  setDeckPool: Dispatch<SetStateAction<string[]>>
  setDeckQuickPicks: Dispatch<SetStateAction<string[]>>
  updateStatusTask: (
    taskId: 'anki',
    patch: { state?: 'idle' | 'running' | 'success' | 'error'; progress?: number; detail?: string },
  ) => void
  onNeedHelpPrompt: (force?: boolean) => void
}

export function useAnkiActions({
  canDirectAnki,
  setAnkiState,
  setDeckPool,
  setDeckQuickPicks,
  updateStatusTask,
  onNeedHelpPrompt,
}: UseAnkiActionsOptions) {
  const refreshAnkiConnection = async (options?: { source?: RefreshSource }) => {
    if (!canDirectAnki) {
      setAnkiState(EMPTY_ANKI_STATE)
      updateStatusTask('anki', { state: 'idle', progress: 0, detail: '移动端已跳过本机 Anki 检测。' })
      return
    }

    setAnkiState((current) => ({ ...current, ...ankiLoadingState() }))
    updateStatusTask('anki', { state: 'running', progress: 15, detail: '正在连接本机 AnkiConnect，并检查模板状态。' })

    try {
      const check = await api.anki.checkAnkiConnection()
      if (!check.ok) {
        const failure = classifyAnkiFailure(check.message)
        setAnkiState({
          checked: true,
          ok: false,
          title: failure.title,
          message: `${failure.detail} ${check.message}`.trim(),
          decks: [],
          level: failure.level,
          lastCheckedAt: nowIso(),
          templateStatus: null,
        })
        updateStatusTask('anki', { state: 'error', progress: 100, detail: check.message })
        if (options?.source === 'startup' || options?.source === 'manual') {
          onNeedHelpPrompt(options?.source === 'manual')
        }
        return
      }

      const [decks, templateStatus] = await Promise.all([api.anki.listAnkiDecks(), api.anki.ensureManualTemplate()])
      const checkedAt = nowIso()
      setAnkiState({
        checked: true,
        ok: true,
        title: decks.length > 0 ? '本机牌组已同步' : '已连接，但还没有读到牌组',
        message:
          decks.length > 0
            ? '网页已经连到你本机的 Anki，并拿到了当前可用牌组。'
            : '网页已经连到你本机的 Anki，但目前没有读到任何牌组。请确认本机牌组是否为空。',
        decks,
        level: decks.length > 0 ? 'success' : 'warning',
        lastCheckedAt: checkedAt,
        templateStatus,
      })
      updateStatusTask('anki', {
        state: decks.length > 0 ? 'success' : 'error',
        progress: 100,
        detail: decks.length > 0 ? `已连接本机 Anki，当前可用 ${decks.length} 个牌组。` : '已经连上本机 Anki，但当前没有读到任何牌组。',
      })
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Anki 状态检查失败。'
      const failure = classifyAnkiFailure(rawMessage)
      setAnkiState({
        checked: true,
        ok: false,
        title: failure.title,
        message: `${failure.detail} ${rawMessage}`.trim(),
        decks: [],
        level: failure.level,
        lastCheckedAt: nowIso(),
        templateStatus: null,
      })
      updateStatusTask('anki', { state: 'error', progress: 100, detail: rawMessage })
      if (options?.source === 'startup' || options?.source === 'manual') {
        onNeedHelpPrompt(options?.source === 'manual')
      }
      if (options?.source === 'manual' || options?.source === 'create-deck') {
        throw error
      }
    }
  }

  const createCurrentDeckInAnki = async (deckName: string) => {
    const nextDeck = deckName.trim()
    if (!nextDeck) {
      toast.error('请先填写牌组名称', { description: '先输入你想创建的牌组名称，再执行新建。' })
      return
    }

    await api.anki.createAnkiDeck(nextDeck)
    setDeckPool(rememberDeckName(nextDeck))
    setDeckQuickPicks(loadDeckQuickPicks())
    setAnkiState((current) => {
      const decks = [...new Set([...current.decks, nextDeck])].sort((left, right) => left.localeCompare(right, 'zh-CN'))
      return {
        ...current,
        checked: true,
        ok: true,
        title: '已在 Anki 中创建牌组',
        message: `新牌组“${nextDeck}”已经在本机 Anki 中准备好了。`,
        decks,
        level: 'success',
        lastCheckedAt: nowIso(),
      }
    })
    updateStatusTask('anki', { state: 'success', progress: 100, detail: `已在本机 Anki 中创建牌组：${nextDeck}` })
    toast.success('新牌组已创建', { description: `“${nextDeck}”已经出现在本机 Anki 里。` })
    await refreshAnkiConnection({ source: 'create-deck' })
  }

  return {
    refreshAnkiConnection,
    createCurrentDeckInAnki,
  }
}
