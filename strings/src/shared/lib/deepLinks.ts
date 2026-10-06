import { Capacitor } from '@capacitor/core'

export const APP_ID = 'ru.strings.app'
export const APP_HOST = 'niti-uni.ru'
export const APP_CUSTOM_SCHEME = 'niti'

// Ссылки скачивания задаются через VITE_IOS_DOWNLOAD_URL / VITE_ANDROID_DOWNLOAD_URL.
// Пустая строка = ссылка не настроена, кнопка скачивания не рендерится.
export const getIosDownloadUrl = (): string =>
  String(import.meta.env.VITE_IOS_DOWNLOAD_URL || '').trim()

export const getAndroidDownloadUrl = (): string =>
  String(import.meta.env.VITE_ANDROID_DOWNLOAD_URL || '').trim()

const SKIP_WEB_GATE_KEY = 'faculty.skipOpenInAppGate'

/** Снятие отложенного ухода на /download, взведённого в tryOpenNativeApp (null — нечего снимать). */
let cancelPendingNativeOpenFallback: (() => void) | null = null

/**
 * Веб-страницы, которые гейт не перехватывает: сам экран скачивания, юр. документы,
 * поддержка (её открывают по прямой ссылке из стора и документов) и прокси авторизации.
 */
const WEB_ONLY_PREFIXES = ['/download', '/legal', '/support', '/cu-id', '/cu-my']

/** Локальная отладка: `npm run dev` или открытый localhost — гейт не мешает. */
const isLocalDev = (): boolean => {
  if (import.meta.env.DEV) return true
  if (typeof window === 'undefined') return false
  return /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname)
}

export const isNativeApp = (): boolean => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export const isMobileBrowser = (): boolean => {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

export const isIosBrowser = (): boolean => {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export const isAndroidBrowser = (): boolean => {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

/** Пути, которыми шарятся и которые должны открываться в приложении. */
export const isShareDeepPath = (pathname: string): boolean => {
  if (/^\/profile\/u\/[^/]+\/?$/.test(pathname)) return true
  if (/^\/profile\/(?!edit$|settings$)[^/]+\/?$/.test(pathname)) return true
  if (/^\/(search|friends|afisha)\/u\/[^/]+\/?$/.test(pathname)) return true
  if (/^\/afisha\/(events|announcements)\/[^/]+\/?$/.test(pathname)) return true
  return false
}

/**
 * Любой вход через браузер уводим на гейт «открыть в приложении / скачать».
 * Исключения: локальная отладка, нативная сборка, веб-страницы из WEB_ONLY_PREFIXES
 * и явное «Продолжить в браузере» (флаг живёт до конца сессии вкладки).
 */
export const shouldShowOpenInAppGate = (pathname: string): boolean => {
  // В `npm run dev` / на localhost не мешаем локальной отладке в мобильном браузере / DevTools.
  if (isLocalDev()) return false
  if (isNativeApp()) return false
  if (WEB_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return false
  }
  try {
    if (sessionStorage.getItem(SKIP_WEB_GATE_KEY) === '1') return false
  } catch {
    // ignore
  }
  return true
}

export const skipOpenInAppGate = (): void => {
  // Пользователь выбрал браузер: взведённый фолбэк обязан сняться, иначе через
  // NATIVE_OPEN_FALLBACK_MS после «Открыть в «Нити»» его выкинет с открытого
  // экрана на /download — ровно вопреки только что сделанному выбору.
  cancelPendingNativeOpenFallback?.()
  try {
    sessionStorage.setItem(SKIP_WEB_GATE_KEY, '1')
  } catch {
    // ignore
  }
}

/** Путь на веб-страницу скачивания с запомненным целевым экраном. */
export const buildDownloadPath = (pathname: string, search = ''): string =>
  `/download?next=${encodeURIComponent(`${pathname}${search}`)}`

/** Intent / custom scheme, чтобы ОС попыталась открыть установленное приложение. */
export const buildAppOpenUrl = (pathname: string, search = ''): string => {
  const path = `${pathname}${search}`

  if (isAndroidBrowser()) {
    const fallback = encodeURIComponent(`https://${APP_HOST}${buildDownloadPath(pathname, search)}`)
    return (
      `intent://${APP_HOST}${path}#Intent;scheme=https;package=${APP_ID};` +
      `S.browser_fallback_url=${fallback};end`
    )
  }

  // iOS: custom scheme. Universal Link на свой же домен Safari не перехватывает,
  // поэтому https-ссылку здесь использовать нельзя — будет возврат на ту же страницу.
  return `${APP_CUSTOM_SCHEME}://${path.replace(/^\//, '')}`
}

/**
 * Сколько ждём ухода из браузера, прежде чем увести на /download.
 * С запасом на раздумья над системным диалогом iOS «Открыть в программе „Нити“?»:
 * на коротком таймере пользователь успевал нажать «Открыть» уже после срабатывания фолбэка.
 */
const NATIVE_OPEN_FALLBACK_MS = 2500

/**
 * Открыть установленное приложение. Вызывать ТОЛЬКО из обработчика клика:
 * скрытый iframe с custom scheme Safari блокирует, работает лишь прямая навигация по жесту.
 * Если приложение не открылось (страница осталась видимой) — уводим на экран скачивания.
 */
export const tryOpenNativeApp = (pathname: string, search = ''): void => {
  if (typeof window === 'undefined') return
  // Повторное нажатие не должно копить таймеры и слушателей от прошлой попытки.
  cancelPendingNativeOpenFallback?.()
  const target = buildAppOpenUrl(pathname, search)

  if (isAndroidBrowser()) {
    // intent:// сам уходит на S.browser_fallback_url, если приложения нет.
    window.location.href = target
    return
  }

  const downloadPath = buildDownloadPath(pathname, search)
  const alreadyOnDownload = window.location.pathname === '/download'

  if (!alreadyOnDownload) {
    let fallbackTimer = 0

    const unwatch = () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', cancelFallback)
      window.removeEventListener('blur', cancelFallback)
    }

    // Приложение открылось либо Safari показал системный диалог «Открыть в программе „Нити“?»:
    // в обоих случаях вкладка уходит в фон или теряет фокус — на /download уводить не нужно.
    const cancelFallback = () => {
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer)
        fallbackTimer = 0
      }
      if (cancelPendingNativeOpenFallback === cancelFallback) {
        cancelPendingNativeOpenFallback = null
      }
      unwatch()
    }

    // Пока системный диалог открыт, страница остаётся 'visible', так что одного
    // visibilitychange мало — ловим ещё pagehide и потерю фокуса окном.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') cancelFallback()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', cancelFallback)
    window.addEventListener('blur', cancelFallback)

    fallbackTimer = window.setTimeout(() => {
      fallbackTimer = 0
      cancelPendingNativeOpenFallback = null
      unwatch()
      if (document.visibilityState === 'hidden') return
      window.location.href = downloadPath
    }, NATIVE_OPEN_FALLBACK_MS)

    cancelPendingNativeOpenFallback = cancelFallback
  }

  window.location.href = target
}

/**
 * URL из appUrlOpen → путь внутри SPA.
 * Понимает `niti://profile/u/123` и `https://niti-uni.ru/profile/u/123`.
 */
export const parseDeepLinkPath = (url: string): string | null => {
  try {
    const parsed = new URL(url)
    const scheme = parsed.protocol.replace(/:$/, '').toLowerCase()

    if (scheme === APP_CUSTOM_SCHEME) {
      // В custom scheme первый сегмент попадает в host: niti://profile/u/1 → host=profile.
      const path = `/${parsed.host}${parsed.pathname}`.replace(/\/{2,}/g, '/')
      return `${path}${parsed.search}${parsed.hash}`
    }

    if ((scheme === 'https' || scheme === 'http') && parsed.hostname.toLowerCase() === APP_HOST) {
      // `https://niti-uni.ru//evil.com` даёт pathname `//evil.com` — это protocol-relative
      // путь, и navigate() по нему уходит на чужой origin (pushState кидает SecurityError).
      const path = parsed.pathname.replace(/^\/{2,}/, '/')
      return `${path}${parsed.search}${parsed.hash}`
    }

    return null
  } catch {
    return null
  }
}
