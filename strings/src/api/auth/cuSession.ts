import { Capacitor, CapacitorCookies } from '@capacitor/core'
import { InAppBrowser } from '@capgo/capacitor-inappbrowser'
import { authCookieJar, CU_ID_ORIGIN, CU_MY_ORIGIN, TARGET_COOKIE_NAME } from './authCookieJar'

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** Origin'ы, где живёт сессия ЦУ: bff.cookie на my.* и куки Keycloak на id.*. */
const CU_SESSION_URLS = [CU_MY_ORIGIN, `${CU_MY_ORIGIN}/`, CU_ID_ORIGIN, `${CU_ID_ORIGIN}/`]

/**
 * Гасит сессию ЦУ: in-memory jar + нативный cookie-store (URLSession) + стор webview
 * InAppBrowser. Без этого после «Выйти» bff.cookie переживает логаут, и следующий
 * вход молча продолжает старый аккаунт (или крутит цикл логина на протухшей куке).
 */
export const clearCuSession = async (): Promise<void> => {
  authCookieJar.reset()
  if (!isNative()) return

  for (const url of CU_SESSION_URLS) {
    try {
      await CapacitorCookies.deleteCookie({ url, key: TARGET_COOKIE_NAME })
    } catch {
      // Best-effort — ниже пробуем снести все куки origin'а целиком.
    }
    try {
      await CapacitorCookies.clearCookies({ url })
    } catch {
      // ignore
    }
  }

  try {
    // Куки webview'а ЦУ живут в приватном сторе плагина (persistWebViewData: true).
    await InAppBrowser.clearAllBrowsingData()
  } catch {
    // ignore — плагин мог не поддержать метод на этой платформе
  }
}

/** Убрать только bff.cookie ЦУ перед обменом кода: BFF обязан выдать новую сессию. */
export const clearStoredBffCookie = async (): Promise<void> => {
  if (!isNative()) return
  for (const url of CU_SESSION_URLS) {
    try {
      await CapacitorCookies.deleteCookie({ url, key: TARGET_COOKIE_NAME })
    } catch {
      // ignore
    }
  }
}
