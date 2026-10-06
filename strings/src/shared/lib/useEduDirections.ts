import { useCallback, useEffect, useMemo, useState } from 'react'
import { listEduDirections } from '../../api/Reference'
import { EDU_DIRECTIONS } from '../../entities/education/model/eduDirections'

type UseEduDirectionsResult = {
  names: string[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Направления обучения (не-ЦУ вузы): GET /api/edu-directions.
 * Fallback EDU_DIRECTIONS — если API упал или вернул пусто.
 */
export const useEduDirections = (): UseEduDirectionsResult => {
  const [names, setNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const items = await listEduDirections()
      const next = items.map((d) => d.name.trim()).filter(Boolean)
      setNames(next.length > 0 ? next : [...EDU_DIRECTIONS])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить направления')
      setNames([...EDU_DIRECTIONS])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return useMemo(() => ({ names, loading, error, refetch }), [names, loading, error, refetch])
}
