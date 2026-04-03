/**
 * Patched version of @radix-ui/react-compose-refs for React 19 compatibility.
 *
 * The original useComposedRefs uses `useCallback(composeRefs(...refs), refs)`,
 * where `refs` is a rest-param array that creates a new array reference on
 * every render, causing useCallback to always return a new function.
 *
 * In React 19, a new ref callback ≠ the old ref callback triggers
 * detach(oldRef) → attach(newRef) during the commit phase. If any of the
 * composed refs is a state-setter (e.g. `(node) => setScrollArea(node)` in
 * @radix-ui/react-scroll-area), the setState fired during commit triggers
 * another render → another ref change → infinite loop →
 * "Maximum update depth exceeded".
 *
 * Fix: use `useRef` to store the latest refs and return a **stable** callback
 * that always delegates to the latest refs, so React never detaches/reattaches.
 */
import { useCallback, useRef } from 'react'

type PossibleRef<T> = React.Ref<T> | ((node: T | null) => void | (() => void)) | undefined

function setRef<T>(ref: PossibleRef<T>, value: T | null) {
  if (typeof ref === 'function') {
    return ref(value)
  } else if (ref !== null && ref !== undefined) {
    ;(ref as React.MutableRefObject<T | null>).current = value
  }
}

function composeRefs<T>(...refs: PossibleRef<T>[]) {
  return (node: T | null) => {
    let hasCleanup = false
    const cleanups = refs.map((ref) => {
      const cleanup = setRef(ref, node)
      if (!hasCleanup && typeof cleanup === 'function') {
        hasCleanup = true
      }
      return cleanup
    })
    if (hasCleanup) {
      return () => {
        for (let i = 0; i < cleanups.length; i++) {
          const cleanup = cleanups[i]
          if (typeof cleanup === 'function') {
            cleanup()
          } else {
            setRef(refs[i], null)
          }
        }
      }
    }
  }
}

function useComposedRefs<T>(...refs: PossibleRef<T>[]) {
  // Store the latest refs in a ref so our callback identity never changes
  const refsRef = useRef(refs)
  refsRef.current = refs

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((node: T | null) => {
    return composeRefs(...refsRef.current)(node)
  }, [])
}

export { composeRefs, useComposedRefs }
