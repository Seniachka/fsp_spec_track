import { ApiRequestError, apiFetchJson, clearLocalAuth, setAdminSession } from './client'
import { clearCuSession } from './auth/cuSession'

/** Опции запроса, которые пробрасываем наружу (отмена + короткий нативный таймаут). */
type RequestInitLike = {
  signal?: AbortSignal | null
  nativeTimeoutMs?: number
}

/**
 * Результат проверки логина. 'error' обязателен отдельным значением: раньше
 * любой сбой сети превращался в «обычный логин», и пароль тестового аккаунта
 * уходил в Keycloak ЦУ, а пользователь видел «неверный пароль» вместо «нет связи».
 */
export type AdminLoginProbe = 'admin' | 'not-admin' | 'error'

export type AdminLoginResponse = {
  token: string
  id: string
  firstName: string
  lastName: string
  role: string
}

export type CreateAdminPayload = {
  login: string
  password: string
  firstName: string
  lastName: string
  birthDate: string
}

export type CreateAdminResponse = {
  id: string
}

/** Старый бэкенд знает только GET с логином в query. */
const NO_SUCH_ROUTE = new Set([404, 405])

/**
 * Тестовый (админский) это логин или обычный. Принимает signal и nativeTimeoutMs:
 * экран входа отменяет проверку по своему таймауту, иначе брошенный запрос держит
 * единственный слот нативной HTTP-очереди и тормозит getMe после входа.
 *
 * Основной путь — POST с логином в теле (логин не светится в URL и логах прокси),
 * один фолбэк на старый GET, если маршрута нет. Ретраи и общий бюджет попыток —
 * на вызывающем: тут одна попытка на каждый транспорт.
 */
export const checkAdminLogin = async (
  login: string,
  init?: RequestInitLike,
): Promise<AdminLoginProbe> => {
  const trimmed = login.trim()
  if (!trimmed) return 'not-admin'

  const request = {
    signal: init?.signal,
    nativeTimeoutMs: init?.nativeTimeoutMs,
    nativeRetryAttempts: 1,
  }

  try {
    const data = await apiFetchJson<{ isAdmin: boolean }>('/api/admin/logins/check', {
      ...request,
      method: 'POST',
      body: JSON.stringify({ login: trimmed }),
    })
    return data?.isAdmin ? 'admin' : 'not-admin'
  } catch (err) {
    if (!(err instanceof ApiRequestError) || !NO_SUCH_ROUTE.has(err.status)) {
      return 'error'
    }
  }

  try {
    const data = await apiFetchJson<{ isAdmin: boolean }>(
      `/api/admin/logins/check?login=${encodeURIComponent(trimmed)}`,
      request,
    )
    return data?.isAdmin ? 'admin' : 'not-admin'
  } catch {
    return 'error'
  }
}

export const adminLogin = async (login: string, password: string): Promise<AdminLoginResponse> => {
  // Только локальный сброс: заголовки прошлой сессии не должны уехать в админ-логин,
  // но неверный пароль не обязан стирать данные браузера и сессию ЦУ.
  clearLocalAuth()
  const result = await apiFetchJson<AdminLoginResponse>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ login: login.trim(), password }),
  })
  if (!result?.token) {
    throw new Error('Не удалось получить сессию администратора')
  }
  setAdminSession(result.token)
  // Вход прошёл — это смена аккаунта: гасим сессию ЦУ, иначе следующий вход
  // через ЦУ молча продолжит прошлый аккаунт с этого устройства.
  void clearCuSession()
  return result
}

export const adminLogout = async (): Promise<void> => {
  try {
    await apiFetchJson<void>('/api/admin/logout', { method: 'POST' })
  } catch {
    // ignore — local session is cleared anyway
  }
}

export const createAdminUser = async (payload: CreateAdminPayload): Promise<CreateAdminResponse> =>
  apiFetchJson<CreateAdminResponse>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
