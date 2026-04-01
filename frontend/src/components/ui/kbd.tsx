import * as React from 'react'

import { cn } from '@/lib/utils'

export function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-[1.6rem] items-center justify-center rounded-md border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  )
}
