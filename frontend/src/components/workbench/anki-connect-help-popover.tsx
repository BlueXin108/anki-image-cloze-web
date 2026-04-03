import { useEffect, useState } from 'react'
import { CheckIcon, ChevronDownIcon, CircleHelpIcon, CopyIcon, DownloadIcon, PlugZapIcon, SparklesIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'

import ankiHelpImage1 from '@/assets/ankiHelp-1.webp'
import ankiHelpImage2 from '@/assets/ankiHelp-2.webp'
import ankiHelpImage3 from '@/assets/ankiHelp-3.webp'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { InlineEmphasis } from '@/components/workbench/inline-emphasis'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const ANKI_DOWNLOAD_URL = 'https://apps.ankiweb.net/'
const ANKI_CONNECT_DOWNLOAD_URL = 'https://ankiweb.net/shared/info/2055492159'
const ANKI_CONNECT_CODE = '2055492159'

function HelpImageCard({
  src,
  alt,
}: {
  src: string
  alt: string
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  return (
    <div className="relative min-h-[11rem] border-b border-border/70 bg-muted/20">
      {!loaded && !failed ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted-foreground">
          这张说明图暂时没有加载成功，但下面的步骤文字仍然可以照着操作。
        </div>
      ) : null}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={cn(
          'w-full object-contain transition-opacity',
          loaded && !failed ? 'opacity-100' : 'opacity-0',
        )}
        onLoad={() => {
          setLoaded(true)
          setFailed(false)
        }}
        onError={() => {
          setLoaded(false)
          setFailed(true)
        }}
      />
    </div>
  )
}

export function AnkiConnectHelpPopover({
  open,
  onOpenChange,
  compact = false,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  compact?: boolean
}) {
  const [currentOrigin, setCurrentOrigin] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [ankiDownloadOpen, setAnkiDownloadOpen] = useState(false)
  const [ankiConnectInstallOpen, setAnkiConnectInstallOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setCurrentOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    if (!copied) return
    const timeoutId = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(timeoutId)
  }, [copied])

  useEffect(() => {
    if (!copiedCode) return
    const timeoutId = window.setTimeout(() => setCopiedCode(false), 1800)
    return () => window.clearTimeout(timeoutId)
  }, [copiedCode])

  const copyCurrentOrigin = async () => {
    if (!currentOrigin) return
    try {
      await navigator.clipboard.writeText(currentOrigin)
      setCopied(true)
      toast.success('已复制当前网站地址', {
        description: '直接粘贴到引号里即可，注意这一行后面的逗号。',
      })
    } catch {
      toast.error('复制失败', {
        description: '可以手动选中下面这一行的网址再复制。',
      })
    }
  }

  const copyAnkiConnectCode = async () => {
    try {
      await navigator.clipboard.writeText(ANKI_CONNECT_CODE)
      setCopiedCode(true)
      toast.success('已复制插件编号', {
        description: '回到 Anki 的“代码”输入框里直接粘贴即可。',
      })
    } catch {
      toast.error('复制失败', {
        description: '可以手动复制这个编号：2055492159',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {compact ? (
          <Button size="sm" variant="ghost" className="h-8 rounded-xl px-2 text-muted-foreground hover:text-foreground">
            <span className="font-medium text-current">Anki</span>
            <span className="ml-1 inline-flex items-center justify-center text-current">
              <CircleHelpIcon className="size-4" />
            </span>
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="h-9 rounded-xl px-2.5 text-muted-foreground hover:text-foreground">
            <span className="font-medium text-current">Anki</span>
            <CircleHelpIcon className="ml-1 size-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="w-[min(94vw,44rem)] max-w-[calc(100%-1rem)] gap-0 overflow-hidden rounded-2xl border-border/70 bg-background/95 p-0 shadow-2xl sm:max-w-[44rem]"
      >
        <DialogClose asChild>
          <button
            type="button"
            className="absolute right-4 top-4 inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            aria-label="关闭帮助"
          >
            <XIcon className="size-4" />
          </button>
        </DialogClose>

        <div className="flex max-h-[84vh] flex-col overflow-auto">
          <DialogHeader className="gap-1 border-b border-border/70 px-4 py-4 pr-10">
            <DialogTitle className="text-base">Anki 与 AnkiConnect 配置说明</DialogTitle>
            <DialogDescription>
              本站本身已经支持直接导出
              <span className="mx-1 inline-flex">
                <InlineEmphasis hint="下载完成后，桌面端可以直接拖进 Anki；移动端则可以交给 AnkiDroid 打开。">
                  APKG
                </InlineEmphasis>
              </span>
              卡包；如果你还想让网页通过
              <span className="mx-1 inline-flex">
                <InlineEmphasis>AnkiConnect</InlineEmphasis>
              </span>
              直接读取本机牌组、并一键写入 Anki，再按下面这套流程配置就行。不需要直连时，这些步骤都可以先忽略。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 px-4 py-4">
            <Collapsible open={ankiDownloadOpen} onOpenChange={setAnkiDownloadOpen}>
              <div className="rounded-2xl border border-border/70 bg-muted/10">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">1. 下载 Anki</div>
                      <div className="mt-1 text-xs text-muted-foreground">如果你已经装好了，可以直接跳过这一步。</div>
                    </div>
                    <ChevronDownIcon className={cn('size-4 shrink-0 text-muted-foreground transition-transform', ankiDownloadOpen && 'rotate-180')} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4">
                    <Button asChild variant="outline" className="h-10 rounded-xl">
                      <a href={ANKI_DOWNLOAD_URL} target="_blank" rel="noreferrer">
                        <DownloadIcon data-icon="inline-start" />
                        打开 Anki 官网下载
                      </a>
                    </Button>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            <Collapsible open={ankiConnectInstallOpen} onOpenChange={setAnkiConnectInstallOpen}>
              <div className="rounded-2xl border border-border/70 bg-muted/10">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">2. 下载 AnkiConnect</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        需要直连本机 Anki 时，再展开按图安装插件。
                      </div>
                    </div>
                    <ChevronDownIcon
                      className={cn(
                        'size-4 shrink-0 text-muted-foreground transition-transform',
                        ankiConnectInstallOpen && 'rotate-180',
                      )}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="flex flex-col gap-3 px-4 pb-4">
                    <Alert>
                      <PlugZapIcon />
                      <AlertTitle>在 Anki 里打开插件下载页</AlertTitle>
                      <AlertDescription>
                        在 Anki 主界面按 <Kbd>Ctrl</Kbd> + <Kbd>Shift</Kbd> + <Kbd>A</Kbd>，或者从
                        <span className="mx-1 font-medium text-foreground">【上方】工具栏</span>
                        进入
                        <span className="mx-1 font-medium text-foreground">插件</span>
                        页面，然后点击
                        <span className="mx-1 inline-flex h-8 items-center rounded-xl border border-border/70 bg-muted/40 px-3 text-sm font-medium text-foreground/85">
                          获取插件...
                        </span>
                      </AlertDescription>
                    </Alert>

                    <div className="overflow-hidden rounded-2xl border border-border/70 bg-muted/10">
                      <HelpImageCard src={ankiHelpImage3} alt="Anki 获取插件页面示意图" />
                      <div className="flex flex-col gap-3 px-4 py-4">
                        <div className="text-sm text-muted-foreground">
                          在弹出的窗口里，把下面这个编号填进
                          <span className="mx-1 font-medium text-foreground">“代码:”</span>
                          输入框。
                        </div>

                        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background px-3 py-3 font-mono text-sm text-foreground">
                          <span>{ANKI_CONNECT_CODE}</span>
                          <button
                            type="button"
                            aria-label={copiedCode ? '插件编号已复制' : '复制插件编号'}
                            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            onClick={() => void copyAnkiConnectCode()}
                          >
                            {copiedCode ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                          </button>
                        </div>

                        <div className="flex items-start justify-between gap-3">
                          <div className="text-xs text-muted-foreground">装好后回到这里继续做白名单配置就行。</div>
                          <Button asChild variant="outline" className="h-9 shrink-0 rounded-xl">
                            <a href={ANKI_CONNECT_DOWNLOAD_URL} target="_blank" rel="noreferrer">
                              <DownloadIcon data-icon="inline-start" />
                              打开插件页面
                            </a>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            <Alert>
              <SparklesIcon />
              <AlertTitle>3. 打开插件设置页面</AlertTitle>
              <AlertDescription>
                在 Anki 主界面按 <Kbd>Ctrl</Kbd> + <Kbd>Shift</Kbd> + <Kbd>A</Kbd>，或者从
                <span className="mx-1 font-medium text-foreground">【上方】工具栏</span>
                进入
                <span className="mx-1 font-medium text-foreground">插件</span>
                页面。
              </AlertDescription>
            </Alert>

            <div className="overflow-hidden rounded-2xl border border-border/70 bg-muted/10">
              <HelpImageCard src={ankiHelpImage1} alt="Anki 插件页面示意图" />
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                <span>在插件列表里选中</span>
                <span className="rounded-lg border border-border/70 bg-background px-2.5 py-1 font-medium text-foreground">AnkiConnect</span>
                <span>然后点击</span>
                <span className="inline-flex h-9 items-center rounded-xl border border-border/70 bg-muted/40 px-3 text-sm font-medium text-foreground/85">
                  插件设置
                </span>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/70 bg-muted/10">
              <HelpImageCard src={ankiHelpImage2} alt="AnkiConnect 配置填写示意图" />
              <div className="flex flex-col gap-3 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">4. 把当前网站地址填进白名单</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      把下面这段网址放进引号里，写到
                      <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">webCorsOriginList</code>
                      这一项里。
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 rounded-xl"
                    onClick={() => void copyCurrentOrigin()}
                    disabled={!currentOrigin}
                  >
                    {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
                    {copied ? '已复制' : '复制'}
                  </Button>
                </div>

                <div className="rounded-xl border border-border/70 bg-background px-3 py-3 font-mono text-[12px] leading-5 text-foreground">
                  {currentOrigin || '正在读取当前网站地址...'}
                </div>

                <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3 font-mono text-[11px] leading-5 text-muted-foreground">
                  <div>"webCorsOriginList": [</div>
                  <div className="pl-4">"{currentOrigin || 'https://your-site.example.com'}"</div>
                  <div>],</div>
                </div>

                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <p>注意 1：网址要放在英文引号里。</p>
                  <p>注意 2：这一行后面记得保留逗号，除非它刚好是最后一项。</p>
                  <p>注意 3：改完后保存配置，彻底重启 Anki，再回来点“获取牌组”。</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
