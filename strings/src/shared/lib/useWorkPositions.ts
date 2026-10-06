import { useCallback, useEffect, useMemo, useState } from 'react'
import { listWorkPositions } from '../../api/Reference'
import { PRODUCT_OPTIONS } from '../../entities/profile/model/types'

type UseWorkPositionsResult = {
  names: string[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Специализации профиля: GET /api/work-positions.
 * Fallback PRODUCT_OPTIONS только если API упал — в поле формы сами ничего не подставляем.
 */
export const useWorkPositions = (): UseWorkPositionsResult => {
  const [names, setNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const items = await listWorkPositions()
      const next = items.map((p) => p.name.trim()).filter(Boolean)
      setNames(next)
      if (next.length === 0) {
        setNames([...PRODUCT_OPTIONS])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить специализации')
      setNames([...PRODUCT_OPTIONS])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return useMemo(
    () => ({ names, loading, error, refetch }),
    [names, loading, error, refetch],
  )
}
