/**
 * Синхронный кэш аватарок (data URL) для первого кадра.
 * Полное качество — IndexedDB + blob: в photoCache; data URL только fallback.
 */

const STORAGE_KEY = 'faculty-avatar-data-urls-v2'
const LEGACY_KEYS = ['faculty-avatar-data-urls']
const MAX_ENTRIES = 120
/** Достаточно для аватарок sm/md без «шакалов»; выше — риск упереться в quota LS */
const MAX_EDGE_PX = 512
const JPEG_QUALITY = 0.92
/** Если оригинал компактный — кладём как есть, без перекодирования */
const MAX_RAW_BYTES = 220_000

type Store = Record<string, string>

const memory = new Map<string, string>()

const dropLegacy = () => {
  for (const key of LEGACY_KEYS) {
    try {
      localStorage.removeItem(key)
    } catch {
      // ignore
    }
  }
}

const readStore = (): Store => {
  try {
    dropLegacy()
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Store
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const writeStore = (store: Store) => {
  try {
    const entries = Object.entries(store)
    const trimmed =
      entries.length > MAX_ENTRIES ? Object.fromEntries(entries.slice(-MAX_ENTRIES)) : store
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    try {
      const entries = Object.entries(store).slice(-Math.floor(MAX_ENTRIES / 2))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
    } catch {
      // ignore
    }
  }
}

/** Синхронно — можно в первом рендере (только fallback, не вместо blob) */
export const getStoredAvatarDataUrl = (userId: string | null | undefined): string | null => {
  if (!userId) return null
  const mem = memory.get(userId)
  if (mem) return mem
  const stored = readStore()[userId]
  if (stored) {
    memory.set(userId, stored)
    return stored
  }
  return null
}

export const setStoredAvatarDataUrl = (userId: string, dataUrl: string): void => {
  if (!userId || !dataUrl.startsWith('data:image/')) return
  memory.set(userId, dataUrl)
  const store = readStore()
  store[userId] = dataUrl
  writeStore(store)
}

/**
 * Точечно выкинуть превью одного пользователя (аватарку удалили).
 * Без этого data URL остаётся последним живым кадром удалённого фото и
 * подставляется везде, где photoUrl приходит пустым (Нити, поиск, афиша).
 */
export const removeStoredAvatarDataUrl = (userId: string | null | undefined): void => {
  if (!userId) return
  memory.delete(userId)
  const store = readStore()
  if (!(userId in store)) return
  delete store[userId]
  writeStore(store)
}

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

/** Высококачественное превью в LS (fallback до гидрации blob из IDB) */
export const persistAvatarPreview = async (userId: string, blob: Blob): Promise<string | null> => {
  if (!userId || !blob.size) return null
  try {
    const mime = blob.type || ''
    if (blob.size <= MAX_RAW_BYTES && mime.startsWith('image/') && !mime.includes('svg')) {
      const raw = await blobToDataUrl(blob)
      if (raw.startsWith('data:image/')) {
        setStoredAvatarDataUrl(userId, raw)
        return raw
      }
    }

    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      const raw = await blobToDataUrl(blob)
      setStoredAvatarDataUrl(userId, raw)
      return raw
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    setStoredAvatarDataUrl(userId, dataUrl)
    return dataUrl
  } catch {
    try {
      const raw = await blobToDataUrl(blob)
      if (raw.startsWith('data:image/')) {
        setStoredAvatarDataUrl(userId, raw)
        return raw
      }
    } catch {
      // ignore
    }
    return null
  }
}

export const clearStoredAvatars = (): void => {
  memory.clear()
  dropLegacy()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
