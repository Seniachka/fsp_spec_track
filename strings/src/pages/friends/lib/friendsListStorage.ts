import type { FriendItem } from '../model/types'

const STORAGE_KEY = 'friends_list'

export const FRIENDS_LIST_CHANGED_EVENT = 'faculty:friends-list-changed'

type StoredFriendItem = Omit<FriendItem, 'addedDate'> & {
  addedDate?: string | null
}

export type FriendsListCache = {
  contacts: FriendItem[]
  savedUsers: FriendItem[]
  syncedAt: number
  /** Бэк сказал, что за вычитанной страницей есть ещё (PageMeta.hasMore) */
  hasMoreContacts?: boolean
  hasMoreSavedUsers?: boolean
  /**
   * Offset следующей страницы для «Загрузить ещё» — серверный nextOffset
   * (PageMeta). Двигается только на реально загруженных страницах: длина списка
   * для этого не годится, её двигают блокировка, удаление из избранного и
   * локально добавленный контакт.
   */
  loadedContacts?: number
  loadedSavedUsers?: number
}

type RawFriendsListCache = {
  contacts?: StoredFriendItem[]
  savedUsers?: StoredFriendItem[]
  syncedAt?: number
  hasMoreContacts?: boolean
  hasMoreSavedUsers?: boolean
  loadedContacts?: number
  loadedSavedUsers?: number
}

const serializeItem = (item: FriendItem): StoredFriendItem => ({
  ...item,
  addedDate: item.addedDate ? item.addedDate.toISOString() : null,
})

const deserializeItem = (item: StoredFriendItem): FriendItem => ({
  ...item,
  addedDate: item.addedDate ? new Date(item.addedDate) : null,
})

export const getFriendsListCache = (): FriendsListCache | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RawFriendsListCache
    if (!parsed || typeof parsed !== 'object') return null
    return {
      contacts: (parsed.contacts ?? []).map(deserializeItem),
      savedUsers: (parsed.savedUsers ?? []).map(deserializeItem),
      syncedAt: parsed.syncedAt ?? 0,
      hasMoreContacts: parsed.hasMoreContacts ?? false,
      hasMoreSavedUsers: parsed.hasMoreSavedUsers ?? false,
      // Кэш от прошлой версии счётчиков не знает — undefined, а не 0: иначе
      // «Загрузить ещё» начало бы с начала списка.
      loadedContacts: parsed.loadedContacts,
      loadedSavedUsers: parsed.loadedSavedUsers,
    }
  } catch {
    return null
  }
}

export const setFriendsListCache = (cache: FriendsListCache): void => {
  try {
    const payload: RawFriendsListCache = {
      contacts: cache.contacts.map(serializeItem),
      savedUsers: cache.savedUsers.map(serializeItem),
      syncedAt: cache.syncedAt,
      hasMoreContacts: cache.hasMoreContacts ?? false,
      hasMoreSavedUsers: cache.hasMoreSavedUsers ?? false,
      loadedContacts: cache.loadedContacts,
      loadedSavedUsers: cache.loadedSavedUsers,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // quota / private mode
  }
}

export const clearFriendsListCache = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export const emitFriendsListChanged = (): void => {
  window.dispatchEvent(new CustomEvent(FRIENDS_LIST_CHANGED_EVENT))
}

export const patchFriendsListCache = (
  updater: (prev: FriendsListCache) => FriendsListCache,
): FriendsListCache => {
  const prev = getFriendsListCache() ?? { contacts: [], savedUsers: [], syncedAt: 0 }
  const next = updater(prev)
  setFriendsListCache(next)
  emitFriendsListChanged()
  return next
}
