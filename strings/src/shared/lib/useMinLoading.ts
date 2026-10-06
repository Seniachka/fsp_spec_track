import { useEffect, useRef, useState } from 'react'

/** Минимальная видимость скелетона — без «мигания» при быстрой загрузке */
export const MIN_SKELETON_MS = 400

/**
 * Держит loading=true ещё minMs с момента первого показа,
 * чтобы скелетон не вспыхивал и сразу не пропадал.
 * Если loading так и не включался — false сразу (кэш / без скелетона).
 */
export const useMinLoading = (loading: boolean, minMs: number = MIN_SKELETON_MS): boolean => {
  const [visible, setVisible] = useState(loading)
  const shownAtRef = useRef<number | null>(loading ? performance.now() : null)

  useEffect(() => {
    let timer: number | undefined

    if (loading) {
      shownAtRef.current ??= performance.now()
      setVisible(true)
      return
    }

    if (shownAtRef.current == null) {
      setVisible(false)
      return
    }

    const remaining = minMs - (performance.now() - shownAtRef.current)
    if (remaining <= 0) {
      shownAtRef.current = null
      setVisible(false)
      return
    }

    timer = window.setTimeout(() => {
      shownAtRef.current = null
      setVisible(false)
    }, remaining)

    return () => {
      if (timer != null) window.clearTimeout(timer)
    }
  }, [loading, minMs])

  return visible
}
