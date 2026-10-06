import { Button } from '../../../shared/ui/button/Button'
import {
  getAndroidDownloadUrl,
  getIosDownloadUrl,
  isAndroidBrowser,
  isIosBrowser,
  skipOpenInAppGate,
  tryOpenNativeApp,
} from '../../../shared/lib/deepLinks'
import './open-in-app-gate.css'

type OpenInAppGateProps = {
  pathname: string
  search?: string
  onContinueInBrowser: () => void
}

export const OpenInAppGate = ({
  pathname,
  search = '',
  onContinueInBrowser,
}: OpenInAppGateProps) => {
  const iosUrl = getIosDownloadUrl()
  const androidUrl = getAndroidDownloadUrl()
  const preferIos = isIosBrowser()
  const preferAndroid = isAndroidBrowser()

  // Автопопытку открыть приложение не делаем: iOS блокирует переход на custom scheme
  // без жеста пользователя — только по кнопке ниже.
  return (
    <main className="open-in-app">
      <div className="open-in-app__card">
        <p className="open-in-app__brand">Нити</p>
        <h1 className="open-in-app__title">Открыть в приложении</h1>
        <p className="open-in-app__text">
          «Нити» откроются на нужном экране. Если приложения ещё нет — скачай и установи.
        </p>

        <div className="open-in-app__actions">
          <Button
            onClick={() => {
              tryOpenNativeApp(pathname, search)
            }}
          >
            Открыть в «Нити»
          </Button>

          {iosUrl && (preferIos || !preferAndroid) && (
            <a className="open-in-app__secondary" href={iosUrl}>
              Скачать для iPhone
            </a>
          )}
          {androidUrl && (preferAndroid || !preferIos) && (
            <a className="open-in-app__secondary" href={androidUrl}>
              Скачать для Android
            </a>
          )}

          <button
            type="button"
            className="open-in-app__browser"
            onClick={() => {
              skipOpenInAppGate()
              onContinueInBrowser()
            }}
          >
            Продолжить в браузере
          </button>
        </div>
      </div>
    </main>
  )
}
