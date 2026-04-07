import { toast } from 'sonner'

let registered = false
let refreshing = false

function showUpdateToast(registration: ServiceWorkerRegistration) {
  toast.info('网页应用有新版本可用', {
    description: '刷新后会切到最新版本。当前浏览器里的项目数据不会被这次更新清掉。',
    duration: 12000,
    action: {
      label: '立即更新',
      onClick: () => {
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
      },
    },
  })
}

export function registerPwa(): void {
  if (registered) return
  if (!('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) return

  registered = true

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then((registration) => {
      if (registration.waiting) {
        showUpdateToast(registration)
      }

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast(registration)
          }
        })
      })

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return
        refreshing = true
        window.location.reload()
      })
    }).catch(() => {
      // PWA 注册失败时不打断主流程，继续按普通网页使用。
    })
  })
}
