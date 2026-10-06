import { useEffect, useState } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import { clearAuth } from '../../../api/client'
import { GATE_GET_ME_OPTIONS, getMe, resetGetMeInflight } from '../../../api/Me'
import { clearUserScopedStores } from '../../../shared/lib/userScopedStorage'
import { useProfile } from '../../../shared/lib/useProfile'
import { StartupError, StartupLoader } from '../../../shared/ui/startup-gate/StartupGate'
import {
  clearOnboardingCompleted,
  isOnboardingCompleted,
  setOnboardingCompleted,
} from '../../../pages/onboarding/model/onboardingStorage'

/** Быстрый ответ не должен мигать лоадером. */
const LOADER_DELAY_MS = 300
/** Дальше держать вошедшего пользователя на пустом экране нельзя. */
const OFFLINE_AFTER_MS = 10_000

/**
 * Для экранов приложения (не /onboarding): если профиль без completedAt —
 * возвращаем в онбординг. Страхует от гонок после первого логина.
 */
export const RequireOnboardingComplete = () => {
  const navigate = useNavigate()
  const { clearCachedProfile } = useProfile()
  const [gate, setGate] = useState<'check' | 'ok' | 'onboarding' | 'offline'>(() =>
    isOnboardingCompleted() ? 'ok' : 'check',
  )
  const [showLoader, setShowLoader] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    const loaderTimer = window.setTimeout(() => {
      if (!cancelled) setShowLoader(true)
    }, LOADER_DELAY_MS)
    // Флаг «онбординг пройден» уже пустил в приложение — такой гейт не гасим.
    const offlineTimer = window.setTimeout(() => {
      if (!cancelled) setGate((prev) => (prev === 'check' ? 'offline' : prev))
    }, OFFLINE_AFTER_MS)

    void (async () => {
      try {
        const me = await getMe(GATE_GET_ME_OPTIONS)
        if (cancelled) return
        if (me?.completedAt) {
          setOnboardingCompleted()
          setGate('ok')
          return
        }
        if (me) {
          clearOnboardingCompleted()
          setGate('onboarding')
          return
        }
        clearOnboardingCompleted()
        setGate('onboarding')
      } catch {
        if (cancelled) return
        // Сеть недоступна: не выкидываем из приложения, если флаг уже стоял.
        if (isOnboardingCompleted()) {
          setGate('ok')
          return
        }
        setGate('offline')
      } finally {
        window.clearTimeout(loaderTimer)
        window.clearTimeout(offlineTimer)
      }
    })()

    return () => {
      cancelled = true
      window.clearTimeout(loaderTimer)
      window.clearTimeout(offlineTimer)
    }
  }, [attempt])

  const retry = () => {
    // Сбрасываем in-flight: иначе повтор просто подождёт зависший запрос.
    resetGetMeInflight()
    setShowLoader(false)
    setGate('check')
    setAttempt((n) => n + 1)
  }

  const signOut = () => {
    clearAuth()
    clearCachedProfile()
    clearUserScopedStores()
    clearOnboardingCompleted()
    navigate('/', { replace: true })
  }

  if (gate === 'check') {
    return showLoader ? <StartupLoader /> : <main aria-busy="true" style={{ minHeight: '40vh' }} />
  }
  if (gate === 'offline') {
    return <StartupError onRetry={retry} onSignOut={signOut} />
  }
  if (gate === 'onboarding') {
    return <Navigate to="/onboarding" replace />
  }
  return <Outlet />
}
