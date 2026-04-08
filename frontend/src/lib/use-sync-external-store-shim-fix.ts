import { useSyncExternalStore } from 'react'

// React 19 already ships the native hook, but some Radix packages still
// import it from `use-sync-external-store/shim`. Vite can treat that shim as
// a CommonJS default-only module during dev, so we expose a tiny ESM bridge.
export { useSyncExternalStore }
