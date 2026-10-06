/** Событие: контакты изменились (скан QR / заметка) — стикеры и т.п. */
export const CONTACTS_CHANGED_EVENT = 'faculty:contacts-changed'

export const emitContactsChanged = () => {
  window.dispatchEvent(new CustomEvent(CONTACTS_CHANGED_EVENT))
}
