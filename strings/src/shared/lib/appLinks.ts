const RETURN_PATH_KEY = 'faculty.returnPath'

/** Пути приложения, куда можно безопасно вернуть после логина */
export const isSafeAppPath = (path: string): boolean => {
  if (!path.startsWith('/') || path.startsWith('//')) return false
  if (path === '/' || path.startsWith('/onboarding/auth')) return false
  if (path.startsWith('/legal/')) return false
  // Поддержка — такая же публичная страница: возвращать в неё после логина незачем.
  if (path === '/support' || path.startsWith('/support/')) return false
  return true
}

export const saveReturnPath = (path: string): void => {
  if (!isSafeAppPath(path)) return
  try {
    sessionStorage.setItem(RETURN_PATH_KEY, path)
  } catch {
    // ignore
  }
}

/** Прочитать и очистить сохранённый deep link */
export const consumeReturnPath = (): string | null => {
  try {
    const value = sessionStorage.getItem(RETURN_PATH_KEY)
    sessionStorage.removeItem(RETURN_PATH_KEY)
    if (!value || !isSafeAppPath(value)) return null
    return value
  } catch {
    return null
  }
}

export const absoluteAppUrl = (path: string): string => {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : ({} as Record<string, string>)
  const configured =
    String(env.VITE_APP_PUBLIC_URL || '').trim() || String(env.VITE_API_BASE_URL || '').trim()
  // В нативном Capacitor window.location.origin — это capacitor://localhost,
  // такую ссылку нельзя расшарить; origin из window берём только для http(s).
  const origin =
    configured.replace(/\/$/, '') ||
    (typeof window !== 'undefined' && window.location.protocol.startsWith('http')
      ? window.location.origin
      : 'https://niti-uni.ru')
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${origin}${normalized}`
}

export const profilePath = (userId: string): string => `/profile/${encodeURIComponent(userId)}`
export const eventPath = (eventId: string): string => `/afisha/events/${encodeURIComponent(eventId)}`
export const announcementPath = (id: string): string =>
  `/afisha/announcements/${encodeURIComponent(id)}`

export const profileUrl = (userId: string): string => absoluteAppUrl(profilePath(userId))
export const eventUrl = (eventId: string): string => absoluteAppUrl(eventPath(eventId))
export const announcementUrl = (id: string): string => absoluteAppUrl(announcementPath(id))

/** Куда вести после успешного входа (онбординг важнее deep link) */
export const resolvePostAuthPath = (onboardingDone: boolean): string => {
  if (!onboardingDone) return '/onboarding'
  return consumeReturnPath() ?? '/profile'
}
