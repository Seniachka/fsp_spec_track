/**
 * Даты добавления контактов. Источник правды — createdAt с бэка (см.
 * contactMeta.ts), этот стор — кэш и фолбэк: он держит дату до первого синка,
 * в офлайне и на старом бэке, который createdAt ещё не отдаёт.
 */
const STORAGE_KEY = 'faculty.contactAddedAt'

type Store = Record<string, string>

const readStore = (): Store => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Store = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
        out[id] = value
      }
    }
    return out
  } catch {
    return {}
  }
}

const writeStore = (store: Store) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Переполненный localStorage / приватный режим: дата добавления влияет
    // только на группировку в Нитях, ронять из-за неё сохранение контакта нельзя.
  }
}

/** Запоминает первую дату добавления; повторные вызовы не перезаписывают. */
export const rememberContactAddedAt = (userId: string, at: Date = new Date()) => {
  if (!userId) return
  const store = readStore()
  if (store[userId]) return
  store[userId] = at.toISOString()
  writeStore(store)
}

/**
 * Даты с бэка: в отличие от rememberContactAddedAt, ПЕРЕЗАПИСЫВАЮТ локальные —
 * серверный createdAt авторитетнее нашего «когда мы это заметили». Пишем одним
 * setItem и только при реальном изменении: вызывается из поллинга контактов.
 */
export const setContactAddedAtMany = (entries: Iterable<readonly [string, Date]>) => {
  const store = readStore()
  let changed = false
  for (const [userId, at] of entries) {
    if (!userId) continue
    const iso = at.toISOString()
    if (store[userId] === iso) continue
    store[userId] = iso
    changed = true
  }
  if (changed) writeStore(store)
}

export const getContactAddedAtMap = (): Map<string, Date> => {
  const store = readStore()
  const map = new Map<string, Date>()
  for (const [id, iso] of Object.entries(store)) {
    map.set(id, new Date(iso))
  }
  return map
}
