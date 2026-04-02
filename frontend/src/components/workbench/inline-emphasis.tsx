import type { ReactNode } from 'react'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface InlineEmphasisProps {
  children: ReactNode
  hint?: ReactNode
  onClick?: () => void
  touchOptimized?: boolean
  className?: string
  hintClassName?: string
}

export function InlineEmphasis({
  children,
  hint,
  onClick,
  touchOptimized = false,
  className,
  hintClassName,
}: InlineEmphasisProps) {
  const clickable = Boolean(onClick)
  const hoverHintOnly = Boolean(hint) && !touchOptimized && !clickable
  const baseClassName = cn(
    'inline-flex translate-y-[-1px] items-center rounded-md border border-foreground/15 bg-foreground px-2 py-0.5 text-[11px] font-medium leading-none text-background shadow-sm shadow-black/5 transition-colors',
    (clickable || hint) && 'cursor-help',
    clickable && 'hover:border-foreground/30 hover:bg-foreground/88',
    hoverHintOnly && 'hover:border-foreground/25 hover:bg-foreground/90',
    clickable && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    className,
  )

  const trigger = clickable || (hint && touchOptimized) ? (
    <button
      type="button"
      onClick={onClick}
      className={baseClassName}
    >
      {children}
    </button>
  ) : (
    <span
      className={baseClassName}
    >
      {children}
    </span>
  )

  if (!hint) return trigger

  if (touchOptimized) {
    return (
      <Popover>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="center" className={cn('w-64 rounded-xl text-sm leading-6', hintClassName)}>
          {hint}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="top" className={cn('max-w-72 text-sm leading-6', hintClassName)}>
          {hint}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
