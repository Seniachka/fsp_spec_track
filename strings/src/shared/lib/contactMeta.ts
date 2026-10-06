import type { Contact } from '../../api/types'
import { setContactAddedAtMany } from './contactAddedAt'
import { markScannedContactsFromServer } from './scannedContacts'

/**
 * Серверные метаданные контакта (source и createdAt) — источник правды про
 * «мы встретились» и «когда». Раньше и то и другое жило только в localStorage
 * телефона: после «Выйти» метка скана пропадала, кнопка заметки запиралась, а
 * все нити уезжали в группу «Ранее». Здесь мы впитываем ответы API обратно в
 * локальные сторы, чтобы старый код (стикеры, группировка, гейт заметки) видел
 * восстановленные данные, а фолбэк продолжал работать со старым бэком без этих
 * полей.
 */

/** Контакт есть на сервере (любой source) = встретились */
export const isMetOnServer = (contact: Contact | null | undefined): boolean =>
  Boolean(contact?.source)

/** createdAt контакта; null — старая запись без даты или мусор в поле */
export const contactCreatedAt = (contact: Contact | null | undefined): Date | null => {
  const raw = contact?.createdAt
  if (!raw) return null
  const ms = Date.parse(raw)
  return Number.isNaN(ms) ? null : new Date(ms)
}

/** Впитать метки и даты из ответа API в локальные сторы */
export const absorbServerContacts = (contacts: Contact[] | null | undefined) => {
  if (!contacts?.length) return

  const metIds: string[] = []
  const dates: Array<readonly [string, Date]> = []

  for (const contact of contacts) {
    const id = contact?.user?.id
    if (!id) continue
    if (isMetOnServer(contact)) metIds.push(id)
    const createdAt = contactCreatedAt(contact)
    if (createdAt) dates.push([id, createdAt])
  }

  markScannedContactsFromServer(metIds)
  setContactAddedAtMany(dates)
}

export const absorbServerContact = (contact: Contact | null | undefined) => {
  if (!contact) return
  absorbServerContacts([contact])
}
