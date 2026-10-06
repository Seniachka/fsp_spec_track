import { BackgroundColor, InAppBrowser, ToolBarType } from '@capgo/capacitor-inappbrowser'
import { Capacitor } from '@capacitor/core'
import { AUTH_OIDC_URL_ABSOLUTE, AUTH_OIDC_URL_PROXY, CU_ID_ORIGIN, CU_MY_ORIGIN } from './authCookieJar'
import { readBffCookieFromNativeStore } from './authFetch'

/** Must match `CU_AUTH_MESSAGE_TYPE` in api/lib/bridgeUpstream.ts */
export const CU_AUTH_MESSAGE_TYPE = 'cu-bff-auth'

const OVERLAY_ID = 'cu-auth-overlay'
const BFF_COOKIE_KEYS = ['bff.cookie', 'bff_cookie', 'BFF.COOKIE'] as const

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/**
 * Same OIDC URL as native (`AUTH_OIDC_URL_ABSOLUTE`).
 * On web we open it via `/cu-id` proxy so we can intercept `bff.cookie` on callback
 * (HttpOnly cookie is not readable from JS on localhost).
 */
export const getCuAuthPopupUrl = (): string =>
  isNative() ? AUTH_OIDC_URL_ABSOLUTE : AUTH_OIDC_URL_PROXY

const emitAuthToken = (token: string): void => {
  window.postMessage({ type: CU_AUTH_MESSAGE_TYPE, token }, '*')
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

const pickBffCookie = (cookies: Record<string, string> | null | undefined): string | null => {
  if (!cookies) return null
  for (const key of BFF_COOKIE_KEYS) {
    const raw = cookies[key]
    if (typeof raw === 'string' && raw) return raw.replace(/^"+|"+$/g, '')
  }
  for (const [key, value] of Object.entries(cookies)) {
    if (key.toLowerCase() === 'bff.cookie' && value) {
      return String(value).replace(/^"+|"+$/g, '')
    }
  }
  return null
}

const isAuthCallbackUrl = (url: string | undefined | null): boolean => {
  if (!url) return false
  return url.includes('/account/signin/callback') || url.includes('/signin/callback')
}

const isCuMyUrl = (url: string | undefined | null): boolean => {
  if (!url) return false
  return url.startsWith(CU_MY_ORIGIN) || url.includes('my.centraluniversity.ru')
}

export type CuAuthSession = {
  close: () => void
}

export type CuAuthPopupOptions = {
  /** Окно/webview закрыли без токена — вызывающий гасит свой фоновый поллинг. */
  onDismiss?: () => void
}

let activeClose: (() => void) | null = null

const closeWebOverlay = (): void => {
  document.getElementById(OVERLAY_ID)?.remove()
}

const openWebCuAuthOverlay = (options: CuAuthPopupOptions): CuAuthSession => {
  closeWebOverlay()

  const overlay = document.createElement('div')
  overlay.id = OVERLAY_ID
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', 'Авторизация ЦУ')
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '9999',
    display: 'flex',
    flexDirection: 'column',
    background: '#0f0f14',
  } as CSSStyleDeclaration)

  const header = document.createElement('div')
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: 'calc(12px + env(safe-area-inset-top, 0px)) 16px 12px',
    background: '#16161d',
    color: '#fff',
    flexShrink: '0',
  } as CSSStyleDeclaration)

  const title = document.createElement('span')
  title.textContent = 'Вход через ЦУ'
  Object.assign(title.style, {
    font: '600 16px/1.2 system-ui, sans-serif',
  } as CSSStyleDeclaration)

  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.textContent = 'Закрыть'
  closeBtn.setAttribute('aria-label', 'Закрыть')
  Object.assign(closeBtn.style, {
    border: '0',
    borderRadius: '12px',
    padding: '10px 14px',
    background: 'rgb(255 255 255 / 0.12)',
    color: '#fff',
    font: '600 14px/1 system-ui, sans-serif',
    cursor: 'pointer',
  } as CSSStyleDeclaration)

  const frame = document.createElement('iframe')
  frame.src = getCuAuthPopupUrl()
  frame.title = 'Авторизация ЦУ'
  frame.setAttribute('allow', 'clipboard-read; clipboard-write')
  Object.assign(frame.style, {
    flex: '1 1 auto',
    width: '100%',
    border: '0',
    background: '#fff',
  } as CSSStyleDeclaration)

  const session: CuAuthSession = {
    close: () => {
      closeWebOverlay()
      if (activeClose === session.close) activeClose = null
    },
  }

  closeBtn.addEventListener('click', () => {
    session.close()
    options.onDismiss?.()
  })
  header.append(title, closeBtn)
  overlay.append(header, frame)
  document.body.append(overlay)

  activeClose = session.close
  return session
}

const readCookieFromInAppBrowser = async (pageUrl?: string | null): Promise<string | null> => {
  const urls = [
    pageUrl,
    CU_MY_ORIGIN,
    `${CU_MY_ORIGIN}/`,
    `${CU_MY_ORIGIN}/api`,
    `${CU_MY_ORIGIN}/api/account/signin/callback`,
  ].filter((u): u is string => Boolean(u))

  for (const url of urls) {
    try {
      const cookies = await InAppBrowser.getCookies({ url, includeHttpOnly: true })
      const token = pickBffCookie(cookies)
      if (token) return token
    } catch {
      // try next url
    }
  }

  // Fallback: shared data store → CapacitorCookies
  try {
    return await readBffCookieFromNativeStore()
  } catch {
    return null
  }
}

const openNativeCuAuthWebView = async (options: CuAuthPopupOptions): Promise<CuAuthSession> => {
  let settled = false
  let pollId = 0
  let webviewId: string | undefined
  let lastUrl: string | null = null
  let sawCallback = false
  const cookieBefore = await readCookieFromInAppBrowser(CU_MY_ORIGIN)

  const cleanup = () => {
    window.clearInterval(pollId)
    void InAppBrowser.removeAllListeners()
  }

  const session: CuAuthSession = {
    close: () => {
      settled = true
      cleanup()
      void InAppBrowser.close(webviewId ? { id: webviewId } : undefined)
      if (activeClose === session.close) activeClose = null
    },
  }

  const finishWithToken = async (token: string) => {
    if (settled || !token) return
    settled = true
    cleanup()
    try {
      await InAppBrowser.close(webviewId ? { id: webviewId } : undefined)
    } catch {
      // already closed
    }
    if (activeClose === session.close) activeClose = null
    emitAuthToken(token)
  }

  const tryCaptureCookie = async (force = false): Promise<void> => {
    if (settled) return
    const token = await readCookieFromInAppBrowser(lastUrl)
    if (!token) return
    if (!force && !sawCallback && token === cookieBefore) return
    await finishWithToken(token)
  }

  await InAppBrowser.removeAllListeners()

  await InAppBrowser.addListener('urlChangeEvent', (event) => {
    lastUrl = event.url ?? null
    if (isAuthCallbackUrl(lastUrl)) {
      sawCallback = true
      // Cookie is often set slightly after navigation settles
      void (async () => {
        for (const delay of [0, 200, 500, 1000, 2000]) {
          if (settled) return
          if (delay) await sleep(delay)
          await tryCaptureCookie(true)
          if (settled) return
        }
      })()
      return
    }
    // На my.* попадаем только после логина — форсим захват, даже если
    // KVO-событие с промежуточным callback-URL было проглочено (302-цепочка).
    if (isCuMyUrl(lastUrl)) {
      void tryCaptureCookie(true)
    }
  })

  await InAppBrowser.addListener('closeEvent', () => {
    cleanup()
    void (async () => {
      if (!settled) await tryCaptureCookie(true)
      // Закрыли вручную и куки так и нет — сообщаем наверх, чтобы погасить поллинг.
      if (!settled) options.onDismiss?.()
      if (activeClose === session.close) activeClose = null
    })()
  })

  const opened = await InAppBrowser.openWebView({
    url: AUTH_OIDC_URL_ABSOLUTE,
    title: 'Вход через ЦУ',
    toolbarType: ToolBarType.COMPACT,
    backgroundColor: BackgroundColor.WHITE,
    activeNativeNavigationForWebview: true,
    disableGoBackOnNativeApplication: true,
    // НЕ включать useSharedDataStore: на iOS 17+ getCookies() плагина читает
    // его приватный persistent-store, а shared-webview пишет куки в .default() —
    // bff.cookie тогда никогда не находится и браузер не закрывается.
    persistWebViewData: true,
    isPresentAfterPageLoad: false,
  })
  webviewId = opened?.id

  pollId = window.setInterval(() => {
    // До callback'а — без force: сработает только на изменившейся куке.
    void tryCaptureCookie(sawCallback || isCuMyUrl(lastUrl))
  }, 800)

  activeClose = session.close
  return session
}

/**
 * Opens CU login as an in-app layer (iframe overlay on web, WebView sheet on native).
 * Token is delivered via {@link subscribeCuAuthMessage}.
 */
export const openCuAuthPopup = (options: CuAuthPopupOptions = {}): CuAuthSession | null => {
  activeClose?.()
  activeClose = null

  if (isNative()) {
    let closed = false
    let nativeClose: (() => void) | null = null

    const stub: CuAuthSession = {
      close: () => {
        closed = true
        nativeClose?.()
        if (activeClose === stub.close) activeClose = null
      },
    }
    activeClose = stub.close

    void openNativeCuAuthWebView(options)
      .then((session) => {
        nativeClose = session.close
        if (closed) session.close()
      })
      .catch((err) => {
        console.error('[cu-auth] failed to open in-app browser', err)
        if (activeClose === stub.close) activeClose = null
        options.onDismiss?.()
      })

    return stub
  }

  return openWebCuAuthOverlay(options)
}

export const closeCuAuthPopup = (): void => {
  activeClose?.()
  activeClose = null
  closeWebOverlay()
}

export const subscribeCuAuthMessage = (onToken: (token: string) => void): (() => void) => {
  const handlePayload = (data: { type?: string; token?: unknown } | null) => {
    if (!data || data.type !== CU_AUTH_MESSAGE_TYPE) return
    if (typeof data.token !== 'string' || !data.token) return
    closeCuAuthPopup()
    onToken(data.token)
  }

  // Точный белый список: подстрока 'localhost' пропускала любой origin вида
  // https://localhost.evil.com и отдавала ему обработку токена.
  const allowed = new Set([
    window.location.origin,
    CU_ID_ORIGIN,
    CU_MY_ORIGIN,
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost',
    'https://localhost',
  ])

  const listener = (event: MessageEvent) => {
    // Native emit uses targetOrigin '*'; web proxy posts same-origin
    if (event.origin !== '' && event.origin !== 'null' && !allowed.has(event.origin)) return
    handlePayload(event.data as { type?: string; token?: unknown } | null)
  }

  window.addEventListener('message', listener)

  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(CU_AUTH_MESSAGE_TYPE)
    channel.onmessage = (event) => {
      handlePayload(event.data as { type?: string; token?: unknown } | null)
    }
  } catch {
    // BroadcastChannel may be unavailable
  }

  return () => {
    window.removeEventListener('message', listener)
    channel?.close()
  }
}
