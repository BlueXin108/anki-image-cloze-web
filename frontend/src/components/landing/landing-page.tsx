import { motion, AnimatePresence } from 'framer-motion'
import { FolderUpIcon, RotateCcwIcon, UploadCloudIcon, UploadIcon } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'

import { Button } from '@/components/ui/button'
import { LandingBackground } from './landing-background'

interface LandingPageProps {
  onIngest: (files: FileList | File[], label: string) => Promise<void>
  onRestore: () => Promise<void>
  isImporting: boolean
  recoverableSummary: { itemCount: number; savedAt: string } | null
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
      strokeWidth="2"
    />
  </svg>
)

export function LandingPage({ onIngest, onRestore, isImporting, recoverableSummary }: LandingPageProps) {
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
      className="relative min-h-screen flex flex-col items-center justify-center p-6 text-center select-none overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <LandingBackground />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="z-10 max-w-3xl space-y-10"
      >
        <div className="space-y-6">
          <motion.div
            layoutId="header-icon"
            className="flex size-20 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/35 text-foreground mx-auto shadow-sm"
          >
            <AnkiIcon className="size-10 text-foreground/80" />
          </motion.div>
          <div className="space-y-2">
            <motion.h1 
              layoutId="header-title"
              className="text-4xl md:text-6xl font-bold tracking-tight text-foreground"
            >
              Anki-图像遮罩工具
            </motion.h1>
            <p className="text-xl md:text-2xl text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed">
              极简、高效的 Anki 图片遮挡卡片生成工具。<br className="hidden md:block" />
              支持本地处理，无需上传，隐私安全。
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <motion.div layoutId="btn-upload" className="w-full sm:w-auto">
            <Button 
              size="lg" 
              className="h-14 w-full sm:px-8 text-lg rounded-2xl gap-3 shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-all active:scale-[0.98]"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
            >
              <UploadIcon className="size-5" />
              上传图片
            </Button>
          </motion.div>
          <motion.div layoutId="btn-import-folder" className="w-full sm:w-auto">
            <Button 
              variant="secondary" 
              size="lg" 
              className="h-14 w-full sm:px-8 text-lg rounded-2xl gap-3 bg-background/50 backdrop-blur-sm border-border/50 hover:bg-background/80 transition-all active:scale-[0.98]"
              onClick={() => folderInputRef.current?.click()}
              disabled={isImporting}
            >
              <FolderUpIcon className="size-5" />
              导入文件夹
            </Button>
          </motion.div>
        </div>

        <AnimatePresence>
          {recoverableSummary && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="pt-2"
            >
              <button
                onClick={onRestore}
                disabled={isImporting}
                className="group flex items-center gap-3 px-5 py-3 rounded-2xl bg-muted/40 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-all active:scale-[0.98] mx-auto border border-border/40 shadow-sm"
              >
                <RotateCcwIcon className="size-4 group-hover:rotate-[-45deg] transition-transform" />
                <div className="text-sm font-medium">
                  恢复上次项目 <span className="opacity-50 mx-1">·</span> 
                  <span className="opacity-70">{recoverableSummary.itemCount} 张图片 ({savedAtLabel})</span>
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pt-8 flex items-center justify-center gap-8 text-sm text-muted-foreground/60 font-medium">
          <div className="flex items-center gap-2">
            <div className="size-1.5 rounded-full bg-current opacity-40" />
            支持批量处理
          </div>
          <div className="flex items-center gap-2">
            <div className="size-1.5 rounded-full bg-current opacity-40" />
            支持 APKG 导出
          </div>
          <div className="flex items-center gap-2">
            <div className="size-1.5 rounded-full bg-current opacity-40" />
            AnkiConnect 直连
          </div>
        </div>
      </motion.div>

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

      <footer className="absolute bottom-8 left-0 right-0 text-center text-xs text-muted-foreground/40 font-medium">
        基于浏览器本地技术构建 · 保护你的数据隐私
      </footer>
    </div>
  )
}
