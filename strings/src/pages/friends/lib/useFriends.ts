import { useCallback, useEffect, useRef, useState } from 'react'
import { isAuthenticated } from '../../../api/client'
import type { FriendItem } from '../model/types'
import {
  FRIENDS_LIST_CHANGED_EVENT,
  getFriendsListCache,
} from './friendsListStorage'
import {
  FRIENDS_PAGE_SIZE,
  loadMoreContactsIntoCache,
  loadMoreSavedUsersIntoCache,
  syncFriendsCacheOnce,
} from './friendsCacheSync'
import {
  friendsAvatarsReadySync,
  prepareFriendsAvatars,
  withReadyAvatarUrls,
} from './prepareFriendsAvatars'

type Lists = {
  contacts: FriendItem[]
  savedUsers: FriendItem[]
  hasMoreContacts: boolean
  hasMoreSavedUsers: boolean
}

const readLists = (): Lists => {
  const cache = getFriendsListCache()
  return {
    contacts: cache?.contacts ?? [],
    savedUsers: cache?.savedUsers ?? [],
    hasMoreContacts: cache?.hasMoreContacts ?? false,
    hasMoreSavedUsers: cache?.hasMoreSavedUsers ?? false,
  }
}

const visibleSlice = (
  contacts: FriendItem[],
  saved: FriendItem[],
  contactsLimit: number,
  savedLimit: number,
) => [...contacts.slice(0, contactsLimit), ...saved.slice(0, savedLimit)]

export const useFriends = () => {
  const initial = readLists()
  const [contacts, setContacts] = useState<FriendItem[]>(() =>
    withReadyAvatarUrls(initial.contacts),
  )
  const [savedUsers, setSavedUsers] = useState<FriendItem[]>(() =>
    withReadyAvatarUrls(initial.savedUsers),
  )
  const [hasMoreContacts, setHasMoreContacts] = useState(initial.hasMoreContacts)
  const [hasMoreSavedUsers, setHasMoreSavedUsers] = useState(initial.hasMoreSavedUsers)
  const [loadingMoreContacts, setLoadingMoreContacts] = useState(false)
  const [loadingMoreSavedUsers, setLoadingMoreSavedUsers] = useState(false)
  const [loading, setLoading] = useState(() => {
    if (!isAuthenticated()) return false
    if (!getFriendsListCache()) return true
    const lists = readLists()
    return !friendsAvatarsReadySync(
      visibleSlice(lists.contacts, lists.savedUsers, FRIENDS_PAGE_SIZE, FRIENDS_PAGE_SIZE),
    )
  })
  const [error, setError] = useState<string | null>(null)
  const prepareGen = useRef(0)
  const loadingMoreRef = useRef(false)

  /** Следующая страница — с бэка: у активного пользователя контактов сотни */
  const loadMoreContacts = useCallback(async () => {
    if (loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMoreContacts(true)
    try {
      // Кэш патчится внутри — список приедет событием FRIENDS_LIST_CHANGED
      await loadMoreContactsIntoCache()
    } catch {
      // Кнопка остаётся на месте — можно нажать ещё раз
    } finally {
      loadingMoreRef.current = false
      setLoadingMoreContacts(false)
    }
  }, [])

  const loadMoreSavedUsers = useCallback(async () => {
    if (loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMoreSavedUsers(true)
    try {
      await loadMoreSavedUsersIntoCache()
    } catch {
      // Кнопка остаётся на месте — можно нажать ещё раз
    } finally {
      loadingMoreRef.current = false
      setLoadingMoreSavedUsers(false)
    }
  }, [])

  const applyCache = useCallback(async (opts?: { showSkeletonUntilPhotos?: boolean }) => {
    const lists = readLists()
    const gen = ++prepareGen.current
    // Всегда готовим первую страницу — смена лимита «ещё» не должна снова включать скелетон
    const visible = visibleSlice(
      lists.contacts,
      lists.savedUsers,
      FRIENDS_PAGE_SIZE,
      FRIENDS_PAGE_SIZE,
    )
    const alreadyReady = friendsAvatarsReadySync(visible)

    if (opts?.showSkeletonUntilPhotos !== false && !alreadyReady) {
      setLoading(true)
    }

    const preparedVisible = alreadyReady
      ? withReadyAvatarUrls(visible)
      : await prepareFriendsAvatars(visible)

    if (gen !== prepareGen.current) return

    const readyById = new Map(preparedVisible.map((f) => [f.id, f]))
    const merge = (items: FriendItem[]) =>
      items.map((item) => readyById.get(item.id) ?? withReadyAvatarUrls([item])[0])

    setContacts(merge(lists.contacts))
    setSavedUsers(merge(lists.savedUsers))
    setHasMoreContacts(lists.hasMoreContacts)
    setHasMoreSavedUsers(lists.hasMoreSavedUsers)
    setLoading(false)

    // Остальные (догруженные страницы) — в фоне
    const rest = [...lists.contacts, ...lists.savedUsers].filter((f) => !readyById.has(f.id))
    if (rest.length) {
      void prepareFriendsAvatars(rest).then((ready) => {
        if (gen !== prepareGen.current) return
        const map = new Map(ready.map((f) => [f.id, f]))
        setContacts((cur) => cur.map((f) => map.get(f.id) ?? f))
        setSavedUsers((cur) => cur.map((f) => map.get(f.id) ?? f))
      })
    }
  }, [])

  /** Ручной retry только при ошибке первого sync — не на каждый заход на Нити */
  const refetch = useCallback(async () => {
    if (!isAuthenticated()) {
      setContacts([])
      setSavedUsers([])
      setHasMoreContacts(false)
      setHasMoreSavedUsers(false)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      await syncFriendsCacheOnce({ force: true })
      await applyCache({ showSkeletonUntilPhotos: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить нити')
      setLoading(false)
    }
  }, [applyCache])

  useEffect(() => {
    if (!isAuthenticated()) {
      setLoading(false)
      return
    }

    if (getFriendsListCache()) {
      void applyCache({ showSkeletonUntilPhotos: true })
      return
    }

    setLoading(true)
    void syncFriendsCacheOnce()
      .then(async () => {
        await applyCache({ showSkeletonUntilPhotos: true })
        setError(null)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить нити')
        setLoading(false)
      })
  }, [applyCache])

  useEffect(() => {
    const onChanged = () => {
      void applyCache({ showSkeletonUntilPhotos: false })
      setError(null)
    }
    window.addEventListener(FRIENDS_LIST_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(FRIENDS_LIST_CHANGED_EVENT, onChanged)
  }, [applyCache])

  return {
    contacts,
    savedUsers,
    hasMoreContacts,
    hasMoreSavedUsers,
    loadMoreContacts,
    loadMoreSavedUsers,
    loadingMoreContacts,
    loadingMoreSavedUsers,
    loading,
    error,
    refetch,
  }
}
