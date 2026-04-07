import { groupMasksByCard } from '@/lib/manual-preview'
import type { CardGenerationMode, CardDraft, MaskRect } from '@/types'

export interface CardGenerationModeOption {
  value: CardGenerationMode
  label: string
  description: string
}

export interface GeneratedCardTarget {
  key: string
  order: number
  groupId: string | null
  masks: MaskRect[]
}

export const CARD_GENERATION_MODE_OPTIONS: CardGenerationModeOption[] = [
  {
    value: 'hide-all-reveal-current',
    label: '逐卡考一个，其他也先遮住',
    description: '每个分组生成一张卡。题面会先把全部遮罩盖住，翻到答案面时只解开当前这一组。',
  },
  {
    value: 'hide-current-only',
    label: '逐卡考一个，其他默认可见',
    description: '每个分组生成一张卡。题面只遮住当前考察点，其他位置一开始就显示出来。',
  },
  {
    value: 'single-card-toggle',
    label: '整张图一张卡，点遮罩切换',
    description: '整张图只生成一张卡。所有遮罩默认可见，复习时可直接点遮罩查看或重新盖回去。',
  },
]

export function buildGeneratedCardTargets(masks: MaskRect[], mode: CardGenerationMode): GeneratedCardTarget[] {
  if (masks.length === 0) return []

  const groups = groupMasksByCard(masks)
  if (mode === 'single-card-toggle') {
    return [
      {
        key: 'single-card',
        order: 1,
        groupId: groups[0]?.groupId ?? null,
        masks,
      },
    ]
  }

  return groups.map((group) => ({
    key: group.groupId,
    order: group.order,
    groupId: group.groupId,
    masks: group.masks,
  }))
}

export function countGeneratedCardsFromMasks(masks: MaskRect[], mode: CardGenerationMode): number {
  return buildGeneratedCardTargets(masks, mode).length
}

export function countGeneratedCards(draft: Pick<CardDraft, 'masks'>, mode: CardGenerationMode): number {
  return countGeneratedCardsFromMasks(draft.masks, mode)
}

export function isInteractiveCardMode(mode: CardGenerationMode): boolean {
  return mode === 'single-card-toggle'
}

export function cardGenerationModeSummary(mode: CardGenerationMode): string {
  return CARD_GENERATION_MODE_OPTIONS.find((option) => option.value === mode)?.description ?? CARD_GENERATION_MODE_OPTIONS[0].description
}
