"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { InfoIcon, TriangleAlertIcon, OctagonXIcon } from "lucide-react"

import { Spinner } from "@/components/ui/spinner"
import { SuccessLottie } from "@/components/ui/success-lottie"

const SUCCESS_TOAST_ICON_DELAY_MS = 350

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group !z-[260] pointer-events-auto"
      icons={{
        success: (
          <SuccessLottie className="size-full shrink-0" delayMs={SUCCESS_TOAST_ICON_DELAY_MS} />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Spinner className="size-full shrink-0" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          zIndex: 260,
          pointerEvents: "auto",
        } as React.CSSProperties
      }
      toastOptions={{
        duration: 5000,
        classNames: {
          toast: "cn-toast pointer-events-auto",
          icon: "cn-toast-icon",
          content: "cn-toast-content",
          closeButton: "cn-toast-close pointer-events-auto",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
