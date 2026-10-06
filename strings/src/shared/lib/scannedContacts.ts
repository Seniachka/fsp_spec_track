import { rememberContactAddedAt } from './contactAddedAt'

/**
 * Контакты, с которыми мы встретились по QR. Источник правды — поле source с
 * бэка (см. contactMeta.ts), этот стор — кэш и фолбэк: он переживает офлайн и
 * работает со старым бэком, который source ещё не отдаёт.
 */
const STORAGE_KEY = 'faculty.scannedContactIds'

const readIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

const writeIds = (ids: Set<string>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // quota / private mode — метка «из скана» не критична, скан уже прошёл
  }
}

export const markScannedContact = (userId: string) => {
  if (!userId) return
  const ids = readIds()
  ids.add(userId)
  writeIds(ids)
  try {
    rememberContactAddedAt(userId)
  } catch {
    // там свой localStorage.setItem без catch — квота не должна ронять скан
  }
}

/**
 * Метки «встретились», приехавшие с бэка. Локальную дату добавления здесь не
 * ставим: у серверных записей есть свой createdAt, а «сейчас» от первого синка
 * после перезахода утащило бы все старые контакты в группу «Сегодня».
 * Пишем в localStorage, только если набор реально изменился — функция висит на
 * поллинге контактов и иначе молотила бы setItem вхолостую.
 */
export const markScannedContactsFromServer = (userIds: Iterable<string>) => {
  const ids = readIds()
  let changed = false
  for (const id of userIds) {
    if (!id || ids.has(id)) continue
    ids.add(id)
    changed = true
  }
  if (changed) writeIds(ids)
}

export const isScannedContact = (userId: string): boolean => readIds().has(userId)

export const listScannedContactIds = (): Set<string> => readIds()
