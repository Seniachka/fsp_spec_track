import type { Contact } from '../../api/types'

export type IncomingScanContact = {
  userId: string
  name: string
  avatarUrl?: string | null
}

/** Контакты, появившиеся не по нашей инициативе (нас отсканировали). */
export const findIncomingScanContacts = (
  contacts: Contact[],
  knownIds: Set<string>,
  scannedByUsIds: Set<string>,
): IncomingScanContact[] => {
  const found: IncomingScanContact[] = []

  for (const contact of contacts) {
    const id = contact.user.id
    if (!id || knownIds.has(id)) continue
    // Бэк знает, кто кого сканировал: 'scan' — инициатива наша, карточку заметки
    // показывает QrModal. Это надёжнее локального набора, который стирается
    // выходом из аккаунта.
    if (contact.source) {
      // Раз бэк сказал прямо — локальный набор не спрашиваем: absorbServerContacts
      // кладёт туда и входящие связи, и любой его вызов (стикеры, синк кэша Нитей)
      // успел бы съесть карточку «тебя отсканировали» до нас.
      if (contact.source !== 'incoming') continue
    } else if (scannedByUsIds.has(id)) {
      // Старый бэк без source: мы сами отсканировали — карточку показывает QrModal.
      continue
    }

    found.push({
      userId: id,
      name:
        [contact.user.firstName, contact.user.lastName].filter(Boolean).join(' ') ||
        'Новый контакт',
      avatarUrl: contact.user.photoUrl,
    })
  }

  return found
}
