import { Capacitor } from '@capacitor/core'
import { Camera, type CameraPermissionType, type PermissionStatus } from '@capacitor/camera'

export type MediaPermissionKind = 'camera' | 'photos'

/**
 * granted — доступ есть (сюда же iOS-режим «выбранные фото»: limited).
 * denied  — отказ или запрет родительским контролем. Системный диалог больше
 *           не покажется: помочь может только экран настроек приложения.
 * unknown — не native, плагин не ответил или упал. Решение остаётся за
 *           getUserMedia / системным пикером — трактуем как «пробуем дальше».
 *
 * iOS-маппинг Capacitor (node_modules/@capacitor/camera/ios/Sources/CameraPlugin/
 * CameraExtensions.swift): denied/restricted → 'denied', authorized → 'granted',
 * limited → 'limited', notDetermined → 'prompt'.
 */
export type MediaPermissionState = 'granted' | 'denied' | 'unknown'

const IOS_APP_SETTINGS_URL = 'app-settings:'

const toState = (raw: PermissionStatus['camera'] | PermissionStatus['photos']): MediaPermissionState => {
  if (raw === 'granted' || raw === 'limited') return 'granted'
  if (raw === 'denied') return 'denied'
  // 'prompt' / 'prompt-with-rationale' — диалог ещё впереди
  return 'unknown'
}

const isNativePlatform = (): boolean => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

const getPlatform = (): string => {
  try {
    return Capacitor.getPlatform()
  } catch {
    return 'web'
  }
}

/** Проверка без системного диалога — например, после возврата из Настроек. */
export const checkMediaPermission = async (
  kind: MediaPermissionKind,
): Promise<MediaPermissionState> => {
  if (!isNativePlatform()) return 'unknown'
  try {
    const status = await Camera.checkPermissions()
    return toState(status[kind])
  } catch {
    return 'unknown'
  }
}

/**
 * Проверяет доступ и, если система ещё не спрашивала, показывает диалог.
 * Повторный requestPermissions после отказа диалог НЕ показывает — iOS сразу
 * возвращает denied, поэтому 'denied' обязан приводить к экрану с Настройками.
 */
export const requestMediaPermission = async (
  kind: MediaPermissionKind,
): Promise<MediaPermissionState> => {
  if (!isNativePlatform()) return 'unknown'

  const permissions: CameraPermissionType[] = [kind]

  try {
    const current = await Camera.checkPermissions()
    const state = toState(current[kind])
    if (state !== 'unknown') return state

    const granted = await Camera.requestPermissions({ permissions })
    return toState(granted[kind])
  } catch {
    return 'unknown'
  }
}

/**
 * Можно ли увести пользователя в системные настройки приложения.
 *
 * Только iOS. В @capacitor/app@8.1.1 метода openUrl НЕТ — проверено по
 * node_modules/@capacitor/app/dist/esm/definitions.d.ts (интерфейс AppPlugin) и
 * node_modules/@capacitor/app/ios/Sources/AppPlugin/AppPlugin.swift (в
 * pluginMethods только exitApp, getInfo, getAppLanguage, getLaunchUrl, getState,
 * minimizeApp, toggleBackButtonHandler). Он существовал в Capacitor 2 и был
 * удалён; отдельного плагина «открыть настройки» в проекте нет.
 *
 * На Android экран настроек приложения открывается интентом
 * ACTION_APPLICATION_DETAILS_SETTINGS с data `package:<id>`, а мост Capacitor
 * умеет только ACTION_VIEW (Bridge.launchIntent) — такой URL никто не обработает,
 * поэтому кнопку там не показываем и ограничиваемся текстом.
 */
export const canOpenAppSettings = (): boolean => getPlatform() === 'ios'

/**
 * Открывает страницу приложения в Настройках iOS.
 *
 * Переход верхнего уровня на «чужую» схему WKWebView отдаёт в
 * WebViewDelegationHandler.decidePolicyFor: тот отменяет навигацию и вызывает
 * UIApplication.shared.open(url)
 * (node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift:111).
 * `app-settings:` — это UIApplication.openSettingsURLString.
 *
 * @returns false, если платформа не поддерживается (кнопку показывать не надо)
 */
export const openAppSettings = (): boolean => {
  if (!canOpenAppSettings()) return false
  try {
    window.location.href = IOS_APP_SETTINGS_URL
    return true
  } catch {
    return false
  }
}

/**
 * Отказ в доступе, прилетевший не из плагина, а из getUserMedia — так ведёт себя
 * браузер и html5-qrcode (ошибку он прокидывает как есть, иногда строкой).
 */
export const isPermissionDeniedError = (err: unknown): boolean => {
  const name =
    typeof err === 'object' && err !== null && 'name' in err
      ? String((err as { name?: unknown }).name)
      : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return true
  }

  const text = typeof err === 'string' ? err : err instanceof Error ? err.message : ''
  return /notallowed|permissiondenied|permission denied/i.test(text)
}
