import { getSavedUser } from '../../../api/SavedUsers'

export type SavedLookup = {
  isSaved: boolean
  /** false — достоверно узнать не удалось: «не в избранном» из этого не следует */
  complete: boolean
}

/**
 * Проверка «этот человек у меня в Избранном» под конкретный userId — одним
 * запросом в GET /api/me/saved-users/{userId} (200 — да, 404 — нет). Раньше
 * здесь шёл постраничный обход списка: у пользователя с сотнями избранных
 * флаг терялся, а ложное «не в избранном» уезжало в кэш профилей.
 */
export const findSavedUserById = async (userId: string): Promise<SavedLookup> => {
  if (!userId) return { isSaved: false, complete: true }

  try {
    const saved = await getSavedUser(userId)
    return { isSaved: Boolean(saved), complete: true }
  } catch {
    // Сеть или 5xx: ответа нет вообще — такой результат кэшировать нельзя
    return { isSaved: false, complete: false }
  }
}
