import { isAuthenticated } from '../../../api/client'
import { listContactsPage } from '../../../api/Contacts'
import { listSavedUsersPage } from '../../../api/SavedUsers'
import type { Contact, EduPlace, ListPage, UserProfile } from '../../../api/types'
import {
  getCachedOtherProfile,
  isSameStorageOwner,
  readStorageOwnerId,
  setCachedOtherProfile,
} from '../../../entities/profile/api/otherProfileStorage'
import { prefetchOtherProfiles } from '../../../entities/profile/lib/prefetchOtherProfiles'
import { getContactAddedAtMap, rememberContactAddedAt } from '../../../shared/lib/contactAddedAt'
import {
  absorbServerContact,
  absorbServerContacts,
  contactCreatedAt,
  isMetOnServer,
} from '../../../shared/lib/contactMeta'
import { listScannedContactIds } from '../../../shared/lib/scannedContacts'
import { preloadUserPhotos, warmUserPhotos } from '../../../shared/lib/preloadImages'
import { prepareFriendsAvatars } from './prepareFriendsAvatars'
import type { FriendItem } from '../model/types'
import {
  emitFriendsListChanged,
  getFriendsListCache,
  patchFriendsListCache,
  setFriendsListCache,
  type FriendsListCache,
} from './friendsListStorage'
import {
  formatFriendEduLine,
  mapContactsToFriendItems,
  mapContactToFriendItem,
  mapUsersToFriendItems,
  mapUserToFriendItem,
  sortContactItems,
  sortSavedItems,
} from './mapFriends'

let syncedThisSession = false
let inFlight: Promise<void> | null = null

/**
 * Страница Нитей/Избранного. Бэкенд по умолчанию отдаёт 20 — просим столько же
 * явно и добираем по «Загрузить ещё»: у активного пользователя контактов могут
 * быть сотни, тянуть всех при входе не нужно.
 */
export const FRIENDS_PAGE_SIZE = 20

/** Курсор следующей страницы: серверный nextOffset, длина ответа — запасной вариант */
const cursorFromPage = <T>(page: ListPage<T>, offset: number): number =>
  page.nextOffset ?? offset + page.items.length

/**
 * Курсор «Загрузить ещё» после того, как человек пропал из списка и на бэке
 * (блокировка, «убрать из избранного»). Пока запись была внутри уже вычитанного
 * куска, бэк отдаст на одну запись меньше — сдвигаем счётчик назад вместе с ней,
 * иначе следующая страница начнётся позже и пропустит того, кто занял её место.
 * Промахнуться в эту сторону безопаснее: лишний повтор отсеет фильтр дублей.
 */
const cursorAfterRemoval = (
  loaded: number | undefined,
  items: FriendItem[],
  userId: string,
): number | undefined => {
  if (!items.some((item) => item.id === userId)) return loaded
  return Math.max(0, (loaded ?? items.length) - 1)
}

/**
 * Запись в кэше Нитей заменяется целиком ответом мутации (добавили контакт,
 * сохранили заметку, добавили в избранное). Если бэкенд не смог подписать ссылку
 * на фото, в ответе приходит photoUrl: null → avatarUrl: undefined, и уже
 * известный рабочий URL пропадает из кэша: у человека с фото в Нитях останется
 * заглушка, пока не пройдёт полная синхронизация. Известный URL не теряем.
 */
const keepKnownAvatarUrl = (
  item: FriendItem,
  ...lists: FriendItem[][]
): FriendItem => {
  if (item.avatarUrl) return item
  for (const list of lists) {
    const known = list.find((entry) => entry.id === item.id)?.avatarUrl
    if (known) return { ...item, avatarUrl: known }
  }
  return item
}

/** Профиль в localStorage (кэш Нитей) — карточка ЦУ и курс лежат там */
const descriptionFromCachedProfile = (
  userId: string,
  user: Pick<UserProfile, 'speciality' | 'status'> | null | undefined,
  fallbackDescription = '',
): string => {
  const cached = getCachedOtherProfile(userId)
  if (!cached?.education?.length) return fallbackDescription
  return formatFriendEduLine(cached.education, user) || fallbackDescription
}

const patchDescription = (
  userId: string,
  places: EduPlace[],
  user: Pick<UserProfile, 'speciality' | 'status'> | null | undefined,
  ownerAtStart: string | null,
) => {
  // Подписи приезжают из фонового prefetch — после выхода писать их некуда
  if (!isSameStorageOwner(ownerAtStart)) return
  patchFriendsListCache((prev) => {
    const update = (items: FriendItem[]) => {
      const index = items.findIndex((item) => item.id === userId)
      if (index < 0) return items
      const description = formatFriendEduLine(places, user) || items[index].description
      if (description === items[index].description) return items
      const next = items.slice()
      next[index] = { ...items[index], description }
      return next
    }
    return {
      ...prev,
      contacts: update(prev.contacts),
      savedUsers: update(prev.savedUsers),
      syncedAt: Date.now(),
    }
  })
}

const buildLists = (
  contactsPage: ListPage<Contact>,
  savedPage: ListPage<UserProfile>,
): FriendsListCache => {
  const contactsData = contactsPage.items
  const savedData = savedPage.items
  const scanned = listScannedContactIds()
  const addedAtById = getContactAddedAtMap()
  const savedIdSet = new Set(savedData.map((u) => u.id))
  const noteById = new Map(contactsData.map((c) => [c.user.id, c.note] as const))

  const contactExtras = new Map(
    contactsData.map((c) => [
      c.user.id,
      {
        isSaved: savedIdSet.has(c.user.id),
        // Контакт есть на сервере — значит встретились; локальный набор нужен
        // старому бэку без source и своим записям до первого синка.
        fromScan: isMetOnServer(c) || scanned.has(c.user.id),
        addedDate: contactCreatedAt(c) ?? addedAtById.get(c.user.id) ?? null,
      },
    ]),
  )

  const savedExtras = new Map(
    savedData.map((u) => [
      u.id,
      {
        isSaved: true as const,
        fromScan: scanned.has(u.id),
        note: noteById.get(u.id) ?? null,
        addedDate: addedAtById.get(u.id) ?? null,
      },
    ]),
  )

  const contacts = mapContactsToFriendItems(contactsData, contactExtras).map((item) => ({
    ...item,
    description:
      descriptionFromCachedProfile(
        item.id,
        contactsData.find((c) => c.user.id === item.id)?.user,
        item.description,
      ) || item.description,
  }))

  const savedUsers = mapUsersToFriendItems(savedData, savedExtras).map((item) => ({
    ...item,
    description:
      descriptionFromCachedProfile(
        item.id,
        savedData.find((u) => u.id === item.id),
        item.description,
      ) || item.description,
  }))

  return {
    contacts,
    savedUsers,
    syncedAt: Date.now(),
    // «Есть ещё» и курсор — с бэка (PageMeta), а не по длине выданного списка
    hasMoreContacts: contactsPage.hasMore,
    hasMoreSavedUsers: savedPage.hasMore,
    // Полный sync перечитывает первую страницу — курсор пагинации начинается заново
    loadedContacts: cursorFromPage(contactsPage, 0),
    loadedSavedUsers: cursorFromPage(savedPage, 0),
  }
}

/** Разовый sync списка нитей + полных профилей при входе в приложение */
export const syncFriendsCacheOnce = async (opts?: { force?: boolean }): Promise<void> => {
  if (!isAuthenticated()) {
    syncedThisSession = false
    return
  }
  if (syncedThisSession && !opts?.force) return
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      // Чей это сторадж на момент старта: запрос может завершиться уже после
      // выхода/входа под другим аккаунтом — тогда его ответ выбрасываем.
      const ownerAtStart = readStorageOwnerId()
      const existing = getFriendsListCache()
      if (existing) {
        void warmUserPhotos([...existing.contacts, ...existing.savedUsers])
      }

      // Первая страница: остальное — по «Загрузить ещё»
      const [contactsPage, savedPage] = await Promise.all([
        listContactsPage({ limit: FRIENDS_PAGE_SIZE, offset: 0 }),
        listSavedUsersPage({ limit: FRIENDS_PAGE_SIZE, offset: 0 }),
      ])
      if (!isSameStorageOwner(ownerAtStart)) return
      const contactsData = contactsPage.items
      const savedData = savedPage.items
      // Метки «встретились» и даты с бэка — в локальные сторы ДО сборки списков:
      // buildLists читает их картами, и без этого свежевосстановленный после
      // перезахода контакт остался бы без стикера и в группе «Ранее».
      absorbServerContacts(contactsData)
      const lists = buildLists(contactsPage, savedPage)
      setFriendsListCache(lists)
      emitFriendsListChanged()

      // Первая страница — в data URL кэш до показа; хвост (если бэк отдал больше) в фоне
      await prepareFriendsAvatars([
        ...lists.contacts.slice(0, FRIENDS_PAGE_SIZE),
        ...lists.savedUsers.slice(0, FRIENDS_PAGE_SIZE),
      ])
      void prepareFriendsAvatars([
        ...lists.contacts.slice(FRIENDS_PAGE_SIZE),
        ...lists.savedUsers.slice(FRIENDS_PAGE_SIZE),
      ])

      const savedIdSet = new Set(savedData.map((u) => u.id))
      const contactIdSet = new Set(contactsData.map((c) => c.user.id))
      const noteById = new Map(contactsData.map((c) => [c.user.id, c.note] as const))
      const byId = new Map<
        string,
        { user: UserProfile; isSaved: boolean; isContact: boolean; note: string }
      >()

      contactsData.forEach((c) => {
        byId.set(c.user.id, {
          user: c.user,
          isSaved: savedIdSet.has(c.user.id),
          isContact: true,
          note: c.note?.trim() ?? '',
        })
      })
      savedData.forEach((u) => {
        const existing = byId.get(u.id)
        byId.set(u.id, {
          user: u,
          isSaved: true,
          isContact: existing?.isContact ?? contactIdSet.has(u.id),
          note: existing?.note ?? noteById.get(u.id)?.trim() ?? '',
        })
      })

      const userById = new Map<string, UserProfile>()
      byId.forEach((value, id) => userById.set(id, value.user))

      await prefetchOtherProfiles([...byId.values()], {
        concurrency: 4,
        onEduLoaded: (userId, places) => {
          patchDescription(userId, places, userById.get(userId), ownerAtStart)
        },
      })

      syncedThisSession = true
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

export const resetFriendsCacheSession = (): void => {
  syncedThisSession = false
}

/** Догрузить следующую страницу вкладки «Мои» (offset = курсор с бэка, nextOffset) */
export const loadMoreContactsIntoCache = async (): Promise<void> => {
  const ownerAtStart = readStorageOwnerId()
  const cache = getFriendsListCache()
  // По длине списка offset считать нельзя: блокировка и локально добавленный
  // контакт её двигают, и следующая страница съезжала, пропуская человека.
  // Кэш от прошлой версии счётчика не знает — там длина остаётся запасным вариантом.
  const offset = cache?.loadedContacts ?? cache?.contacts.length ?? 0
  const loaded = await listContactsPage({ limit: FRIENDS_PAGE_SIZE, offset })
  const page = loaded.items
  // Пока грузили страницу, могли выйти из аккаунта — чужие контакты не пишем
  if (!isSameStorageOwner(ownerAtStart)) return

  // Сначала впитываем серверные метки/даты, потом читаем карты — иначе у хвоста
  // списка (всё, что дальше первой страницы) не будет ни стикера, ни группы.
  absorbServerContacts(page)
  const scanned = listScannedContactIds()
  const addedAtById = getContactAddedAtMap()
  const savedIdSet = new Set((cache?.savedUsers ?? []).map((u) => u.id))
  const extras = new Map(
    page.map((c) => [
      c.user.id,
      {
        isSaved: savedIdSet.has(c.user.id),
        fromScan: isMetOnServer(c) || scanned.has(c.user.id),
        addedDate: contactCreatedAt(c) ?? addedAtById.get(c.user.id) ?? null,
      },
    ]),
  )

  const items = mapContactsToFriendItems(page, extras).map((item) => ({
    ...item,
    description:
      descriptionFromCachedProfile(
        item.id,
        page.find((c) => c.user.id === item.id)?.user,
        item.description,
      ) || item.description,
  }))

  patchFriendsListCache((prev) => {
    const known = new Set(prev.contacts.map((c) => c.id))
    return {
      ...prev,
      // Дозагруженную страницу сортируем вместе с уже показанными: приписанная
      // в хвост, она начинала бы алфавит заново внутри той же группы («Ранее»).
      contacts: sortContactItems([
        ...prev.contacts,
        ...items.filter((item) => !known.has(item.id)),
      ]),
      hasMoreContacts: loaded.hasMore,
      // Курсор берём с бэка, а не считаем по числу новых карточек: отсеянные
      // дубли с бэка тоже вычитаны.
      loadedContacts: cursorFromPage(loaded, offset),
      syncedAt: Date.now(),
    }
  })

  void preloadUserPhotos(page.map((c) => c.user))
  void prefetchOtherProfiles(
    page.map((c) => ({
      user: c.user,
      isSaved: savedIdSet.has(c.user.id),
      isContact: true,
      note: c.note?.trim() ?? '',
    })),
    {
      concurrency: 4,
      onEduLoaded: (userId, places) => {
        patchDescription(userId, places, page.find((c) => c.user.id === userId)?.user, ownerAtStart)
      },
    },
  )
}

/** Догрузить следующую страницу вкладки «Избранное» */
export const loadMoreSavedUsersIntoCache = async (): Promise<void> => {
  const ownerAtStart = readStorageOwnerId()
  const cache = getFriendsListCache()
  // Тот же счётчик вычитанного, что и у контактов: «убрать из избранного»
  // укорачивает список, и по его длине следующая страница пропускала человека.
  const offset = cache?.loadedSavedUsers ?? cache?.savedUsers.length ?? 0
  const loaded = await listSavedUsersPage({ limit: FRIENDS_PAGE_SIZE, offset })
  const page = loaded.items
  if (!isSameStorageOwner(ownerAtStart)) return

  const scanned = listScannedContactIds()
  const addedAtById = getContactAddedAtMap()
  const cachedContacts = cache?.contacts ?? []
  const noteById = new Map(cachedContacts.map((c) => [c.id, c.note ?? null] as const))
  const contactIdSet = new Set(cachedContacts.map((c) => c.id))
  const extras = new Map(
    page.map((u) => [
      u.id,
      {
        isSaved: true as const,
        fromScan: scanned.has(u.id),
        note: noteById.get(u.id) ?? null,
        addedDate: addedAtById.get(u.id) ?? null,
      },
    ]),
  )

  const items = mapUsersToFriendItems(page, extras).map((item) => ({
    ...item,
    description:
      descriptionFromCachedProfile(
        item.id,
        page.find((u) => u.id === item.id),
        item.description,
      ) || item.description,
  }))

  patchFriendsListCache((prev) => {
    const known = new Set(prev.savedUsers.map((u) => u.id))
    return {
      ...prev,
      // Пересортировка объединённого списка — иначе алфавит идёт по страницам
      savedUsers: sortSavedItems([
        ...prev.savedUsers,
        ...items.filter((item) => !known.has(item.id)),
      ]),
      hasMoreSavedUsers: loaded.hasMore,
      loadedSavedUsers: cursorFromPage(loaded, offset),
      syncedAt: Date.now(),
    }
  })

  void preloadUserPhotos(page)
  void prefetchOtherProfiles(
    page.map((user) => ({
      user,
      isSaved: true,
      isContact: contactIdSet.has(user.id),
      note: noteById.get(user.id)?.trim() ?? '',
    })),
    {
      concurrency: 4,
      onEduLoaded: (userId, places) => {
        patchDescription(userId, places, page.find((u) => u.id === userId), ownerAtStart)
      },
    },
  )
}

/** Добавить/обновить контакт в LS + догрузить полный профиль */
export const rememberContactInFriendsCache = async (contact: Contact): Promise<void> => {
  if (!contact.user?.id) return

  const ownerAtStart = readStorageOwnerId()
  // Серверные метка и дата — первыми: rememberContactAddedAt ниже не перебьёт
  // уже записанный createdAt (он не перезаписывает), и «сейчас» останется
  // фолбэком только для старого бэка без этих полей.
  absorbServerContact(contact)
  // Дата добавления — украшение сортировки: даже если localStorage переполнен,
  // свежий контакт обязан доехать до кэша Нитей ниже.
  try {
    rememberContactAddedAt(contact.user.id)
  } catch {
    // ignore
  }
  const scanned = listScannedContactIds()
  const cache = getFriendsListCache() ?? { contacts: [], savedUsers: [], syncedAt: 0 }
  const isSaved = cache.savedUsers.some((u) => u.id === contact.user.id)
  const addedDate =
    contactCreatedAt(contact) ?? getContactAddedAtMap().get(contact.user.id) ?? new Date()

  let item = mapContactToFriendItem(contact, null, {
    isSaved,
    fromScan: isMetOnServer(contact) || scanned.has(contact.user.id),
    addedDate,
  })
  item = {
    ...item,
    description:
      descriptionFromCachedProfile(item.id, contact.user, item.description) || item.description,
  }

  patchFriendsListCache((prev) => {
    const next = keepKnownAvatarUrl(item, prev.contacts, prev.savedUsers)
    const contacts = [next, ...prev.contacts.filter((c) => c.id !== next.id)]
    const savedUsers = prev.savedUsers.map((u) =>
      u.id === next.id
        ? { ...u, note: next.note, fromScan: next.fromScan, isSaved: true }
        : u,
    )
    return { ...prev, contacts, savedUsers, syncedAt: Date.now() }
  })

  void preloadUserPhotos([contact.user])
  void prefetchOtherProfiles(
    [
      {
        user: contact.user,
        isSaved,
        isContact: true,
        note: contact.note?.trim() ?? '',
      },
    ],
    {
      onEduLoaded: (userId, places) => {
        patchDescription(userId, places, contact.user, ownerAtStart)
      },
    },
  )
}

/** Добавить/обновить избранное в LS + догрузить полный профиль */
export const rememberSavedInFriendsCache = async (user: UserProfile): Promise<void> => {
  if (!user?.id) return

  const ownerAtStart = readStorageOwnerId()
  const scanned = listScannedContactIds()
  const cache = getFriendsListCache() ?? { contacts: [], savedUsers: [], syncedAt: 0 }
  const existingContact = cache.contacts.find((c) => c.id === user.id)
  const note = existingContact?.note ?? ''

  let item = mapUserToFriendItem(user, note, null, {
    isSaved: true,
    fromScan: scanned.has(user.id) || Boolean(existingContact?.fromScan),
    addedDate: existingContact?.addedDate ?? getContactAddedAtMap().get(user.id) ?? null,
  })
  item = {
    ...item,
    description:
      descriptionFromCachedProfile(item.id, user, item.description) || item.description,
  }

  patchFriendsListCache((prev) => {
    const next = keepKnownAvatarUrl(item, prev.contacts, prev.savedUsers)
    const savedUsers = [next, ...prev.savedUsers.filter((u) => u.id !== next.id)]
    const contacts = prev.contacts.map((c) => (c.id === next.id ? { ...c, isSaved: true } : c))
    return { ...prev, contacts, savedUsers, syncedAt: Date.now() }
  })

  void preloadUserPhotos([user])
  void prefetchOtherProfiles(
    [
      {
        user,
        isSaved: true,
        isContact: Boolean(existingContact),
        note: note?.trim() ?? '',
      },
    ],
    {
      onEduLoaded: (userId, places) => {
        patchDescription(userId, places, user, ownerAtStart)
      },
    },
  )
}

export const forgetSavedFromFriendsCache = (userId: string): void => {
  if (!userId) return
  patchFriendsListCache((prev) => ({
    ...prev,
    contacts: prev.contacts.map((c) => (c.id === userId ? { ...c, isSaved: false } : c)),
    savedUsers: prev.savedUsers.filter((u) => u.id !== userId),
    loadedSavedUsers: cursorAfterRemoval(prev.loadedSavedUsers, prev.savedUsers, userId),
    syncedAt: Date.now(),
  }))

  const cached = getCachedOtherProfile(userId)
  if (cached) {
    setCachedOtherProfile({ ...cached, isSaved: false, cachedAt: Date.now() })
  }
}

/**
 * Убрать человека из кэша Нитей целиком (блокировка: бэк рвёт и контакт, и
 * избранное). Свой кэш useFriends перечитывает только по событию из
 * patchFriendsListCache, а полный sync ходит на бэк раз за сессию — без этого
 * заблокированный остаётся в списке до перезапуска приложения.
 */
export const forgetContactInFriendsCache = (userId: string): void => {
  if (!userId) return
  patchFriendsListCache((prev) => ({
    ...prev,
    contacts: prev.contacts.filter((c) => c.id !== userId),
    savedUsers: prev.savedUsers.filter((u) => u.id !== userId),
    loadedContacts: cursorAfterRemoval(prev.loadedContacts, prev.contacts, userId),
    loadedSavedUsers: cursorAfterRemoval(prev.loadedSavedUsers, prev.savedUsers, userId),
    syncedAt: Date.now(),
  }))
}

export const patchFriendNoteInCache = (userId: string, note: string): void => {
  if (!userId) return
  const trimmed = note.trim()
  patchFriendsListCache((prev) => ({
    ...prev,
    contacts: prev.contacts.map((c) => (c.id === userId ? { ...c, note: trimmed } : c)),
    savedUsers: prev.savedUsers.map((u) => (u.id === userId ? { ...u, note: trimmed } : u)),
    syncedAt: Date.now(),
  }))

  const cached = getCachedOtherProfile(userId)
  if (cached) {
    setCachedOtherProfile({ ...cached, note: trimmed, cachedAt: Date.now() })
  }
}
