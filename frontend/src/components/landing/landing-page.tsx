import { motion, AnimatePresence, type Transition } from 'framer-motion'
import { CameraIcon, FolderUpIcon, RotateCcwIcon, UploadCloudIcon, UploadIcon } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
interface LandingPageProps {
  onIngest: (files: FileList | File[], label: string) => Promise<void>
  onRestore: () => Promise<void>
  isImporting: boolean
  recoverableSummary: { itemCount: number; savedAt: string } | null
  introReady: boolean
  mobileOptimized?: boolean
  onCapturePhoto?: () => void
  onImportFiles?: () => void
}

const AnkiIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 48 48"
    className={className}
  >
    <path
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m30.63 9.21l.735 3.685l3.452 1.482l-3.286 1.842l-.345 3.744l-2.76-2.554l-3.665.829l1.57-3.413l-1.921-3.237l3.734.442l2.476-2.828zM17.565 24.906l4.456 3.003l5.001-1.97l-1.482 5.168l3.413 4.144l-5.372.188l-2.886 4.534l-1.843-5.05l-5.197-1.346l4.232-3.306l-.328-5.362zM35.5 4.5h-23a4 4 0 0 0-4 4v31a4 4 0 0 0 4 4h23a4 4 0 0 0 4-4v-31a4 4 0 0 0-4-4"
      strokeWidth="2.5"
    />
  </svg>
)

const introEase = [0.54, 0, 0, 0.99] as const
const introOutEase = [0, 0.43, 0, 0.99] as const

function introTransition(delay: number, duration = 1): Transition {
  return {
    delay,
    duration,
    ease: introOutEase,
  }
}

function layoutIntroTransition(delay: number, duration = 1): Transition {
  return {
    delay,
    duration,
    ease: introOutEase,
    layout: {
      duration: 1.5,
      ease: introEase,
    },
  }
}

const introSeedClass = 'opacity-0 will-change-[opacity,transform]'

function getIntroMotion(introReady: boolean, hiddenY: number) {
  return introReady
    ? { opacity: 1, y: 0 }
    : { opacity: 0, y: hiddenY }
}

export function LandingPage({
  onIngest,
  onRestore,
  isImporting,
  recoverableSummary,
  introReady,
  mobileOptimized = false,
  onCapturePhoto,
  onImportFiles,
}: LandingPageProps) {
  const [isDragActive, setIsDragActive] = useState(false)
  const dragCounterRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const savedAtLabel = recoverableSummary 
    ? new Date(recoverableSummary.savedAt).toLocaleString('zh-CN', { 
        month: 'numeric', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: 'numeric',
        hour12: false 
      })
    : ''

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragActive(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragActive(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragActive(false)
    
    const files = await collectDroppedFiles(e.dataTransfer)
    if (files.length > 0) {
      await onIngest(files, '拖入图片')
    }
  }

  async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
    const items = Array.from(dataTransfer.items ?? []).filter((item) => item.kind === 'file')
    const entries = items
      .map((item) => (item as any).webkitGetAsEntry?.() ?? null)
      .filter((entry): entry is FileSystemEntry => Boolean(entry))

    if (entries.length > 0) {
      const nestedFiles = await Promise.all(entries.map((entry) => collectFilesFromDroppedEntry(entry)))
      return nestedFiles.flat()
    }

    return Array.from(dataTransfer.files ?? [])
  }

  async function collectFilesFromDroppedEntry(entry: FileSystemEntry): Promise<File[]> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
      const relativePath = entry.fullPath?.replace(/^\/+/, '') || file.name
      try {
        Object.defineProperty(file, 'webkitRelativePath', {
          value: relativePath,
          configurable: true,
        })
      } catch { /* ignore */ }
      return [file]
    }

    if (entry.isDirectory) {
      const children = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        const reader = (entry as FileSystemDirectoryEntry).createReader()
        const collected: FileSystemEntry[] = []
        const pump = () => {
          reader.readEntries((entries) => {
            if (entries.length === 0) {
              resolve(collected)
              return
            }
            collected.push(...entries)
            pump()
          }, reject)
        }
        pump()
      })
      const nested = await Promise.all(children.map((child) => collectFilesFromDroppedEntry(child)))
      return nested.flat()
    }

    return []
  }

  const onFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    await onIngest(files, '图片上传')
    event.target.value = ''
  }

  const onFolderInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    await onIngest(files, '文件夹导入')
    event.target.value = ''
  }

  return (
    <div 
      className="relative isolate h-[100svh] min-h-[100svh] flex flex-col items-center justify-center overflow-hidden px-5 py-6 text-center select-none sm:p-6"
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="relative z-10 max-w-3xl space-y-8 opacity-0 will-change-[opacity] sm:space-y-10" style={{ opacity: introReady ? 1 : 0 }}>
        <div className="space-y-5 sm:space-y-6">
          <motion.div
            layoutId="header-icon"
            initial={false}
            animate={getIntroMotion(introReady, 38)}
            transition={layoutIntroTransition(0)}
            className={`relative z-50 mx-auto flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gray-200/0 text-foreground sm:size-20 will-change-[transform]`}
          >
            <AnkiIcon className={cn("size-16",mobileOptimized&&"size-12 text-foreground/60 sm:size-10") }/>
          </motion.div>
          <div className="space-y-1.5 sm:space-y-2">
            <motion.h1 
              layoutId="header-title"
              initial={false}
              animate={getIntroMotion(introReady, 46)}
              transition={layoutIntroTransition(0)}
              className={`relative z-50 text-[2rem] leading-[1.05] sm:text-4xl md:text-6xl font-bold tracking-tight text-foreground will-change-[transform]`}
            >
              Anki-图像遮罩工具
            </motion.h1>
            <div
              className={cn(
                "mx-auto max-w-[24rem] text-[12px] leading-[1.35] text-muted-foreground sm:text-xs md:text-[22px] sm:leading-relaxed",
                mobileOptimized && "max-w-[17.5rem] text-[14px] leading-[1.42]",
              )}
            >
              <motion.p
                initial={false}
                animate={getIntroMotion(introReady, 52)}
                exit={{ opacity: 0, y: -10, transition: { duration: 0.2, ease: 'easeIn' } }}
                transition={introTransition(0.42)}
                className={introSeedClass}
              >
                高效的 Anki 图片遮挡卡片编辑工具
              </motion.p>
              <motion.p
                initial={false}
                animate={getIntroMotion(introReady, 56)}
                exit={{ opacity: 0, y: -10, transition: { duration: 0.2, ease: 'easeIn', delay: 0.05 } }}
                transition={introTransition(0.56)}
                className={introSeedClass}
              >
                本地处理，无需上传，隐私安全
              </motion.p>
            </div>
          </div>
        </div>

          <motion.div
            initial={false}
            animate={getIntroMotion(introReady, 24)}
            exit={{ opacity: 0, y: -10, transition: { duration: 0.2, ease: 'easeIn', delay: 0.1 } }}
            transition={introTransition(0.72)}
            className={`flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 pt-3 sm:pt-4 w-full mx-auto max-w-lg sm:max-w-none ${introSeedClass}`}
          >
          <motion.div
            layoutId="btn-upload"
            initial={false}
            animate={getIntroMotion(introReady, 20)}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2, ease: 'easeIn', delay: 0.15 } }}
            transition={layoutIntroTransition(0.72)}
            className={`w-full sm:w-auto shrink-1 ${introSeedClass}`}
          >
            <Button 
              size="lg" 
              className="shadow-none group h-12 w-full rounded-2xl gap-3 text-base  shadow-primary/20 transition-all active:scale-[0.98] hover:shadow-primary/30 sm:h-14 sm:px-8 sm:text-lg"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
            >
              {isImporting ? <Spinner className="size-5" /> : <UploadIcon className="size-5 transition-transform group-hover:-translate-y-0.5" />}
              上传图片
            </Button>
          </motion.div>
          {mobileOptimized ? (
            <div className={`grid w-full gap-3 sm:gap-4 ${onCapturePhoto ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {onCapturePhoto ? (
                <motion.div
                  initial={false}
                  animate={getIntroMotion(introReady, 20)}
                  transition={introTransition(0.82)}
                  className={`w-full ${introSeedClass}`}
                >
                  <Button
                    variant="secondary"
                    size="lg"
                    className="shadow-none group h-12 w-full rounded-2xl gap-3 text-base bg-background/50 backdrop-blur-sm border-border/50 transition-all active:scale-[0.98] hover:bg-background/80"
                    onClick={onCapturePhoto}
                    disabled={isImporting}
                  >
                    {isImporting ? <Spinner className="size-5" /> : <CameraIcon className="size-5 transition-transform group-hover:-translate-y-0.5" />}
                    拍摄
                  </Button>
                </motion.div>
              ) : null}
              <motion.div
                initial={false}
                animate={getIntroMotion(introReady, 20)}
                transition={introTransition(onCapturePhoto ? 0.9 : 0.82)}
                className={`w-full ${introSeedClass}`}
              >
                <Button 
                  variant="secondary" 
                  size="lg" 
                  className="shadow-none group h-12 w-full rounded-2xl gap-3 text-base bg-background/50 backdrop-blur-sm border-border/50 transition-all active:scale-[0.98] hover:bg-background/80"
                  onClick={() => {
                    if (onImportFiles) {
                      onImportFiles()
                      return
                    }
                    fileInputRef.current?.click()
                  }}
                  disabled={isImporting}
                >
                  {isImporting ? <Spinner className="size-5" /> : <FolderUpIcon className="size-5 transition-transform group-hover:-translate-y-0.5" />}
                  文件管理器
                </Button>
              </motion.div>
            </div>
          ) : (
            <motion.div
              layoutId="btn-import-folder"
              initial={false}
              animate={getIntroMotion(introReady, 20)}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2, ease: 'easeIn', delay: 0.15 } }}
              transition={layoutIntroTransition(0.82)}
              className={`w-full sm:w-auto shrink-1 ${introSeedClass}`}
            >
              <Button 
                variant="secondary" 
                size="lg" 
                className="shadow-none group h-12 w-full rounded-2xl gap-3 text-base bg-background/50 backdrop-blur-sm border-border/50 transition-all active:scale-[0.98] hover:bg-background/80 sm:h-14 sm:px-8 sm:text-lg"
                onClick={() => folderInputRef.current?.click()}
                disabled={isImporting}
              >
                {isImporting ? <Spinner className="size-5" /> : <FolderUpIcon className="size-5 transition-transform group-hover:-translate-y-0.5" />}
                导入文件夹
              </Button>
            </motion.div>
          )}
        </motion.div>

        <AnimatePresence>
          {recoverableSummary && (
            <motion.div
              initial={false}
              animate={introReady ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.98 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2, ease: 'easeIn', delay: 0.2 } }}
              transition={introTransition(0.86)}
              className={`relative z-20 pt-1 sm:pt-2 pointer-events-auto ${introSeedClass}`}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  void onRestore()
                }}
                disabled={isImporting}
                className="group relative z-20 mx-auto flex items-center gap-2.5 rounded-md bg-muted/80 px-4 py-2.5 text-muted-foreground transition-all active:scale-[0.98] hover:bg-muted/60 hover:text-foreground sm:gap-3 sm:px-5 sm:py-3"
              >
                <RotateCcwIcon className="size-4 group-hover:rotate-[-45deg] transition-transform" />
                <div className="text-xs font-medium sm:text-sm">
                  恢复上次项目 <span className="opacity-50 mx-1">·</span> 
                  <span className="opacity-70">{recoverableSummary.itemCount} 张图片 ({savedAtLabel})</span>
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div exit={{ opacity: 0, transition: { duration: 0.2, ease: 'easeIn', delay: 0.25 } }} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-6 text-xs font-medium text-muted-foreground/60 sm:gap-8 sm:pt-8 sm:text-sm">
          <motion.div
            className={`flex items-center gap-2 ${introSeedClass}`}
            initial={false}
            animate={getIntroMotion(introReady, 18)}
            transition={introTransition(1.5)}
          >
            {/* <div className="size-1.5 rounded-full bg-current opacity-40" /> */}
            支持批量处理
          </motion.div>
          <motion.div
            className={`flex items-center gap-2 ${introSeedClass}`}
            initial={false}
            animate={getIntroMotion(introReady, 18)}
            transition={introTransition(1.62)}
          >
            {/* <div className="size-1.5 rounded-full bg-current opacity-40" /> */}
            支持 APKG 导出
          </motion.div>
          {!mobileOptimized && (
            <motion.div
              className={`flex items-center gap-2 ${introSeedClass}`}
              initial={false}
              animate={getIntroMotion(introReady, 18)}
              transition={introTransition(1.74)}
            >
              {/* <div className="size-1.5 rounded-full bg-current opacity-40" /> */}
              AnkiConnect 直连
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* 隐藏的 Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={onFileInputChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        className="hidden"
        onChange={onFolderInputChange}
      />

      {/* 拖拽激活时的 Overlay */}
      <AnimatePresence>
        {isDragActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-xl border-[6px] border-dashed border-primary/30 m-4 rounded-[40px] pointer-events-none"
          >
            <div className="flex flex-col items-center gap-6">
              <div className="flex size-24 items-center justify-center rounded-[28%] bg-primary text-primary-foreground shadow-2xl shadow-primary/40">
                <UploadCloudIcon className="size-12 animate-bounce" />
              </div>
              <div className="text-3xl font-bold tracking-tight">
                松开鼠标开始导入图片
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.footer
        initial={false}
        animate={getIntroMotion(introReady, 16)}
        exit={{ opacity: 0, y: 5, transition: { duration: 0.2, ease: 'easeIn', delay: 0.3 } }}
        transition={introTransition(1.34)}
        className={`absolute bottom-6 left-0 right-0 z-10 text-center text-[11px] text-muted-foreground/40 font-medium sm:bottom-8 sm:text-xs ${introSeedClass}`}
      >
        基于本地构建的 Web 应用，处理均在本地完成
      </motion.footer>
    </div>
  )
}
