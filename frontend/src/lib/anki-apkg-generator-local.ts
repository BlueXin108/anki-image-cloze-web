import ankiApkgGenerator from 'anki-apkg-generator/dist/index.min.js'
import sqlWasmUrl from 'anki-apkg-generator/wasm/sql-wasm.wasm?url'

const SQL_WASM_CDN_PREFIX = 'https://cdn.jsdelivr.net/npm/anki-apkg-generator/wasm/'

type PackageWriteOptions = {
  type?: 'blob'
}

type RedirectCleanup = () => void

type BundleExports = {
  Card: new (...args: unknown[]) => any
  Deck: new (...args: unknown[]) => any
  Field: new (...args: unknown[]) => any
  Media: new (...args: unknown[]) => any
  Model: new (...args: unknown[]) => any
  ModelKinds: Record<string, number>
  Note: new (...args: unknown[]) => any
  Package: new (...args: unknown[]) => {
    writeToFile: (options?: PackageWriteOptions) => Promise<Blob>
  }
}

function redirectSqlWasmUrl(value: string): string {
  return value.startsWith(SQL_WASM_CDN_PREFIX) ? sqlWasmUrl : value
}

function installSqlWasmRedirect(): RedirectCleanup {
  const cleanups: RedirectCleanup[] = []

  if (typeof globalThis.fetch === 'function') {
    const originalFetch = globalThis.fetch.bind(globalThis)
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === 'string') {
        return originalFetch(redirectSqlWasmUrl(input), init)
      }
      if (input instanceof URL) {
        return originalFetch(new URL(redirectSqlWasmUrl(input.toString())), init)
      }
      if (input instanceof Request) {
        return originalFetch(new Request(redirectSqlWasmUrl(input.url), input), init)
      }
      return originalFetch(input, init)
    }) as typeof globalThis.fetch

    cleanups.push(() => {
      globalThis.fetch = originalFetch
    })
  }

  if (typeof XMLHttpRequest !== 'undefined') {
    const originalOpen = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ) {
      const nextUrl = typeof url === 'string' ? redirectSqlWasmUrl(url) : new URL(redirectSqlWasmUrl(url.toString()))
      return originalOpen.call(this, method, nextUrl, async ?? true, username ?? undefined, password ?? undefined)
    }

    cleanups.push(() => {
      XMLHttpRequest.prototype.open = originalOpen
    })
  }

  return () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop()
      cleanup?.()
    }
  }
}

const bundleExports = (ankiApkgGenerator as { default?: BundleExports }).default ?? (ankiApkgGenerator as unknown as BundleExports)

if (!bundleExports || typeof bundleExports.Package !== 'function') {
  throw new Error('APKG 生成器初始化失败：浏览器导出模块没有正确加载。')
}

class Package extends bundleExports.Package {
  writeToFile = async (options?: PackageWriteOptions): Promise<Blob> => {
    const cleanup = installSqlWasmRedirect()

    try {
      return await super.writeToFile(options)
    } finally {
      cleanup()
    }
  }
}

const Card = bundleExports.Card
const Deck = bundleExports.Deck
const Field = bundleExports.Field
const Media = bundleExports.Media
const Model = bundleExports.Model
const ModelKinds = bundleExports.ModelKinds
const Note = bundleExports.Note

export { Card, Deck, Field, Media, Model, ModelKinds, Note, Package }
