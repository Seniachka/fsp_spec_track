import { useCallback, useEffect, useState } from 'react'
import { getMeCompleteness } from '../../../api/Me'

export const useProfileCompleteness = () => {
  const [percent, setPercent] = useState<number | null>(null)

  const refetch = useCallback(async () => {
    try {
      const result = await getMeCompleteness()
      const next = Number(result.percent)
      setPercent(Number.isFinite(next) ? Math.max(0, Math.min(100, next)) : 0)
    } catch {
      // оставляем предыдущее значение
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { percent, refetch }
}
