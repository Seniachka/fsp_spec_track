import { Capacitor, CapacitorCookies, CapacitorHttp } from '@capacitor/core'
import { clearCuSession } from './auth/cuSession'
import { clearStoredProfile } from '../entities/profile/api/profileStorage'
import { clearFriendsListCache } from '../pages/friends/lib/friendsListStorage'
import { clearStoredAvatars } from '../shared/lib/avatarDataStore'
import { clearOnboardingCompleted } from '../pages/onboarding/model/onboardingStorage'
import { clearFormalitiesDraft } from '../pages/welcome/model/formalitiesDraft'
import type { ApiError } from './types'

const BFF_TOKEN_KEY = 'bff_token'
const ADMIN_SESSION_KEY = 'admin_session'
const BFF_COOKIE_HEADER = 'X-Bff-Cookie'
const ADMIN_SESSION_HEADER = 'X-Admin-Session'
const DEV_PROXY_BFF_MARKER = 'dev-proxy-bff'

const isRealBffToken = (token: string | null | undefined): token is string =>
  Boolean(token && token !== DEV_PROXY_BFF_MARKER)

export class ApiRequestError extends Error {
  status: number
  code?: string
  /**
   * Разобранное тело ответа целиком. Нужно тем, кто читает поля сверх
   * error/code: 403 account_deleted приносит deletedAt/purgeAt, и дату
   * удаления надо показать пользователю.
   */
  details?: Record<string, unknown>

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const getBffToken = (): string | null => localStorage.getItem(BFF_TOKEN_KEY)

export const getAdminSession = (): string | null => localStorage.getItem(ADMIN_SESSION_KEY)

export const setAdminSession = (token: string): void => {
  localStorage.setItem(ADMIN_SESSION_KEY, token)
  localStorage.removeItem(BFF_TOKEN_KEY)
  void syncNativeApiCookie(null)
}

export const clearAdminSession = (): void => {
  localStorage.removeItem(ADMIN_SESSION_KEY)
}

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

const normalizeBffToken = (token: string): string => {
  const trimmed = token.trim().replace(/^"+|"+$/g, '').replace(/\s+/g, '')
  if (!trimmed) return ''
  try {
    return decodeURIComponent(trimmed)
  } catch {
    return trimmed
  }
}

/** Plant bff.cookie into the native cookie jar for the API origin (Android/iOS). */
const syncNativeApiCookie = async (token: string | null): Promise<void> => {
  if (!isNative()) return
  const base = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  if (!base) return
  try {
    if (!token) {
      await CapacitorCookies.deleteCookie({ url: base, key: 'bff.cookie' })
      return
    }
    await CapacitorCookies.setCookie({
      url: base,
      key: 'bff.cookie',
      value: token,
      path: '/',
    })
  } catch {
    // Best-effort — X-Bff-Cookie header is the reliable path.
  }
}

export const setBffToken = (token: string): void => {
  const normalized = normalizeBffToken(token)
  localStorage.setItem(BFF_TOKEN_KEY, normalized)
  clearAdminSession()
  void syncNativeApiCookie(normalized)
}

export const getDevBffFromEnv = (): string | null => {
  const token = String(import.meta.env.VITE_BFF || '').trim()
  return token || null
}

export const applyAuthFromEnv = (): void => {
  if (!getDevBffFromEnv()) {
    throw new Error(
      'VITE_BFF не задан. Добавь свежую bff.cookie в strings-front/.env и перезапусти npm run dev.',
    )
  }
  // Маркер для isAuthenticated(); реальную куку в dev подставляет Vite proxy из .env.
  localStorage.setItem(BFF_TOKEN_KEY, DEV_PROXY_BFF_MARKER)
  clearAdminSession()
}

export const isAuthenticated = (): boolean => Boolean(getBffToken() || getAdminSession())

export type ClearAuthOptions = {
  /**
   * Гасить ли сессию ЦУ. По умолчанию да — это настоящий выход или смена аккаунта.
   * Аварийные пути внутри самого входа обязаны передавать false (см. clearLocalAuth).
   */
  endCuSession?: boolean
}

/**
 * Сбрасывает локальную сессию, а по умолчанию — и сессию ЦУ.
 * Сессия ЦУ живёт отдельно от localStorage (нативный cookie-store + webview) и
 * переживает логаут: без этого следующий вход продолжает старый аккаунт.
 */
export const clearAuth = ({ endCuSession = true }: ClearAuthOptions = {}): void => {
  localStorage.removeItem(BFF_TOKEN_KEY)
  clearAdminSession()
  void syncNativeApiCookie(null)
  if (endCuSession) void clearCuSession()
}

/**
 * Откат только локальной сессии — для аварийных путей внутри процесса входа.
 * Сессию ЦУ там трогать нельзя: clearCuSession() чистит cookie-store и данные
 * webview, то есть каждая повторная попытка выкидывала бы пользователя из уже
 * открытого окна ЦУ и заставляла заново вводить логин, пароль и код из СМС.
 */
export const clearLocalAuth = (): void => clearAuth({ endCuSession: false })

let handlingUnauthorized = false

/** Сброс сессии и переход на welcome при 401 от API. */
export const handleUnauthorized = (): void => {
  if (handlingUnauthorized) return
  handlingUnauthorized = true

  if (typeof window !== 'undefined') {
    const path = window.location.pathname
    if (path.startsWith('/onboarding/auth') || path === '/') {
      // В dev не сбрасываем сессию — иначе VITE_BFF ломается на первом 401.
      if (import.meta.env.DEV) {
        handlingUnauthorized = false
        return
      }
      // В проде мёртвую сессию чистим и здесь, но без редиректа (мы уже на входе):
      // иначе welcome с протухшим bff.cookie отправляет юзера в онбординг.
      // Сессию ЦУ не гасим: 401 может прилететь посреди входа (getMe после обмена
      // кода), и стирать данные webview под открытым окном ЦУ нельзя.
      clearLocalAuth()
      clearOnboardingCompleted()
      clearStoredProfile()
      handlingUnauthorized = false
      return
    }
  }

  // Сессия мертва и пользователя выкидывает на welcome — это вынужденный логаут,
  // сессию ЦУ гасим, иначе следующий вход молча продолжит протухший аккаунт.
  clearLocalAuth()
  clearOnboardingCompleted()
  clearStoredProfile()
  clearFriendsListCache()
  clearStoredAvatars()
  clearFormalitiesDraft()

  if (typeof window === 'undefined') {
    void clearCuSession()
    return
  }

  // Редирект ждёт окончания clearCuSession: window.location.replace перезагружает
  // документ и убивает JS-контекст, поэтому из очереди await'ов успевал уйти только
  // первый deleteCookie — куки Keycloak на id.* и стор webview переживали логаут.
  // Таймаут — предохранитель: залипший плагин не должен запирать юзера на мёртвой сессии.
  void Promise.race([
    clearCuSession().catch(() => {}),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, 1500)
    }),
  ]).then(() => {
    window.location.replace('/')
  })
}

export const getActiveToken = (): string | undefined => getBffToken() ?? undefined

/** Native builds talk to API by absolute URL; browser uses Vite `/api` proxy. */
const resolveApiUrl = (path: string): string => {
  if (/^https?:\/\//i.test(path)) return path
  if (isNative()) {
    const base = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
    if (!base) {
      throw new Error('VITE_API_BASE_URL не задан для нативного приложения')
    }
    return `${base}${path.startsWith('/') ? path : `/${path}`}`
  }
  if (typeof window !== 'undefined') {
    const normalized = path.startsWith('/') ? path : `/${path}`
    // Dev: Node-прокси обходит блокировщики /api/me и /api/admin/* в браузере.
    if (import.meta.env.DEV && normalized.startsWith('/api/')) {
      return new URL(`/__dev/api${normalized.slice(4)}`, window.location.origin).href
    }
    return new URL(normalized, window.location.origin).href
  }
  return path
}

const parseError = async (
  response: Response,
): Promise<{ message: string; code?: string; details?: Record<string, unknown> }> => {
  try {
    const data = (await response.json()) as ApiError & Record<string, unknown>
    return {
      message: data.error || response.statusText,
      code: typeof data.code === 'string' ? data.code : undefined,
      details: data && typeof data === 'object' ? data : undefined,
    }
  } catch {
    return { message: response.statusText }
  }
}

type ApiFetchOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | null
  /** Таймаут нативного запроса (по умолчанию 30 с) — для коротких фоновых проверок. */
  nativeTimeoutMs?: number
  /**
   * Сколько раз пробовать нативный запрос (по умолчанию 4). Стартовые гейты
   * ставят 2: 4 попытки по 30 с держат пользователя на пустом экране ~2 минуты,
   * а гейт обязан показать «нет связи» за 10–15 с.
   */
  nativeRetryAttempts?: number
}

const DEFAULT_NATIVE_RETRY_ATTEMPTS = 4

/** Повторять запрос можно только если он идемпотентен: иначе дубли постов/контактов/жалоб. */
const isIdempotentMethod = (method: string): boolean => method === 'GET' || method === 'HEAD'

/**
 * Соединение не установилось — тело до сервера не дошло, повтор безопасен и для мутаций.
 * iOS отдаёт localizedDescription NSURLError, Android — getLocalizedMessage() исключения
 * и его класс в `code`, поэтому смотрим и на текст, и на код.
 */
const CONNECT_ERROR_TEXT =
  /could not connect|cannot connect|failed to connect|connection refused|econnrefused|network is unreachable|no route to host|unable to resolve host|hostname could not be found|appears to be offline|-1003|-1004|-1009/i

/** Классы исключений Android, которые бросаются до отправки тела. */
const CONNECT_ERROR_CODE = /^(ConnectException|UnknownHostException|NoRouteToHostException)$/

const isConnectError = (err: unknown): boolean => {
  if (err == null) return false
  const { message, code } = err as { message?: unknown; code?: unknown }
  const text = typeof message === 'string' ? message : String(err)
  if (CONNECT_ERROR_TEXT.test(text)) return true
  return typeof code === 'string' && CONNECT_ERROR_CODE.test(code)
}

const headersToRecord = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key] = value
  })
  return out
}

/**
 * CapacitorHttp на iOS падает при параллельных запросах.
 * Все native API (включая FormData/fetch) идут через одну очередь.
 */
const NATIVE_HTTP_CONCURRENCY = 1
let nativeHttpActive = 0
const nativeHttpWaiters: Array<() => void> = []

const acquireNativeHttpSlot = (): Promise<void> => {
  if (nativeHttpActive < NATIVE_HTTP_CONCURRENCY) {
    nativeHttpActive += 1
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    nativeHttpWaiters.push(() => {
      nativeHttpActive += 1
      resolve()
    })
  })
}

const releaseNativeHttpSlot = (): void => {
  nativeHttpActive = Math.max(0, nativeHttpActive - 1)
  const next = nativeHttpWaiters.shift()
  if (next) next()
}

const abortError = (): Error => {
  const err = new Error('Запрос отменён')
  err.name = 'AbortError'
  return err
}

/**
 * Очередь одна на всё приложение, поэтому брошенный запрос обязан освобождать слот:
 * иначе отменённая проверка логина держит очередь и тормозит getMe после входа.
 */
const enqueueNativeHttp = async <T>(
  task: () => Promise<T>,
  signal?: AbortSignal | null,
): Promise<T> => {
  if (signal?.aborted) throw abortError()
  await acquireNativeHttpSlot()
  try {
    if (signal?.aborted) throw abortError()
    return await task()
  } finally {
    releaseNativeHttpSlot()
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

const applyAuthHeaders = (headers: Headers, token: string): void => {
  // Browser → Vite proxy reads X-Bff-Cookie and injects Cookie upstream.
  // Native → X-Bff-Cookie надёжен (бэк читает его); Cookie часто strip'ается платформой.
  headers.set(BFF_COOKIE_HEADER, token)
  if (isNative()) {
    headers.set('Cookie', `bff.cookie=${token}`)
  }
}

const applyAdminSessionHeaders = (headers: Headers, token: string): void => {
  headers.set(ADMIN_SESSION_HEADER, token)
  if (isNative()) {
    headers.set('Cookie', `admin.session=${token}`)
  }
}

const nullBodyStatuses = new Set([204, 205, 304])

const responseFromNative = (native: {
  status: number
  data: unknown
  headers: Record<string, string>
}): Response => {
  const body =
    typeof native.data === 'string'
      ? native.data
      : native.data == null
        ? ''
        : JSON.stringify(native.data)

  return new Response(nullBodyStatuses.has(native.status) ? null : body, {
    status: native.status,
    headers: native.headers as HeadersInit,
  })
}

const buildNativeData = (
  method: string,
  body: BodyInit | null | undefined,
  contentType: string,
): string | Record<string, unknown> | undefined => {
  if (method === 'GET' || method === 'HEAD' || body == null) return undefined

  if (typeof body === 'string') {
    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(body) as Record<string, unknown>
      } catch {
        return body
      }
    }
    return body
  }

  return String(body)
}

/** CapacitorHttp.request → при сбое патченый fetch (CapacitorHttp.enabled). */
const nativeHttpOnce = async (
  url: string,
  method: string,
  headersRecord: Record<string, string>,
  data: string | Record<string, unknown> | undefined,
  init: ApiFetchOptions,
): Promise<Response> => {
  const timeout = init.nativeTimeoutMs ?? 30_000
  try {
    const payload: Parameters<typeof CapacitorHttp.request>[0] = {
      url,
      method,
      headers: headersRecord,
      responseType: 'text',
      connectTimeout: timeout,
      readTimeout: timeout,
    }
    if (data !== undefined) {
      payload.data = data
    }
    return responseFromNative(await CapacitorHttp.request(payload))
  } catch (capacitorErr) {
    // Fallback: с enabled:true fetch тоже идёт через native stack.
    // Для мутаций — только когда соединения не было: иначе тело уйдёт на сервер дважды.
    if (!isIdempotentMethod(method) && !isConnectError(capacitorErr)) {
      throw capacitorErr
    }
    try {
      const headers = new Headers(headersRecord)
      const fetchInit: RequestInit = {
        method,
        headers,
      }
      // Без signal фолбэк неотменяем и без таймаута: отменённая проверка логина
      // держала бы единственный слот нативной очереди дольше своих 4 с.
      if (init.signal) fetchInit.signal = init.signal
      if (data !== undefined && method !== 'GET' && method !== 'HEAD') {
        fetchInit.body = typeof data === 'string' ? data : JSON.stringify(data)
      } else if (init.body != null && !(init.body instanceof FormData)) {
        fetchInit.body = init.body
      }
      return await fetch(url, fetchInit)
    } catch {
      throw capacitorErr
    }
  }
}

const nativeHttpWithRetries = async (
  url: string,
  method: string,
  headersRecord: Record<string, string>,
  data: string | Record<string, unknown> | undefined,
  init: ApiFetchOptions,
): Promise<Response> => {
  const retryable = isIdempotentMethod(method)
  const attempts = Math.max(1, init.nativeRetryAttempts ?? DEFAULT_NATIVE_RETRY_ATTEMPTS)
  let lastErr: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (init.signal?.aborted) throw abortError()
    try {
      return await nativeHttpOnce(url, method, headersRecord, data, init)
    } catch (err) {
      lastErr = err
      // POST/PUT/DELETE повторяем только при сбое соединения — иначе плодим дубли.
      if (!retryable && !isConnectError(err)) break
      if (init.signal?.aborted) throw abortError()
      await sleep(100 + attempt * 200)
    }
  }
  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr)
  throw new Error(`Network request failed (native ${method} ${url}): ${detail}`)
}

const nativeFormDataWithRetries = async (url: string, init: ApiFetchOptions): Promise<Response> => {
  const formData = init.body
  if (!(formData instanceof FormData)) {
    throw new Error('nativeFormDataWithRetries: expected FormData')
  }

  const headers = new Headers(init.headers)
  // Не задаём Content-Type вручную для binary FormData — boundary выставит runtime.
  // Для string-only multipart задаём сами ниже.

  let onlyStrings = true
  const stringEntries: Array<[string, string]> = []
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      stringEntries.push([key, value])
    } else {
      onlyStrings = false
    }
  })

  const method = (init.method ?? 'POST').toString().toUpperCase()
  const retryable = isIdempotentMethod(method)
  const attempts = Math.max(1, init.nativeRetryAttempts ?? DEFAULT_NATIVE_RETRY_ATTEMPTS)

  let lastErr: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (init.signal?.aborted) throw abortError()
    try {
      // String-only multipart (updateMe без фото и т.п.) — через CapacitorHttp.request
      if (onlyStrings) {
        const boundary = `----faculty${Date.now().toString(16)}${attempt}`
        let body = ''
        for (const [key, value] of stringEntries) {
          body += `--${boundary}\r\n`
          body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`
          body += `${value}\r\n`
        }
        body += `--${boundary}--\r\n`

        const headersRecord = headersToRecord(headers)
        headersRecord['Content-Type'] = `multipart/form-data; boundary=${boundary}`
        return await nativeHttpOnce(url, method, headersRecord, body, { ...init, body: undefined })
      }

      // С файлами — патченый fetch + ретраи
      return await fetch(url, { ...init, headers })
    } catch (err) {
      lastErr = err
      // Тот же запрет на слепые ретраи мутаций, что и в nativeHttpWithRetries.
      if (!retryable && !isConnectError(err)) break
      if (init.signal?.aborted) throw abortError()
      await sleep(120 + attempt * 220)
    }
  }
  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr)
  throw new Error(`Network request failed (native ${method} ${url}): ${detail}`)
}

export const apiFetch = async (path: string, options: ApiFetchOptions = {}): Promise<Response> => {
  const bffToken = getBffToken()
  const adminToken = getAdminSession()
  const headers = new Headers(options.headers)
  const url = resolveApiUrl(path)

  // dev-proxy-bff — только маркер; куку подставляет Vite proxy из VITE_BFF (.env).
  if (isRealBffToken(bffToken)) {
    applyAuthHeaders(headers, bffToken)
  } else if (adminToken) {
    applyAdminSessionHeaders(headers, adminToken)
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  // Multipart: CapacitorHttp.request не умеет FormData — патченый fetch + очередь.
  if (options.body instanceof FormData) {
    if (isNative()) {
      return enqueueNativeHttp(
        () =>
          nativeFormDataWithRetries(url, {
            ...options,
            headers,
          }),
        options.signal,
      )
    }
    return fetch(url, {
      ...options,
      headers,
    })
  }

  if (isNative()) {
    const method = (options.method ?? 'GET').toUpperCase()
    const contentType = headers.get('Content-Type') ?? ''
    const data = buildNativeData(method, options.body, contentType)
    const headersRecord = headersToRecord(headers)

    if (method === 'GET' || method === 'HEAD') {
      delete headersRecord['Content-Type']
      delete headersRecord['content-type']
    }

    return enqueueNativeHttp(
      () => nativeHttpWithRetries(url, method, headersRecord, data, options),
      options.signal,
    )
  }

  return fetch(url, {
    ...options,
    headers,
  })
}

export const apiFetchJson = async <T>(path: string, options: ApiFetchOptions = {}): Promise<T> => {
  const response = await apiFetch(path, options)

  if (!response.ok) {
    const isAdminAuth =
      path.includes('/api/admin/login') || path.includes('/__dev/api/admin/login')
    if (response.status === 401 && !isAdminAuth) {
      handleUnauthorized()
    }
    const { message, code, details } = await parseError(response)
    throw new ApiRequestError(message, response.status, code, details)
  }

  // 202/204 often have empty or non-JSON bodies (Fiber SendStatus → "Accepted")
  if (response.status === 204 || response.status === 202) {
    return undefined as T
  }

  const text = await response.text()
  if (!text || text === 'null') {
    return null as T
  }

  try {
    return JSON.parse(text) as T
  } catch {
    if (response.ok) {
      return undefined as T
    }
    throw new ApiRequestError(text || response.statusText, response.status)
  }
}
