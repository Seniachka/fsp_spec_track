import { clearStoredProfile } from '../../entities/profile/api/profileStorage'
import { clearFriendsListCache } from '../../pages/friends/lib/friendsListStorage'
import { resetFriendsCacheSession } from '../../pages/friends/lib/friendsCacheSync'
import { clearStoredAvatars } from './avatarDataStore'
import { clearPhotoCache } from './photoCache'
import { clearPageContexts } from './usePageContext'

/**
 * Всё, что в localStorage принадлежит КОНКРЕТНОМУ аккаунту, а не устройству.
 * При выходе и при входе под другим аккаунтом это надо вычищать целиком:
 * иначе сканы QR, заметки и кэши профилей «переезжают» между аккаунтами
 * на одном телефоне (стикер скана Богдана виден в чужом аккаунте).
 */
const USER_SCOPED_KEYS = [
  'faculty.scannedContactIds', // сканы QR — источник зелёного стикера
  'faculty.contactAddedAt', // даты добавления контактов (сортировка «Мои»)
  'faculty.knownContactIds', // входящие контакты
  'faculty.hiddenPostAuthorIds', // скрытые авторы объявлений
  'qr_notes', // заметки, написанные в QR-флоу
  'other_profiles_v2', // кэш чужих профилей (внутри isSaved и текст заметки!)
  // Схема v1 того же кэша: она выбрасывается сама при первом чтении, но на
  // устройстве, где после обновления профиль ещё не открывали, данные прошлого
  // аккаунта дожили бы до входа в следующий — чистим и её.
  'other_profiles',
  'filtersState', // фильтры поиска
  'selectedSkills', // выбранные скиллы в фильтрах
  'attending_events', // «Я иду» на мероприятиях
  'my_responses', // мои отклики на объявления
  'announcements', // кэш ленты объявлений
  'faculty.consentAccepted', // локальная отметка о принятых документах (pages/legal/model/consentStorage)
]

/**
 * То же самое в sessionStorage: пути табов ведут на чужие профили прошлого
 * аккаунта, поисковое состояние тянет за собой его же запрос и фильтры.
 */
const SESSION_SCOPED_KEYS = [
  'faculty.tabPaths', // сохранённые пути табов (TabNavigationContext)
  'faculty.lastMainTab', // последний открытый таб
]

/** Маркер «чьи данные лежат в localStorage» — id последнего залогиненного. */
const OWNER_KEY = 'faculty.storageOwnerId'

/**
 * Кому принадлежат сторы прямо сейчас (null — маркера ещё нет или сторадж
 * недоступен). Единственный способ прочитать OWNER_KEY снаружи: копия строки
 * в соседнем модуле разъехалась бы при первом переименовании ключа.
 */
export const getStorageOwnerId = (): string | null => {
  try {
    return localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}

/** Сторы аккаунта вычищены — можно сбросить то, что живёт в памяти (пути табов и т.п.) */
export const USER_SCOPED_STORES_CLEARED_EVENT = 'faculty:user-scoped-stores-cleared'

/**
 * Фоновый sync (нити, чужие профили, аватарки) стартовал ДО выхода и дописывает
 * данные старого аккаунта уже после чистки. Добиваем их ещё несколько раз,
 * пока никто не залогинился заново.
 */
const LATE_SWEEP_DELAYS_MS = [0, 600, 2500]

let lateSweepTimers: ReturnType<typeof setTimeout>[] = []

const cancelLateSweep = (): void => {
  for (const timer of lateSweepTimers) {
    clearTimeout(timer)
  }
  lateSweepTimers = []
}

const wipeStores = (): void => {
  for (const key of USER_SCOPED_KEYS) {
    try {
      localStorage.removeItem(key)
    } catch {
      // приватный режим/квоты — молча пропускаем, как и остальные сторы
    }
  }
  for (const key of SESSION_SCOPED_KEYS) {
    try {
      sessionStorage.removeItem(key)
    } catch {
      // ignore
    }
  }
  clearPageContexts()
  clearStoredProfile()
  clearFriendsListCache()
  clearStoredAvatars()
  // Аватарки (blob в памяти + IndexedDB + working URL) тоже пер-аккаунтные
  void clearPhotoCache()
  // Флаг «синк уже был» мог вернуть в true хвост фонового sync — иначе
  // следующий вход останется с пустым списком нитей до ручного обновления
  resetFriendsCacheSession()
  window.dispatchEvent(new CustomEvent(USER_SCOPED_STORES_CLEARED_EVENT))
}

const scheduleLateSweep = (ownerAtClear: string | null): void => {
  cancelLateSweep()
  lateSweepTimers = LATE_SWEEP_DELAYS_MS.map((delay) =>
    setTimeout(() => {
      let current: string | null = null
      try {
        current = localStorage.getItem(OWNER_KEY)
      } catch {
        return
      }
      // Владелец сменился — значит вход уже был и чистить нечего (и опасно)
      if (current !== ownerAtClear) return
      wipeStores()
    }, delay),
  )
}

export const clearUserScopedStores = (): void => {
  let owner: string | null = null
  try {
    owner = localStorage.getItem(OWNER_KEY)
  } catch {
    /* ignore */
  }
  wipeStores()
  // OWNER_KEY НЕ удаляем: без него ensureStorageOwner слепнет и не поймает
  // смену аккаунта, а хвост фонового sync успевает вернуть данные старого.
  scheduleLateSweep(owner)
}

/**
 * Вызывать сразу после успешной авторизации, как только известен id.
 * Если сторадж принадлежал другому аккаунту — чистим его данные, чтобы
 * они не попали в новую сессию (второй рубеж после чистки на логауте:
 * ловит смену аккаунта в обход «Выйти» — удаление аккаунта, QR-вход и т.п.).
 */
export const ensureStorageOwner = (userId: string): void => {
  if (!userId) return
  // Вошли — отложенные добивки больше не нужны: они бы стёрли новую сессию
  cancelLateSweep()
  try {
    const prev = localStorage.getItem(OWNER_KEY)
    if (prev && prev !== userId) clearUserScopedStores()
    localStorage.setItem(OWNER_KEY, userId)
  } catch {
    /* ignore */
  } finally {
    // clearUserScopedStores выше заново завёл таймеры добивки, а обезвреживает их
    // только запись нового OWNER_KEY. Если она не прошла (quota/приватный режим),
    // добивка увидит прежнего владельца и снесёт сторы уже НОВОЙ сессии прямо
    // во время её загрузки. Вход состоялся — гасим таймеры при любом исходе.
    cancelLateSweep()
  }
}
