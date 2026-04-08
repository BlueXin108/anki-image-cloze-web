import { useCallback, useRef } from 'react'

type PossibleRef<T> = React.Ref<T> | undefined

function setRef<T>(ref: PossibleRef<T>, value: T | null) {
  if (typeof ref === 'function') {
    ref(value)
  } else if (ref !== null && ref !== undefined) {
    ;(ref as React.MutableRefObject<T | null>).current = value
  }
}

function composeRefs<T>(...refs: PossibleRef<T>[]) {
  return (node: T | null) => {
    for (let i = 0; i < refs.length; i++) {
      setRef(refs[i], node)
    }
  }
}

function useComposedRefs<T>(...refs: PossibleRef<T>[]) {
  const refsRef = useRef(refs)
  refsRef.current = refs

  return useCallback((node: T | null) => {
    return composeRefs(...refsRef.current)(node)
  }, [])
}

export { composeRefs, useComposedRefs }
