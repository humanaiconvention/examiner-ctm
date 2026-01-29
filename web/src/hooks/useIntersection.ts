import { useEffect, useRef, useState } from 'react'

export interface UseIntersectionOptions extends IntersectionObserverInit {
  /** If true, intersection is only computed once (first time visible). */
  once?: boolean
}

/**
 * Lightweight wrapper around IntersectionObserver with SSR/test guards.
 */
export function useIntersection<T extends HTMLElement>(options: UseIntersectionOptions = {}) {
  const { once = true, root, rootMargin, threshold } = options
  const ref = useRef<T | null>(null)
  const [isIntersecting, setIsIntersecting] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !ref.current || typeof IntersectionObserver === 'undefined') {
      // In non-browser (tests/SSR) just mark as intersecting so content renders.
      setIsIntersecting(true)
      return
    }
    const el = ref.current
    let cancelled = false
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !cancelled) {
          setIsIntersecting(true)
          if (once) {
            observer.disconnect()
          }
        } else if (!once) {
          setIsIntersecting(entry.isIntersecting)
        }
      }
    }, {
      ...(root !== undefined ? { root } : {}),
      ...(rootMargin !== undefined ? { rootMargin } : {}),
      ...(threshold !== undefined ? { threshold } : {}),
    })
    observer.observe(el)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [once, root, rootMargin, threshold])

  return { ref, isIntersecting }
}

export default useIntersection
