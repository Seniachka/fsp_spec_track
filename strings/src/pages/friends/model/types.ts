/** View-модель карточки на странице «Нити» */
export type FriendItem = {
  id: string
  firstName: string
  lastName: string
  avatarUrl?: string
  description: string
  note?: string | null
  isSaved?: boolean
  fromScan?: boolean
  /**
   * Дата встречи для группировки «Сегодня / Вчера…». Источник — createdAt с
   * сервера; локальный стор дат — фолбэк (старый бэк, записи до первого синка).
   */
  addedDate?: Date | null
}
