import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { clearAuth, isAuthenticated } from '../../../api/client'
import { GATE_GET_ME_OPTIONS, getMe, resetGetMeInflight } from '../../../api/Me'
import { resolvePostAuthPath } from '../../../shared/lib/appLinks'
import { needsConsent } from '../../legal/model/consentStorage'
import { clearUserScopedStores } from '../../../shared/lib/userScopedStorage'
import { useProfile } from '../../../shared/lib/useProfile'
import { Button } from '../../../shared/ui/button/Button'
import { StartupError, StartupLoader } from '../../../shared/ui/startup-gate/StartupGate'
import { ThreadsNetwork } from './ThreadsNetwork'
import {
  isOnboardingCompleted,
  setOnboardingCompleted,
  clearOnboardingCompleted,
} from '../../onboarding/model/onboardingStorage'
import './welcome-page.css'

/** Быстрый ответ не должен мигать лоадером. */
const LOADER_DELAY_MS = 300
/** Дальше держать вошедшего пользователя на пустом экране нельзя. */
const OFFLINE_AFTER_MS = 10_000

type Gate = 'check' | 'ready' | 'in' | 'onboarding' | 'consent' | 'offline'

export const WelcomePage = () => {
  const navigate = useNavigate()
  const { clearCachedProfile } = useProfile()
  const [gate, setGate] = useState<Gate>(() => (isAuthenticated() ? 'check' : 'ready'))
  const [postAuthPath, setPostAuthPath] = useState('/profile')
  const [showLoader, setShowLoader] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!isAuthenticated()) return
    let cancelled = false

    const loaderTimer = window.setTimeout(() => {
      if (!cancelled) setShowLoader(true)
    }, LOADER_DELAY_MS)
    // Запрос по таймеру не отменяем: поздний успех сам уведёт куда надо.
    const offlineTimer = window.setTimeout(() => {
      if (!cancelled) setGate((prev) => (prev === 'check' ? 'offline' : prev))
    }, OFFLINE_AFTER_MS)

    void (async () => {
      try {
        const me = await getMe(GATE_GET_ME_OPTIONS)
        if (cancelled) return
        if (me && needsConsent(me)) {
          // Сессия старше требования о согласии. Отправляем на экран входа: с живым
          // токеном он не спрашивает логин, а сразу показывает «Формальности».
          setGate('consent')
          return
        }
        if (me?.completedAt) {
          setOnboardingCompleted()
          setPostAuthPath(resolvePostAuthPath(true))
          setGate('in')
          return
        }
        if (me) {
          clearOnboardingCompleted()
          setGate('onboarding')
          return
        }
        clearOnboardingCompleted()
        setGate('ready')
      } catch {
        if (cancelled) return
        // 401 уже разлогинил нас в handleUnauthorized: отправлять в /onboarding нельзя —
        // RequireAuth запишет '/onboarding' как return path и вернёт сюда же.
        if (!isAuthenticated()) {
          setGate('ready')
          return
        }
        // Сеть подвела, но токен есть. Верим локальному флагу «онбординг пройден»
        // (его же читает RequireOnboardingComplete): гнать в онбординг человека,
        // который давно в приложении, из-за одного сбоя сети — хуже, чем пустить.
        if (isOnboardingCompleted()) {
          setPostAuthPath(resolvePostAuthPath(true))
          setGate('in')
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
    setGate('ready')
  }

  if (gate === 'check') {
    return showLoader ? <StartupLoader /> : <main className="welcome-page" aria-busy="true" />
  }
  if (gate === 'offline') {
    return <StartupError onRetry={retry} onSignOut={signOut} />
  }
  if (gate === 'in') {
    return <Navigate to={postAuthPath} replace />
  }
  if (gate === 'onboarding') {
    return <Navigate to="/onboarding" replace />
  }
  if (gate === 'consent') {
    return <Navigate to="/onboarding/auth" replace />
  }

  return (
    <main className="welcome-page">
      <div className="welcome-page__visual" aria-hidden="true">
        <ThreadsNetwork />
      </div>

      <div className="welcome-page__content">
        <h1 className="welcome-page__title">
          Добро пожаловать <span className="welcome-page__title-keep">в Нити</span>
        </h1>
        <p className="welcome-page__subtitle">Находи людей, проекты и возможности</p>
        <Button className="welcome-page__cta" onClick={() => navigate('/onboarding/auth')}>
          Войти через университет
        </Button>
      </div>
    </main>
  )
}
