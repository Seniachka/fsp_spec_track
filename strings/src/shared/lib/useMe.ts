import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { isAuthenticated } from '../../api/client'
import { getMe } from '../../api/Me'
import type { UserProfile } from '../../api/types'

/**
 * Локальный стейт (не контекст). После логина без remount App нужно
 * снова дернуть refetch — поэтому слушаем смену pathname + появление auth.
 */
export const useMe = () => {
  const location = useLocation()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(() => isAuthenticated())
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async (override?: UserProfile | null) => {
    if (override !== undefined) {
      setUser(override)
      setError(null)
      setLoading(false)
      return override
    }

    if (!isAuthenticated()) {
      setUser(null)
      setLoading(false)
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const profile = await getMe()
      setUser(profile)
      return profile
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось загрузить профиль'
      setError(message)
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated()) {
      setUser(null)
      setLoading(false)
      return
    }
    // Уже есть id — не дёргаем /me на каждый переход
    if (user?.id) return
    void refetch()
  }, [refetch, location.pathname, user?.id])

  return { user, loading, error, refetch }
}
