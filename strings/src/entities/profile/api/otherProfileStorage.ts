import { isAuthenticated } from '../../../api/client'
import type { UserProfile } from '../../../api/types'
import { getStorageOwnerId } from '../../../shared/lib/userScopedStorage'
import { sortEducationEntries } from '../lib/apiMappers'
import type { EducationEntry, Skill, SocialLink, WorkEntry } from '../model/types'

const STORAGE_KEY = 'other_profiles_v2'
/**
 * Ключ схемы v1. Старые сборки маппили соцсеть неизвестного типа в telegram
 * прямо на записи, и починить такую запись чтением уже нельзя — тип потерян.
 * Поэтому версию кэша поднимаем: v1 выбрасывается целиком при первом чтении
 * после обновления приложения, дальше кэш наполняется заново с сервера.
 */
const LEGACY_STORAGE_KEY = 'other_profiles'
const MAX_ENTRIES = 200

let legacyDropped = false

const dropLegacyStore = (): void => {
  if (legacyDropped) return
  legacyDropped = true
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // приватный режим/квоты — не страшно, старый ключ просто полежит мёртвым
  }
}

/**
 * Кому принадлежат сторы прямо сейчас (null — маркера ещё нет). Ключ владельца
 * знает только shared/lib/userScopedStorage — здесь его не дублируем.
 */
export const readStorageOwnerId = (): string | null => getStorageOwnerId()

/**
 * Фоновый запрос стартовал до выхода, а ответил уже после — писать его в кэш
 * нельзя, иначе данные прошлого аккаунта воскресают поверх вычищенных сторов.
 * Владельца снимаем перед запросом и сверяем перед записью.
 */
export const isSameStorageOwner = (ownerAtStart: string | null): boolean =>
  isAuthenticated() && readStorageOwnerId() === ownerAtStart

export type CachedOtherProfile = {
  user: UserProfile
  education: EducationEntry[]
  work: WorkEntry[]
  hardSkills: Skill[]
  softSkills: Skill[]
  socials: SocialLink[]
  isSaved: boolean
  isContact: boolean
  note: string
  cachedAt: number
}

type Store = Record<string, CachedOtherProfile>

const readStore = (): Store => {
  dropLegacyStore()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Store
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const writeStore = (store: Store): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // quota / private mode — пробуем урезать и ещё раз
    try {
      const pruned = pruneStore(store, Math.floor(MAX_ENTRIES / 2))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned))
    } catch {
      // ignore
    }
  }
}

const pruneStore = (store: Store, limit: number): Store => {
  const entries = Object.entries(store).sort((a, b) => b[1].cachedAt - a[1].cachedAt)
  return Object.fromEntries(entries.slice(0, limit))
}

export const getCachedOtherProfile = (userId: string): CachedOtherProfile | null => {
  if (!userId) return null
  const entry = readStore()[userId]
  if (!entry) return null
  // Кэш мог быть записан старой версией приложения — порядок «ЦУ первым»
  // восстанавливаем на чтении, а не надеемся на запись.
  return { ...entry, education: sortEducationEntries(entry.education ?? []) }
}

export const setCachedOtherProfile = (cached: CachedOtherProfile): void => {
  if (!cached.user?.id) return
  const store = readStore()
  store[cached.user.id] = { ...cached, cachedAt: cached.cachedAt || Date.now() }
  writeStore(pruneStore(store, MAX_ENTRIES))
}

/** Точечно выкинуть профиль из кэша (блокировка: он больше не должен открываться) */
export const removeCachedOtherProfile = (userId: string): void => {
  if (!userId) return
  const store = readStore()
  if (!(userId in store)) return
  delete store[userId]
  writeStore(store)
}

export const setCachedOtherProfiles = (items: CachedOtherProfile[]): void => {
  if (!items.length) return
  const store = readStore()
  const now = Date.now()
  for (const item of items) {
    if (!item.user?.id) continue
    store[item.user.id] = { ...item, cachedAt: item.cachedAt || now }
  }
  writeStore(pruneStore(store, MAX_ENTRIES))
}
