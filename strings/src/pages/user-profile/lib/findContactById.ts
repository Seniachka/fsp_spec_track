import { getContact } from '../../../api/Contacts'
import type { Contact } from '../../../api/types'

export type ContactLookup = {
  contact: Contact | null
  /** false — достоверно узнать не удалось: «не контакт» из этого не следует */
  complete: boolean
}

/**
 * Проверка «этот человек у меня в Нитях» под конкретный userId — одним запросом
 * в GET /api/me/contacts/{userId} (200 — да, с заметкой; 404 — нет). Раньше
 * здесь шёл постраничный обход списка: у пользователя с сотнями контактов на
 * каждое открытие чужого профиля уходил десяток последовательных запросов, а
 * бейдж и заметка держались на том, доехал ли обход до конца.
 */
export const findContactById = async (userId: string): Promise<ContactLookup> => {
  if (!userId) return { contact: null, complete: true }

  try {
    return { contact: await getContact(userId), complete: true }
  } catch {
    // Сеть или 5xx: ответа нет вообще — такой результат кэшировать нельзя
    return { contact: null, complete: false }
  }
}
