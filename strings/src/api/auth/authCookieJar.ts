export const TARGET_COOKIE_NAME = 'bff.cookie'

export const CU_ID_ORIGIN = 'https://id.centraluniversity.ru'
export const CU_MY_ORIGIN = 'https://my.centraluniversity.ru'

export const AUTH_OIDC_PATH =
  '/realms/central-university/protocol/openid-connect/auth' +
  '?response_type=code&client_id=api-gateway' +
  '&scope=openid+email+offline_access' +
  '&redirect_uri=https://my.centraluniversity.ru/api/account/signin/callback'

/** Absolute OIDC URL (native CapacitorHttp). */
export const AUTH_OIDC_URL_ABSOLUTE = `${CU_ID_ORIGIN}${AUTH_OIDC_PATH}`

/** Same-origin Vite proxy URL for browser `npm run dev`. */
export const AUTH_OIDC_URL_PROXY = `/cu-id${AUTH_OIDC_PATH}`

type StoredCookie = {
  name: string
  value: string
  domain?: string
  path: string
  secure: boolean
  expires?: number
}

/**
 * In-memory cookie jar for the Keycloak auth session.
 * Cleared between login attempts via {@link AuthCookieJar.reset}.
 */
export class AuthCookieJar {
  private cookies: StoredCookie[] = []

  reset(): void {
    this.cookies = []
  }

  getCookieHeader(_url: string): string {
    const now = Date.now()
    return this.cookies
      .filter((cookie) => cookie.expires === undefined || cookie.expires >= now)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ')
  }

  absorbSetCookieHeader(header: string | null, requestUrl: string): void {
    if (!header) return
    const request = new URL(requestUrl, typeof window !== 'undefined' ? window.location.origin : CU_ID_ORIGIN)
    for (const line of decodeBridgedSetCookies(header)) {
      this.addFromSetCookie(line, request)
    }
  }

  absorbSetCookieLines(lines: string[], requestUrl: string): void {
    const request = new URL(requestUrl, CU_ID_ORIGIN)
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed) this.addFromSetCookie(trimmed, request)
    }
  }

  getAllSetCookieLines(): string[] {
    return this.cookies.map((c) => `${c.name}=${c.value}`)
  }

  findCookie(name: string): string | null {
    const now = Date.now()
    const found = this.cookies.find(
      (c) => c.name === name && (c.expires === undefined || c.expires >= now),
    )
    return found?.value ?? null
  }

  private addFromSetCookie(setCookie: string, requestUrl: URL): void {
    const parts = setCookie.split(';').map((p) => p.trim())
    const [nameValue, ...attrs] = parts
    if (!nameValue) return

    const eq = nameValue.indexOf('=')
    if (eq <= 0) return

    const name = nameValue.slice(0, eq).trim()
    const value = nameValue.slice(eq + 1).trim()

    let domain: string | undefined
    let path = '/'
    let secure = false
    let expires: number | undefined
    let maxAge: number | undefined

    for (const attr of attrs) {
      const [rawKey, ...rest] = attr.split('=')
      const key = rawKey?.trim().toLowerCase()
      const attrValue = rest.join('=').trim()
      if (!key) continue

      if (key === 'domain') domain = attrValue.toLowerCase()
      else if (key === 'path') path = attrValue || '/'
      else if (key === 'secure') secure = true
      else if (key === 'expires') {
        const ts = Date.parse(attrValue)
        if (!Number.isNaN(ts)) expires = ts
      } else if (key === 'max-age') {
        const seconds = Number(attrValue)
        if (!Number.isNaN(seconds)) maxAge = seconds
      }
    }

    if (maxAge !== undefined) {
      expires = Date.now() + maxAge * 1000
    }

    if (expires !== undefined && expires < Date.now()) {
      this.cookies = this.cookies.filter(
        (c) => !(c.name === name && c.domain === (domain ?? requestUrl.hostname) && c.path === path),
      )
      return
    }

    const resolvedDomain = domain ?? requestUrl.hostname.toLowerCase()
    this.cookies = this.cookies.filter(
      (c) => !(c.name === name && c.domain === resolvedDomain && c.path === path),
    )
    this.cookies.push({
      name,
      value,
      domain: resolvedDomain,
      path,
      secure,
      expires,
    })
  }
}

export const authCookieJar = new AuthCookieJar()

/** Decode `X-Set-Cookie` from the Vite cookie bridge (base64 JSON string[]). */
export const decodeBridgedSetCookies = (header: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(atob(header))
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
  } catch {
    return []
  }
}
