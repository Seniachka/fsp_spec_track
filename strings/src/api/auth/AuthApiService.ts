import {
  authCookieJar,
  AUTH_OIDC_URL_ABSOLUTE,
  TARGET_COOKIE_NAME,
} from './authCookieJar'
import { authFetch, extractBffFromAuthResult, readBffCookieFromNativeStore, toAuthRequestUrl, type AuthFetchResult } from './authFetch'
import { clearStoredBffCookie } from './cuSession'
import { parseAuthPage, type AuthStepResult } from './parseAuthPage'

export type { AuthStepResult } from './parseAuthPage'

const mapActivePageToStep = (activePage: string): 'email' | 'password' | 'sms' | null => {
  const normalized = activePage.trim().toLowerCase()
  if (normalized === 'emaillogin' || normalized === 'email' || normalized === 'username') {
    return 'email'
  }
  if (normalized === 'password') return 'password'
  if (normalized === 'otp' || normalized === 'sms' || normalized === 'phone' || normalized === 'smsotp') {
    return 'sms'
  }
  return null
}

export { mapActivePageToStep }

export const resetSession = (): void => {
  authCookieJar.reset()
}

/**
 * Сетевой сбой на пути к Keycloak ЦУ. Сырой текст ошибки (например, «Не удалось
 * установить безопасное подключение из-за ошибки TLS» от iOS) пользователю не
 * показываем — он ничего не объясняет и выглядит как поломка приложения; в
 * консоль кладём как есть для диагностики.
 */
const connectionError = (e: unknown): AuthStepResult => {
  console.warn('[auth] CU request failed:', e instanceof Error ? e.message : String(e))
  return {
    type: 'error',
    message: 'Не удалось связаться с сервером университета. Проверь соединение и попробуй ещё раз',
  }
}

export const startAuth = async (): Promise<AuthStepResult> => {
  try {
    const response = await authFetch(AUTH_OIDC_URL_ABSOLUTE)
    return handleAuthResponse(response)
  } catch (e) {
    return connectionError(e)
  }
}

export const submitUsername = (loginAction: string, username: string): Promise<AuthStepResult> =>
  postForm(loginAction, `username=${encodeURIComponent(username)}`)

export const submitPassword = (loginAction: string, password: string): Promise<AuthStepResult> =>
  postForm(loginAction, `password=${encodeURIComponent(password)}`)

export const submitOtp = (
  loginAction: string,
  code: string,
  phoneNumber: string,
): Promise<AuthStepResult> =>
  postForm(
    loginAction,
    [
      `phoneNumber=${encodeURIComponent(phoneNumber)}`,
      `code=${encodeURIComponent(code)}`,
      'action=verify',
      'credentialId=',
    ].join('&'),
  )

/** Request a fresh SMS code on the current OTP step (no full re-login). */
export const resendOtp = (loginAction: string, phoneNumber: string): Promise<AuthStepResult> =>
  postForm(
    loginAction,
    [
      `phoneNumber=${encodeURIComponent(phoneNumber)}`,
      'code=',
      'action=resend',
      'credentialId=',
    ].join('&'),
  )

/**
 * Follows the callback URL and returns the `bff.cookie` value, or null.
 * On iOS Set-Cookie is often invisible in headers — also read CapacitorCookies store.
 *
 * Код обмениваем ВСЕГДА: кука, лежащая в сторе до обмена, почти всегда от прошлой
 * сессии (нативный cookie-store переживает логаут, а pullNativeCookiesIntoJar тянет
 * её в jar). Вернуть её — это цикл логина на протухшей куке или вход в чужой аккаунт.
 */
export const exchangeCallback = async (callbackUrl: string): Promise<string | null> => {
  const stale =
    authCookieJar.findCookie(TARGET_COOKIE_NAME) ?? (await readBffCookieFromNativeStore())
  // Чтобы BFF выдал новую сессию, а не подтвердил старую — убираем куку до обмена.
  await clearStoredBffCookie()

  /** Принимаем только значение, появившееся в этом обмене. */
  const fresh = (value: string | null): string | null =>
    value && value !== stale ? value : null

  const fromStores = async (): Promise<string | null> =>
    fresh(await readBffCookieFromNativeStore()) ?? fresh(authCookieJar.findCookie(TARGET_COOKIE_NAME))

  try {
    let nextUrl = toAuthRequestUrl(callbackUrl)
    for (let i = 0; i < 5; i += 1) {
      const response = await authFetch(nextUrl)
      const fromResult = fresh(extractBffFromAuthResult(response))
      if (fromResult) return fromResult

      const fromNative = await fromStores()
      if (fromNative) return fromNative

      const isRedirect =
        response.status === 301 ||
        response.status === 302 ||
        response.status === 303 ||
        response.status === 307 ||
        response.status === 308

      if (isRedirect && response.location) {
        nextUrl = toAuthRequestUrl(response.location, response.finalUrl || response.url)
        continue
      }
      break
    }

    return await fromStores()
  } catch {
    return await fromStores()
  }
}

const postForm = async (url: string, formBody: string): Promise<AuthStepResult> => {
  try {
    const response = await authFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
    })
    return handleAuthResponse(response)
  } catch (e) {
    return connectionError(e)
  }
}

const getUrlPathname = (url: string, base?: string): string => {
  try {
    return new URL(url, base || 'https://id.centraluniversity.ru').pathname
  } catch {
    return url.split('?')[0] ?? url
  }
}

/** True only for the real BFF sign-in callback path — not `redirect_uri=...callback` in query. */
const isSignInCallbackUrl = (url: string, base?: string): boolean => {
  const pathname = getUrlPathname(url, base).toLowerCase()
  return (
    pathname.includes('/account/signin/callback') ||
    pathname.includes('/signin/callback')
  )
}

const looksLikeAuthComplete = (response: AuthFetchResult): boolean => {
  const bff = extractBffFromAuthResult(response)
  if (!bff) return false
  const finalUrl = response.finalUrl || response.url
  const location = response.location ?? ''
  return (
    isSignInCallbackUrl(finalUrl, response.url) ||
    (Boolean(location) && isSignInCallbackUrl(location, response.url))
  )
}

const handleAuthResponse = async (response: AuthFetchResult): Promise<AuthStepResult> => {
  if (looksLikeAuthComplete(response)) {
    return {
      type: 'redirect',
      callbackUrl: response.location ?? response.finalUrl ?? response.url,
    }
  }

  if (
    response.status === 301 ||
    response.status === 302 ||
    response.status === 303 ||
    response.status === 307 ||
    response.status === 308
  ) {
    const location = response.location
    if (!location) {
      return { type: 'error', message: 'Пустой редирект' }
    }

    if (isSignInCallbackUrl(location, response.url)) {
      return { type: 'redirect', callbackUrl: toAuthRequestUrl(location, response.url) }
    }

    try {
      const next = await authFetch(toAuthRequestUrl(location, response.url))
      return handleAuthResponse(next)
    } catch {
      return { type: 'error', message: 'Ошибка при переходе' }
    }
  }

  if (response.status >= 200 && response.status < 300) {
    if (!response.bodyText || response.bodyText.length < 20) {
      return {
        type: 'error',
        message: `Пустой ответ авторизации (HTTP ${response.status})`,
      }
    }
    const parsed = parseAuthPage(response.bodyText)
    if (parsed.type === 'next') {
      const mapped = mapActivePageToStep(parsed.activePage)
      if (!mapped) {
        return {
          type: 'error',
          message: `Неизвестный шаг входа: ${parsed.activePage}`,
        }
      }
    }
    if (parsed.type === 'error') {
      return {
        type: 'error',
        message: `${parsed.message} (HTTP ${response.status})`,
      }
    }
    return parsed
  }

  if (response.status === 0) {
    return {
      type: 'error',
      message: 'Не удалось обработать ответ авторизации. Попробуйте ещё раз.',
    }
  }

  return { type: 'error', message: `Ошибка сервера: ${response.status}` }
}
