import type { Contact, UserProfile } from '../../../api/types'
import {
  buildPersonSubtitle,
  type EduLineSource,
} from '../../../entities/education/lib/eduLine'
import type { FriendItem } from '../model/types'

const compareByName = (a: FriendItem, b: FriendItem): number => {
  const last = a.lastName.localeCompare(b.lastName, 'ru')
  if (last !== 0) return last
  return a.firstName.localeCompare(b.firstName, 'ru')
}

/**
 * Строка под именем в Нитях/Избранном: «Бак ‘1 — Продуктовый менеджмент».
 * Тот же хелпер, что и в поиске: степень с курсом из карточки ЦУ,
 * специализация — из профиля.
 */
export const formatFriendEduLine = (
  places: EduLineSource[] | EduLineSource | null | undefined,
  user: Pick<UserProfile, 'speciality' | 'status'> | null | undefined,
): string =>
  buildPersonSubtitle({
    places,
    speciality: user?.speciality,
    status: user?.status,
  })

export const mapUserToFriendItem = (
  user: UserProfile,
  note?: string | null,
  eduPlaces?: EduLineSource[] | EduLineSource | null,
  extras?: { isSaved?: boolean; fromScan?: boolean; addedDate?: Date | null },
): FriendItem => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  avatarUrl: user.photoUrl || undefined,
  description: formatFriendEduLine(eduPlaces, user),
  note,
  isSaved: extras?.isSaved,
  fromScan: extras?.fromScan,
  addedDate: extras?.addedDate ?? null,
})

export const mapContactToFriendItem = (
  contact: Contact,
  eduPlaces?: EduLineSource[] | EduLineSource | null,
  extras?: { isSaved?: boolean; fromScan?: boolean; addedDate?: Date | null },
): FriendItem => mapUserToFriendItem(contact.user, contact.note, eduPlaces, extras)

// Вкладка «Мои» группируется по дате добавления, а список обрезается
// пагинацией по 20 — сортируем в порядке групп (свежие сначала, без даты — в
// конец, внутри дня — по имени), иначе «Сегодня» может не попасть на первую
// страницу.
const compareByAddedDateThenName = (a: FriendItem, b: FriendItem): number => {
  const at = a.addedDate?.getTime() ?? Number.NEGATIVE_INFINITY
  const bt = b.addedDate?.getTime() ?? Number.NEGATIVE_INFINITY
  if (at !== bt) return bt - at
  return compareByName(a, b)
}

/**
 * Порядок вкладки «Мои». Применяется и к объединённому списку после «Загрузить
 * ещё»: каждая страница отсортирована сама по себе, и без пересортировки
 * вторая начинает алфавит заново внутри той же группы.
 */
export const sortContactItems = (items: FriendItem[]): FriendItem[] =>
  items.slice().sort(compareByAddedDateThenName)

/** Порядок вкладки «Избранное» — по фамилии и имени, тоже поверх всех страниц */
export const sortSavedItems = (items: FriendItem[]): FriendItem[] =>
  items.slice().sort(compareByName)

export const mapContactsToFriendItems = (
  contacts: Contact[],
  extrasById?: Map<string, { isSaved?: boolean; fromScan?: boolean; addedDate?: Date | null }>,
): FriendItem[] =>
  sortContactItems(contacts.map((c) => mapContactToFriendItem(c, null, extrasById?.get(c.user.id))))

export const mapUsersToFriendItems = (
  users: UserProfile[],
  extrasById?: Map<string, { isSaved?: boolean; fromScan?: boolean; note?: string | null; addedDate?: Date | null }>,
): FriendItem[] =>
  sortSavedItems(
    users.map((user) => {
      const extra = extrasById?.get(user.id)
      return mapUserToFriendItem(user, extra?.note, null, {
        isSaved: extra?.isSaved ?? true,
        fromScan: extra?.fromScan,
        addedDate: extra?.addedDate,
      })
    }),
  )

export const withEduDescriptions = async (
  items: FriendItem[],
  loadEdu: (userId: string) => Promise<EduLineSource[]>,
  usersById?: Map<string, Pick<UserProfile, 'speciality' | 'status'> | undefined>,
  concurrency = 4,
): Promise<FriendItem[]> => {
  const results = items.slice()
  let cursor = 0

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      const item = items[index]
      try {
        const places = await loadEdu(item.id)
        const description = formatFriendEduLine(places, usersById?.get(item.id)) || item.description
        results[index] = { ...item, description }
      } catch {
        results[index] = item
      }
    }
  }

  const pool = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(pool)
  return results
}
