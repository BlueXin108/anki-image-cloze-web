import { Skeleton } from '@/components/ui/skeleton'

export function ImageEditorLoadingOverlay() {
  return (
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
  )
}
