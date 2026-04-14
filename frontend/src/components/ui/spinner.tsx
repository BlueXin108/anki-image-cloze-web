import { LoaderLottie } from '@/components/ui/loader-lottie'
import { cn } from '@/lib/utils'

function Spinner({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn('inline-flex size-6 shrink-0 items-center justify-center', className)}
      {...props}
    >
      <LoaderLottie />
    </div>
  )
}

export { Spinner }
