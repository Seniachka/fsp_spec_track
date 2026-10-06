import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { InAppBrowser } from '@capgo/capacitor-inappbrowser'
import { APP_VERSION, fetchAppRelease, type AppRelease } from '../../api/AppRelease'
import { isAndroidBrowser, isIosBrowser, isNativeApp } from '../../shared/lib/deepLinks'
import '../../shared/ui/startup-gate/startup-gate.css'

const APP_STORE_URL = 'https://apps.apple.com/app/%D0%BD%D0%B8%D1%82%D0%B8/id6800085399'
const RUSTORE_URL = 'https://www.rustore.ru/catalog/app/ru.strings.app'

/** iPhone, iPad и нативный iOS — App Store, остальное — RuStore. */
const storeUrl = (): string => {
  if (Capacitor.getPlatform() === 'ios' || isIosBrowser()) return APP_STORE_URL
  if (Capacitor.getPlatform() === 'android' || isAndroidBrowser()) return RUSTORE_URL
  if (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
    return APP_STORE_URL
  }
  return RUSTORE_URL
}

const openStore = async (url: string): Promise<void> => {
  try {
    await InAppBrowser.open({ url })
  } catch {
    window.location.href = url
  }
}

const AppUpdateScreen = ({ release }: { release: AppRelease }) => {
  const url = storeUrl()

  const onUpdate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isNativeApp()) return
    event.preventDefault()
    void openStore(url)
  }

  return (
    <main className="startup-gate startup-gate--cover">
      <div className="startup-gate__box">
        <h1 className="startup-gate__title">Обнови приложение</h1>
        <p className="startup-gate__text">
          Эта версия больше не совпадает с сервером. Установи обновление, чтобы продолжить.
        </p>
        <p className="startup-gate__text">
          Сейчас {APP_VERSION || '—'}, нужна {release.version}
        </p>
        <a className="btn-primary startup-gate__retry" href={url} onClick={onUpdate}>
          Обновить
        </a>
      </div>
    </main>
  )
}

/**
 * Сверяет VERSION сборки с GET /api/app/version. Несовпадение закрывает
 * приложение экраном обновления.
 * Сеть молчит или эндпоинта ещё нет — приложение открывается как раньше.
 */
export const AppUpdateGate = ({ children }: { children: ReactNode }) => {
  const [release, setRelease] = useState<AppRelease | null>(null)

  useEffect(() => {
    if (!APP_VERSION) return
    let cancelled = false
    void fetchAppRelease().then((next) => {
      if (cancelled || !next || next.version === APP_VERSION) return
      setRelease(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      {children}
      {release && <AppUpdateScreen release={release} />}
    </>
  )
}
