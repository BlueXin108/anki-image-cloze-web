import { CircleHelpIcon, SparklesIcon } from 'lucide-react'

import ankiHelpImage from '@/assets/ankiHelp.webp'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

export function AnkiConnectHelpPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="lg" variant="outline" className="h-11 rounded-xl px-4">
          <CircleHelpIcon data-icon="inline-start" />
          Anki 帮助
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={10}
        className="w-[min(92vw,34rem)] gap-0 overflow-hidden rounded-2xl p-0"
      >
        <div className="flex max-h-[80vh] flex-col overflow-auto">
          <PopoverHeader className="gap-1 px-4 py-4">
            <PopoverTitle>AnkiConnect 配置说明</PopoverTitle>
            <PopoverDescription>
              如果网页拿不到牌组，先打开 Anki，再把插件配置改成下图这种形式。最关键的是
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">webCorsOriginList: ["*"]</code>
              这一项。
            </PopoverDescription>
          </PopoverHeader>

          <div className="px-4 pb-4">
            <img
              src={ankiHelpImage}
              alt="AnkiConnect 配置示意图"
              className="w-full rounded-xl border border-border/70 bg-muted/20 object-contain"
            />
          </div>

          <Separator />

          <div className="flex flex-col gap-3 px-4 py-4">
            <Alert>
              <SparklesIcon />
              <AlertTitle>最关键的配置点</AlertTitle>
              <AlertDescription>
                一定要让
                <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">webCorsOriginList</code>
                包含
                <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">"*"</code>
                ，否则网页虽然能打开，但没法访问你本机的 Anki。
              </AlertDescription>
            </Alert>

            <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3 font-mono text-[11px] leading-5 text-muted-foreground">
              <div>"apiKey": null</div>
              <div>"apiLogPath": null</div>
              <div>"ignoreOriginList": ["*"]</div>
              <div>"webBindAddress": "127.0.0.1"</div>
              <div>"webBindPort": 8765</div>
              <div>"webCorsOriginList": ["*"]</div>
            </div>

            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <p>改完后保存配置，重启 Anki，再回网页里重新获取牌组。</p>
              <p>如果还是连不上，优先检查本机 Anki 是否已经打开，以及端口是不是 8765。</p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
