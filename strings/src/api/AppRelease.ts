import { Capacitor } from '@capacitor/core'
import { apiFetch } from './client'

/** Версия, зашитая в сборку из VERSION в .env. Пустая строка — сравнивать не с чем. */
export const APP_VERSION = String(import.meta.env.VERSION ?? '').trim()

export type AppRelease = {
  version: string
  iosUrl: string | null
  androidUrl: string | null
}

const asHttpUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * GET /api/app/version — публичный, без авторизации.
 * Любой не-200, обрыв или кривое тело считаем «сервер молчит»: приложение
 * не блокируем, иначе выкладка клиента раньше эндпоинта закроет всем вход.
 * apiFetchJson здесь нельзя: 401 там ещё и разлогинивает.
 */
export const fetchAppRelease = async (): Promise<AppRelease | null> => {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 8_000)
  try {
    const headers = new Headers()
    if (APP_VERSION) headers.set('X-App-Version', APP_VERSION)
    headers.set('X-App-Platform', Capacitor.getPlatform())

    const response = await apiFetch('/api/app/version', {
      method: 'GET',
      headers,
      signal: controller.signal,
      nativeTimeoutMs: 8_000,
      nativeRetryAttempts: 2,
    })
    if (!response.ok) return null

    const data = (await response.json()) as Record<string, unknown>
    const version = typeof data.version === 'string' ? data.version.trim() : ''
    if (!version) return null

    return {
      version,
      iosUrl: asHttpUrl(data.iosUrl),
      androidUrl: asHttpUrl(data.androidUrl),
    }
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}
