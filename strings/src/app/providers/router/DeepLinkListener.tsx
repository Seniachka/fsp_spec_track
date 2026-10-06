import { useEffect } from 'react'
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { useNavigate } from 'react-router-dom'
import { isNativeApp, parseDeepLinkPath } from '../../../shared/lib/deepLinks'

/**
 * Deep link (universal link / niti://) открывает приложение — ведём его на нужный экран.
 * Без этого приложение стартует на дефолтном экране и цель ссылки теряется.
 *
 * Ссылку личного QR (?qr=1, см. encodeQrPayload) отдельно тут не разбираем:
 * путь вместе с query уезжает в роутер, а App ловит его из location и открывает
 * QrModal сразу на разборе скана (см. App.tsx). Так один и тот же код работает и
 * для холодного старта, и для тёплого, и для возврата после логина, и для
 * перехода с веб-гейта «открыть в приложении».
 */
export const DeepLinkListener = () => {
  const navigate = useNavigate()

  useEffect(() => {
    if (!isNativeApp()) return

    let cancelled = false
    let handle: PluginListenerHandle | null = null

    const go = (url: string | undefined | null) => {
      if (cancelled || !url) return
      const path = parseDeepLinkPath(url)
      if (!path || path === '/') return
      navigate(path, { replace: true })
    }

    void (async () => {
      try {
        // Подписываемся первым делом: ссылка может прийти, пока мы ждём getLaunchUrl.
        const listener = await App.addListener('appUrlOpen', (event) => go(event?.url))
        if (cancelled) {
          void listener.remove()
          return
        }
        handle = listener
      } catch {
        // плагин недоступен — работаем как обычно
      }
      try {
        // Холодный старт: ссылка, которой приложение запустили.
        const launch = await App.getLaunchUrl()
        go(launch?.url)
      } catch {
        // плагин недоступен — работаем как обычно
      }
    })()

    return () => {
      cancelled = true
      void handle?.remove()
    }
  }, [navigate])

  return null
}
