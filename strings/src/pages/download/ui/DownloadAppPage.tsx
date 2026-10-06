import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../../shared/ui/button/Button'
import {
  getAndroidDownloadUrl,
  getIosDownloadUrl,
  isAndroidBrowser,
  isIosBrowser,
  isNativeApp,
  isShareDeepPath,
  skipOpenInAppGate,
  tryOpenNativeApp,
} from '../../../shared/lib/deepLinks'
import './open-in-app-gate.css'

/** Явная страница скачивания: /download?next=/profile/... — только для веба. */
export const DownloadAppPage = () => {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const nextRaw = params.get('next') || '/profile'
  const next = nextRaw.startsWith('/') ? nextRaw : `/${nextRaw}`
  const nextPath = next.split('?')[0] || next
  const nextSearch = next.slice(nextPath.length)
  const canOpen = isShareDeepPath(nextPath)
  const iosUrl = getIosDownloadUrl()
  const androidUrl = getAndroidDownloadUrl()

  // Внутри нативного приложения страница скачивания не имеет смысла
  // (и упоминать другие площадки в iOS-сборке нельзя — Guideline 2.3.10).
  useEffect(() => {
    if (isNativeApp()) navigate(next, { replace: true })
  }, [navigate, next])

  if (isNativeApp()) return null

  return (
    <main className="open-in-app">
      <div className="open-in-app__card">
        <p className="open-in-app__brand">Нити</p>
        <h1 className="open-in-app__title">Скачать приложение</h1>
        <p className="open-in-app__text">
          В приложении удобнее: профили, QR-обмен контактами и афиша всегда под рукой.
        </p>
        <div className="open-in-app__actions">
          {canOpen && (
            <Button onClick={() => tryOpenNativeApp(nextPath, nextSearch)}>
              У меня уже есть приложение
            </Button>
          )}
          {iosUrl && (isIosBrowser() || !isAndroidBrowser()) && (
            <a className="open-in-app__secondary" href={iosUrl}>
              Скачать для iPhone
            </a>
          )}
          {androidUrl && (isAndroidBrowser() || !isIosBrowser()) && (
            <a className="open-in-app__secondary" href={androidUrl}>
              Скачать для Android
            </a>
          )}
          <button
            type="button"
            className="open-in-app__browser"
            onClick={() => {
              // Без этого гейт «открыть в приложении» тут же перехватит переход обратно.
              skipOpenInAppGate()
              navigate(next)
            }}
          >
            Открыть в браузере
          </button>
        </div>
      </div>
    </main>
  )
}
