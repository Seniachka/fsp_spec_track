import { Capacitor, CapacitorCookies, CapacitorHttp } from '@capacitor/core'
import {
  authCookieJar,
  CU_ID_ORIGIN,
  CU_MY_ORIGIN,
  decodeBridgedSetCookies,
  TARGET_COOKIE_NAME,
} from './authCookieJar'

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/**
 * Resolves auth URLs:
 * - native → absolute CU hosts (device IP, no CORS)
 * - browser → Vite `/cu-id` / `/cu-my` proxy
 */
export const toAuthRequestUrl = (url: string, baseUrl?: string): string => {
  const fallbackBase = isNative() ? CU_ID_ORIGIN : window.location.origin
  const resolvedBase = (() => {
    if (!baseUrl) return fallbackBase
    try {
      return new URL(baseUrl, fallbackBase).href
    } catch {
      return fallbackBase
    }
  })()

  let absolute: URL
  try {
    absolute = new URL(url, resolvedBase)
  } catch {
    absolute = new URL(url, fallbackBase)
  }

  if (isNative()) {
    if (
      absolute.hostname === 'id.centraluniversity.ru' ||
      absolute.hostname === 'my.centraluniversity.ru'
    ) {
      // CU hosts must stay HTTPS — Location sometimes comes back as http:// and ATS blocks it
      absolute.protocol = 'https:'
      return absolute.href
    }
    if (absolute.protocol === 'https:' || absolute.protocol === 'http:') {
      return absolute.href
    }
    return new URL(`${absolute.pathname}${absolute.search}${absolute.hash}`, CU_ID_ORIGIN).href
  }

  if (absolute.origin === CU_ID_ORIGIN || absolute.hostname === 'id.centraluniversity.ru') {
    return `/cu-id${absolute.pathname}${absolute.search}${absolute.hash}`
  }

  if (absolute.origin === CU_MY_ORIGIN || absolute.hostname === 'my.centraluniversity.ru') {
    return `/cu-my${absolute.pathname}${absolute.search}${absolute.hash}`
  }

  if (absolute.pathname.startsWith('/cu-id') || absolute.pathname.startsWith('/cu-my')) {
    return `${absolute.pathname}${absolute.search}${absolute.hash}`
  }

  if (baseUrl) {
    try {
      const base = new URL(baseUrl, window.location.origin)
      if (base.pathname.startsWith('/cu-id')) {
        return `/cu-id${absolute.pathname}${absolute.search}${absolute.hash}`
      }
      if (base.pathname.startsWith('/cu-my')) {
        return `/cu-my${absolute.pathname}${absolute.search}${absolute.hash}`
      }
    } catch {
      // fall through
    }
  }

  return absolute.pathname.startsWith('/')
    ? `${absolute.pathname}${absolute.search}${absolute.hash}`
    : absolute.toString()
}

export type AuthFetchResult = {
  status: number
  location: string | null
  bodyText: string
  setCookieHeader: string | null
  url: string
  finalUrl: string
}

const normalizeHeaderMap = (
  headers: HeadersInit | Record<string, string> | undefined,
): Record<string, string> => {
  const out: Record<string, string> = {}
  if (!headers) return out
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value
    })
    return out
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value
    return out
  }
  return { ...headers }
}

const collectSetCookieLines = (headers: Record<string, string>): string[] => {
  const lines: string[] = []
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== 'set-cookie') continue
    if (value.includes('\n')) {
      lines.push(...value.split('\n').map((l) => l.trim()).filter(Boolean))
    } else {
      lines.push(value)
    }
  }
  return lines
}

const findHeader = (headers: Record<string, string>, name: string): string | null => {
  const target = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && value) return value
  }
  return null
}

/** Read cookies from native store into JS jar (for bff.cookie extraction only). */
const pullNativeCookiesIntoJar = async (url: string): Promise<void> => {
  try {
    const stored = await CapacitorCookies.getCookies({ url })
    const lines = Object.entries(stored).map(([name, value]) => {
      // Capacitor sometimes returns values wrapped in extra quotes
      const cleaned = value.replace(/^"+|"+$/g, '')
      return `${name}=${cleaned}`
    })
    if (lines.length) authCookieJar.absorbSetCookieLines(lines, url)
  } catch {
    // ignore
  }
}

const prepareNativeFormData = (
  headers: Record<string, string>,
  body: BodyInit | null | undefined,
): { data?: string; headers: Record<string, string> } => {
  const nextHeaders = { ...headers }
  // Never override URLSession cookies with a partial Cookie header
  delete nextHeaders.Cookie
  delete nextHeaders.cookie

  const contentType = nextHeaders['Content-Type'] ?? nextHeaders['content-type'] ?? ''

  if (typeof body === 'string') {
    if (!contentType) {
      nextHeaders['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
    } else if (!/charset=/i.test(contentType)) {
      nextHeaders['Content-Type'] = `${contentType}; charset=UTF-8`
    }
    return { data: body, headers: nextHeaders }
  }

  if (body instanceof URLSearchParams) {
    nextHeaders['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
    return { data: body.toString(), headers: nextHeaders }
  }

  return { headers: nextHeaders }
}

const nativeAuthFetch = async (
  url: string,
  init: RequestInit = {},
): Promise<AuthFetchResult> => {
  const method = (init.method ?? 'GET').toUpperCase()
  const prepared = prepareNativeFormData(normalizeHeaderMap(init.headers), init.body)

  const response = await CapacitorHttp.request({
    url,
    method,
    headers: prepared.headers,
    data: prepared.data,
    responseType: 'text',
    // Critical for Keycloak: intercept 302 like cu-mobile
    disableRedirects: true,
    connectTimeout: 30_000,
    readTimeout: 30_000,
  })

  const responseHeaders: Record<string, string> = {}
  for (const [key, value] of Object.entries(response.headers ?? {})) {
    responseHeaders[key] = Array.isArray(value) ? value.join('\n') : String(value)
  }

  const setCookieLines = collectSetCookieLines(responseHeaders)
  authCookieJar.absorbSetCookieLines(setCookieLines, response.url || url)

  // Pull whatever the native cookie store has (HttpOnly etc.) for bff extraction later
  await pullNativeCookiesIntoJar(response.url || url)
  await pullNativeCookiesIntoJar(CU_ID_ORIGIN)
  await pullNativeCookiesIntoJar(CU_MY_ORIGIN)

  const location = findHeader(responseHeaders, 'location')

  const bodyText =
    typeof response.data === 'string'
      ? response.data
      : response.data == null
        ? ''
        : typeof response.data === 'object'
          ? JSON.stringify(response.data)
          : String(response.data)

  return {
    status: response.status,
    location,
    bodyText,
    setCookieHeader: setCookieLines.length ? btoa(JSON.stringify(setCookieLines)) : null,
    url,
    finalUrl: response.url || url,
  }
}

const webAuthFetch = async (
  url: string,
  init: RequestInit = {},
): Promise<AuthFetchResult> => {
  const headers = new Headers(init.headers)

  const cookieHeader = authCookieJar.getCookieHeader(url)
  if (cookieHeader) {
    headers.set('X-Cookie', cookieHeader)
  }
  // Tell Vite CU proxy to use programmatic mode (3xx → X-Redirect-*), not browser redirects.
  headers.set('X-Auth-Fetch', '1')

  const response = await fetch(url, {
    ...init,
    headers,
    redirect: 'manual',
    credentials: 'omit',
  })

  const setCookieHeader = response.headers.get('X-Set-Cookie')
  authCookieJar.absorbSetCookieHeader(setCookieHeader, url)

  const bridgedLocation = response.headers.get('X-Redirect-Location')
  const bridgedStatus = response.headers.get('X-Redirect-Status')
  const location = bridgedLocation ?? response.headers.get('Location')

  const status = bridgedLocation ? Number(bridgedStatus) || 302 : response.status

  const isRedirect =
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308 ||
    Boolean(bridgedLocation)

  const bodyText = isRedirect || response.status === 204 ? '' : await response.text()

  return {
    status: isRedirect ? status : response.status,
    location,
    bodyText,
    setCookieHeader,
    url,
    finalUrl: response.url || url,
  }
}

/**
 * Auth HTTP: CapacitorHttp on native (device IP), Vite proxy fetch in browser.
 */
export const authFetch = async (
  inputUrl: string,
  init: RequestInit = {},
): Promise<AuthFetchResult> => {
  const url = toAuthRequestUrl(inputUrl)
  if (isNative()) {
    return nativeAuthFetch(url, init)
  }
  return webAuthFetch(url, init)
}

export const extractBffFromAuthResult = (result: AuthFetchResult): string | null => {
  const fromJar = authCookieJar.findCookie(TARGET_COOKIE_NAME)
  if (fromJar) return fromJar

  if (result.setCookieHeader) {
    try {
      for (const line of decodeBridgedSetCookies(result.setCookieHeader)) {
        const match = line.match(/(?:^|,\s*)bff\.cookie=([^;]+)/i)
        if (match?.[1]) return match[1].trim()
        if (line.toLowerCase().startsWith(`${TARGET_COOKIE_NAME}=`)) {
          return line.slice(TARGET_COOKIE_NAME.length + 1).split(';')[0]?.trim() ?? null
        }
      }
    } catch {
      // ignore decode errors
    }
  }

  return null
}

/** Explicitly read bff.cookie from the native cookie store (iOS/Android). */
export const readBffCookieFromNativeStore = async (): Promise<string | null> => {
  if (!isNative()) return authCookieJar.findCookie(TARGET_COOKIE_NAME)

  const urls = [
    CU_MY_ORIGIN,
    `${CU_MY_ORIGIN}/`,
    `${CU_MY_ORIGIN}/api`,
    `${CU_MY_ORIGIN}/api/account/signin/callback`,
    `${CU_MY_ORIGIN}/api/account`,
    CU_ID_ORIGIN,
    `${CU_ID_ORIGIN}/`,
  ]

  for (const url of urls) {
    try {
      const stored = await CapacitorCookies.getCookies({ url })
      for (const [name, value] of Object.entries(stored)) {
        if (name.toLowerCase() === TARGET_COOKIE_NAME || name.toLowerCase() === 'bff_cookie') {
          const cleaned = String(value).replace(/^"+|"+$/g, '').trim()
          if (cleaned) return cleaned
        }
      }
    } catch {
      // continue
    }
  }

  await pullNativeCookiesIntoJar(CU_MY_ORIGIN)
  await pullNativeCookiesIntoJar(CU_ID_ORIGIN)
  return authCookieJar.findCookie(TARGET_COOKIE_NAME)
}
