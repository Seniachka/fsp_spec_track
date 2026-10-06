/** Контакты, для которых уже показывали (или пропускали) входящую карточку после скана */
const KNOWN_KEY = 'faculty.knownContactIds'

const readIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(KNOWN_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

export const readKnownContactIds = (): Set<string> => readIds()

export const writeKnownContactIds = (ids: Iterable<string>) => {
  localStorage.setItem(KNOWN_KEY, JSON.stringify([...ids]))
}

const isSeeded = (): boolean => {
  try {
    return localStorage.getItem(KNOWN_KEY) != null
  } catch {
    return false
  }
}

/**
 * Первый запуск: списка ещё нет в localStorage — просто запоминаем текущий.
 * Проверяем именно наличие ключа, а не размер: у нового пользователя контактов
 * ноль, и по размеру мы сеяли повторно — первый входящий скан попадал в
 * «уже известные» до того, как его показали.
 */
export const seedKnownContactsIfEmpty = (ids: Iterable<string>): boolean => {
  if (isSeeded()) return false
  writeKnownContactIds(ids)
  return true
}
