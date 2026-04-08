/// <reference types="vite/client" />

declare module 'anki-apkg-generator/node_modules/sql.js/dist/sql-wasm.js' {
  const initSqlJs: (config?: { locateFile?: (filename: string) => string }) => Promise<unknown>
  export default initSqlJs
}

declare module 'anki-apkg-generator/dist/index.min.js' {
  const ankiApkgGenerator: unknown
  export default ankiApkgGenerator
}

declare module 'anki-apkg-generator/wasm/sql-wasm.wasm?url' {
  const wasmUrl: string
  export default wasmUrl
}
