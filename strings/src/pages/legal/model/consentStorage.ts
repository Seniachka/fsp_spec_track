import type { UserProfile } from '../../../api/types'
import { LEGAL_REVISION } from './legalVersion'

/**
 * Локальная память о согласии — страховка для старого бэкенда без
 * POST /api/me/consent: без неё «Формальности» показывались бы при каждом входе.
 * Ключ пер-аккаунтный: он в USER_SCOPED_KEYS (shared/lib/userScopedStorage),
 * поэтому смена владельца стораджа вычищает его вместе с остальными данными.
 * Внутри всё равно храним id владельца — на случай, если запись в OWNER_KEY
 * не прошла (приватный режим, квоты) и чистка не сработала.
 */
const CONSENT_KEY = 'faculty.consentAccepted'

type StoredConsent = {
  userId: string
  revision: string
}

export const isConsentRememberedLocally = (userId: string): boolean => {
  if (!userId) return false
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as StoredConsent | null
    return parsed?.userId === userId && parsed?.revision === LEGAL_REVISION
  } catch {
    return false
  }
}

type ConsentState = Pick<UserProfile, 'id' | 'consentedAt' | 'termsVersion' | 'privacyVersion'>

/**
 * Согласие на сервере есть И относится к текущей редакции документов.
 * Подпись под прошлой редакцией (или бэкенд, который версии не отдаёт) —
 * это «согласия под этой редакцией нет»: документы надо принять заново.
 */
export const isServerConsentCurrent = (user: ConsentState): boolean =>
  Boolean(user.consentedAt) &&
  user.termsVersion === LEGAL_REVISION &&
  user.privacyVersion === LEGAL_REVISION

/**
 * Согласие под текущей редакцией не зафиксировано ни на сервере, ни локально —
 * надо показать «Формальности». Локальная отметка страхует бэкенд без
 * /api/me/consent и бэкенд, который не возвращает версии: без неё шторка
 * вылезала бы при каждом запуске.
 */
export const needsConsent = (user: ConsentState): boolean =>
  !isServerConsentCurrent(user) && !isConsentRememberedLocally(user.id)

export const rememberConsentLocally = (userId: string): void => {
  if (!userId) return
  try {
    const value: StoredConsent = { userId, revision: LEGAL_REVISION }
    localStorage.setItem(CONSENT_KEY, JSON.stringify(value))
  } catch {
    // приватный режим/квоты — переживём, шторка просто покажется ещё раз
  }
}
