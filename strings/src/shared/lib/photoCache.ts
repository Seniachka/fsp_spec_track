import { Capacitor, CapacitorHttp } from '@capacitor/core'
import {
  getStoredAvatarDataUrl,
  persistAvatarPreview,
  removeStoredAvatarDataUrl,
} from './avatarDataStore'

const DB_NAME = 'faculty-photos-v3'
const STORE_BLOBS = 'photos'
const STORE_USERS = 'user-keys'
const WORKING_URLS_KEY = 'faculty-photo-working-urls'
export const PHOTO_CACHE_UPDATED_EVENT = 'faculty:photo-cache-updated'
/** Пауза перед revokeObjectURL старого кадра — чтобы <img> успел перерисоваться */
const REVOKE_STALE_DELAY_MS = 5_000

/** Стабильный ключ (без query) → blob: object URL */
const objectUrls = new Map<string, string>()
/** userId → стабильный ключ фото */
const userKeys = new Map<string, string>()
/** userId → URL, который реально отрисовал <img> (для HTTP cache браузера) */
const workingUrls = new Map<string, string>()
const inflight = new Map<string, Promise<string | null>>()

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/**
 * Presigned S3 URL меняет query каждые ~15 мин.
 * Ключ кэша — origin+pathname, чтобы байты переживали переподпись.
 */
export const photoCacheKey = (src: string | null | undefined): string | null => {
  const raw = src?.trim()
  if (!raw) return null
  if (raw.startsWith('blob:') || raw.startsWith('data:')) return raw
  try {
    const url = new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    return `${url.origin}${url.pathname}`
  } catch {
    return raw.split('?')[0]?.split('#')[0] || raw
  }
}

/** Presigned URL уже протух — сеть смысла нет, только локальный кэш */
export const isSignedPhotoUrlExpired = (src: string | null | undefined): boolean => {
  const raw = src?.trim()
  if (!raw) return false
  try {
    const url = new URL(raw)
    const amzDate = url.searchParams.get('X-Amz-Date')
    const expiresSec = Number(url.searchParams.get('X-Amz-Expires') || '0')
    if (!amzDate || !expiresSec) return false
    // 20260812T192424Z
    const y = Number(amzDate.slice(0, 4))
    const mo = Number(amzDate.slice(4, 6))
    const d = Number(amzDate.slice(6, 8))
    const hh = Number(amzDate.slice(9, 11))
    const mm = Number(amzDate.slice(11, 13))
    const ss = Number(amzDate.slice(13, 15))
    if (![y, mo, d, hh, mm, ss].every((n) => Number.isFinite(n))) return false
    const signedAt = Date.UTC(y, mo - 1, d, hh, mm, ss)
    return Date.now() > signedAt + expiresSec * 1000
  } catch {
    return false
  }
}

const readWorkingUrlsStore = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(WORKING_URLS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const writeWorkingUrlsStore = (map: Record<string, string>) => {
  try {
    localStorage.setItem(WORKING_URLS_KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}

/** URL, которым <img> уже успешно показал аватар (тот же string → HTTP cache) */
export const getWorkingPhotoUrl = (userId: string | null | undefined): string | null => {
  if (!userId) return null
  const mem = workingUrls.get(userId)
  if (mem) return mem
  const stored = readWorkingUrlsStore()[userId]
  if (stored) {
    workingUrls.set(userId, stored)
    return stored
  }
  return null
}

export const rememberWorkingPhotoUrl = (userId: string, url: string): void => {
  const trimmed = url.trim()
  if (!userId || !trimmed || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return
  workingUrls.set(userId, trimmed)
  const store = readWorkingUrlsStore()
  store[userId] = trimmed
  // не раздуваем
  const entries = Object.entries(store)
  if (entries.length > 300) {
    writeWorkingUrlsStore(Object.fromEntries(entries.slice(-200)))
  } else {
    writeWorkingUrlsStore(store)
  }
  const key = photoCacheKey(trimmed)
  if (key) {
    userKeys.set(userId, key)
    void idbPutUserKey(userId, key)
  }
}

const forgetWorkingPhotoUrl = (userId: string): void => {
  workingUrls.delete(userId)
  const store = readWorkingUrlsStore()
  if (!(userId in store)) return
  delete store[userId]
  writeWorkingUrlsStore(store)
}

export const getCachedPhotoSrc = (src: string | null | undefined): string | null => {
  const key = photoCacheKey(src)
  if (!key) return null
  return objectUrls.get(key) ?? null
}

/** Только blob в памяти (без data URL из LS) */
export const getMemoryPhotoSrcForUser = (
  userId: string | null | undefined,
  src?: string | null,
): string | null => {
  const byUrl = getCachedPhotoSrc(src)
  if (byUrl) return byUrl
  if (!userId) return null
  // photoUrl === null — API прямо сказала «фото нет»: старый кадр по userId
  // подставлять нельзя, иначе удалённая аватарка висит вечно.
  // undefined — «URL неизвестен», там кэш по-прежнему нужен.
  if (src === null) return null
  const key = userKeys.get(userId)
  if (key && objectUrls.has(key)) return objectUrls.get(key) ?? null
  return null
}

export const getCachedPhotoSrcForUser = (
  userId: string | null | undefined,
  src?: string | null,
): string | null =>
  src === null ? null : getMemoryPhotoSrcForUser(userId, src) || getStoredAvatarDataUrl(userId)

/**
 * Лучший src для <img>: полный blob → data URL fallback → working URL → remote.
 */
export const resolvePhotoSrc = (
  userId: string | null | undefined,
  photoUrl?: string | null,
): { src: string; fromCache: boolean } => {
  // Фото удалили (API вернула null) — заглушка, а не старый кадр из кэша
  if (photoUrl === null) return { src: '', fromCache: false }
  // Сначала оригинал из IDB/памяти — не подменять сжатым data URL
  const memory = getMemoryPhotoSrcForUser(userId, photoUrl)
  if (memory) return { src: memory, fromCache: true }
  if (photoUrl?.startsWith('blob:') || photoUrl?.startsWith('data:')) {
    return { src: photoUrl, fromCache: true }
  }
  const dataUrl = getStoredAvatarDataUrl(userId)
  if (dataUrl) return { src: dataUrl, fromCache: true }
  const working = getWorkingPhotoUrl(userId)
  if (working) return { src: working, fromCache: false }
  const remote = photoUrl?.trim() || ''
  return { src: remote, fromCache: false }
}

export const isPhotoCached = (src: string | null | undefined): boolean =>
  Boolean(getCachedPhotoSrc(src))

const notifyUpdated = (cacheKey: string, userId?: string) => {
  window.dispatchEvent(
    new CustomEvent(PHOTO_CACHE_UPDATED_EVENT, {
      detail: { key: cacheKey, userId },
    }),
  )
}

const storeBlob = (cacheKey: string, blob: Blob, userId?: string): string => {
  // Ключ фото пользователя сменился — значит сменилась и аватарка,
  // старое превью в LS надо переписать, а не оставлять как fallback.
  const photoChanged = userId ? userKeys.get(userId) !== cacheKey : false
  const existing = objectUrls.get(cacheKey)
  if (existing) {
    if (userId) {
      userKeys.set(userId, cacheKey)
      void idbPutUserKey(userId, cacheKey)
      if (photoChanged || !getStoredAvatarDataUrl(userId)) {
        void persistAvatarPreview(userId, blob)
      }
      notifyUpdated(cacheKey, userId)
    }
    return existing
  }
  const objectUrl = URL.createObjectURL(blob)
  objectUrls.set(cacheKey, objectUrl)
  if (userId) {
    userKeys.set(userId, cacheKey)
    void idbPutUserKey(userId, cacheKey)
    void persistAvatarPreview(userId, blob)
  }
  notifyUpdated(cacheKey, userId)
  return objectUrl
}

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_BLOBS)) db.createObjectStore(STORE_BLOBS)
      if (!db.objectStoreNames.contains(STORE_USERS)) db.createObjectStore(STORE_USERS)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

const idbGet = async (cacheKey: string): Promise<Blob | null> => {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BLOBS, 'readonly')
      const req = tx.objectStore(STORE_BLOBS).get(cacheKey)
      req.onsuccess = () => {
        const value = req.result
        resolve(value instanceof Blob ? value : null)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

const idbPut = async (cacheKey: string, blob: Blob): Promise<void> => {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BLOBS, 'readwrite')
      tx.objectStore(STORE_BLOBS).put(blob, cacheKey)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // quota
  }
}

const idbDelete = async (cacheKey: string): Promise<void> => {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BLOBS, 'readwrite')
      tx.objectStore(STORE_BLOBS).delete(cacheKey)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // ignore
  }
}

/**
 * Выкинуть кадр прошлой аватарки: из памяти и IDB — сразу,
 * blob отпускаем с задержкой, чтобы уже отрисованный <img> не сломался.
 */
const dropStalePhotoKey = (cacheKey: string): void => {
  const objectUrl = objectUrls.get(cacheKey)
  objectUrls.delete(cacheKey)
  void idbDelete(cacheKey)
  if (!objectUrl) return
  setTimeout(() => {
    try {
      URL.revokeObjectURL(objectUrl)
    } catch {
      // ignore
    }
  }, REVOKE_STALE_DELAY_MS)
}

const idbPutUserKey = async (userId: string, cacheKey: string): Promise<void> => {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_USERS, 'readwrite')
      tx.objectStore(STORE_USERS).put(cacheKey, userId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // ignore
  }
}

const idbGetUserKey = async (userId: string): Promise<string | null> => {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_USERS, 'readonly')
      const req = tx.objectStore(STORE_USERS).get(userId)
      req.onsuccess = () => {
        const value = req.result
        resolve(typeof value === 'string' ? value : null)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

const idbDeleteUserKey = async (userId: string): Promise<void> => {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_USERS, 'readwrite')
      tx.objectStore(STORE_USERS).delete(userId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // ignore
  }
}

const resolveFetchUrl = (remoteUrl: string): string => {
  if (isNative()) return remoteUrl
  return `/__img-cache?url=${encodeURIComponent(remoteUrl)}`
}

const fetchPhotoBlob = async (remoteUrl: string): Promise<Blob | null> => {
  if (isSignedPhotoUrlExpired(remoteUrl)) return null

  if (isNative()) {
    try {
      const response = await CapacitorHttp.get({
        url: remoteUrl,
        responseType: 'arraybuffer',
        connectTimeout: 15_000,
        readTimeout: 15_000,
      })
      if (response.status < 200 || response.status >= 300) return null
      const data = response.data as ArrayBuffer | string | number[]
      let bytes: Uint8Array<ArrayBuffer>
      if (typeof data === 'string') {
        bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      } else if (Array.isArray(data)) {
        bytes = Uint8Array.from(data)
      } else {
        bytes = new Uint8Array(data)
      }
      const contentType =
        (response.headers?.['Content-Type'] ||
          response.headers?.['content-type'] ||
          'image/jpeg') as string
      const blob = new Blob([bytes], { type: contentType })
      return blob.size > 0 ? blob : null
    } catch {
      // fallback
    }
  }

  try {
    const response = await fetch(resolveFetchUrl(remoteUrl), {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    })
    if (!response.ok) return null
    const blob = await response.blob()
    if (!blob.size) return null
    if (blob.type && (blob.type.includes('xml') || blob.type.startsWith('text/'))) return null
    if (
      blob.type &&
      !blob.type.startsWith('image/') &&
      blob.type !== 'application/octet-stream'
    ) {
      return null
    }
    return blob
  } catch {
    return null
  }
}

export type CachePhotoOptions = { userId?: string }

/**
 * Кладёт фото в память + IndexedDB по стабильному ключу (без query).
 * Протухшие signed URL в сеть не ходим.
 */
export const cachePhoto = async (
  src: string | null | undefined,
  opts?: CachePhotoOptions,
): Promise<string | null> => {
  const remoteUrl = src?.trim()
  if (!remoteUrl) return null
  if (remoteUrl.startsWith('blob:') || remoteUrl.startsWith('data:')) return remoteUrl

  const cacheKey = photoCacheKey(remoteUrl)
  if (!cacheKey) return null
  const userId = opts?.userId?.trim() || undefined

  const hit = objectUrls.get(cacheKey)
  if (hit) {
    if (userId) {
      userKeys.set(userId, cacheKey)
      void idbPutUserKey(userId, cacheKey)
    }
    return hit
  }

  const pending = inflight.get(cacheKey)
  if (pending) return pending

  const task = (async (): Promise<string | null> => {
    const fromIdb = await idbGet(cacheKey)
    if (fromIdb && fromIdb.size > 0) {
      return storeBlob(cacheKey, fromIdb, userId)
    }

    const knownKey = userId ? userKeys.get(userId) || (await idbGetUserKey(userId)) : null
    // Ключ прошлого фото: не совпал с текущим — аватарку сменили, и старый кадр
    // годится только как запасной, пока новый не скачался.
    const staleKey = knownKey && knownKey !== cacheKey ? knownKey : null

    const blob = await fetchPhotoBlob(remoteUrl)
    if (!blob) {
      if (userId && staleKey) {
        const byUser = await idbGet(staleKey)
        if (byUser && byUser.size > 0) {
          userKeys.set(userId, staleKey)
          return storeBlob(staleKey, byUser, userId)
        }
      }
      return null
    }

    void idbPut(cacheKey, blob)
    const objectUrl = storeBlob(cacheKey, blob, userId)
    if (userId && staleKey) {
      // Новое фото уже в кэше — прошлое забываем целиком, вместе с working URL,
      // иначе аватарка после смены фото навсегда остаётся старой.
      forgetWorkingPhotoUrl(userId)
      dropStalePhotoKey(staleKey)
    }
    return objectUrl
  })().finally(() => {
    inflight.delete(cacheKey)
  })

  inflight.set(cacheKey, task)
  return task
}

export const cachePhotos = async (
  urls: Array<string | null | undefined>,
  userIds?: Array<string | null | undefined>,
): Promise<void> => {
  const byKey = new Map<string, { url: string; userId?: string }>()
  // Идём по ИСХОДНОМУ списку: userIds индексирован по нему, а не по дедуплицированному,
  // иначе фото цепляется к чужому userId и аватарки подменяются между людьми.
  urls.forEach((raw, index) => {
    const url = raw?.trim()
    if (!url) return
    const key = photoCacheKey(url)
    if (!key || byKey.has(key)) return
    const userId = userIds?.[index]?.trim() || undefined
    byKey.set(key, { url, userId })
  })
  if (!byKey.size) return
  await Promise.all(
    [...byKey.values()].map(({ url, userId }) => cachePhoto(url, { userId })),
  )
}

/** Подтянуть в память blob URL из IndexedDB без сети */
export const hydratePhotosFromCacheApi = async (
  urls: Array<string | null | undefined>,
  userIds?: Array<string | null | undefined>,
): Promise<void> => {
  const keys = new Set<string>()
  for (const url of urls) {
    const key = photoCacheKey(url)
    if (key) keys.add(key)
  }
  if (userIds) {
    for (const userId of userIds) {
      if (!userId) continue
      let key = userKeys.get(userId)
      if (!key) {
        key = (await idbGetUserKey(userId)) ?? undefined
        if (key) userKeys.set(userId, key)
      }
      if (key) keys.add(key)
    }
  }
  await Promise.all(
    [...keys].map(async (key) => {
      if (objectUrls.has(key)) return
      const blob = await idbGet(key)
      if (blob && blob.size > 0) storeBlob(key, blob)
    }),
  )
}

/** Аватарку удалили (API отдала photoUrl = null) — забываем весь кэш этого пользователя */
export const forgetUserPhoto = (userId: string | null | undefined): void => {
  if (!userId) return
  const key = userKeys.get(userId)
  userKeys.delete(userId)
  forgetWorkingPhotoUrl(userId)
  // Превью в localStorage — тоже кадр удалённого фото: там, где photoUrl приходит
  // пустым (Нити, поиск, афиша), getCachedPhotoSrcForUser достаёт именно его.
  removeStoredAvatarDataUrl(userId)
  void idbDeleteUserKey(userId)
  if (key) dropStalePhotoKey(key)
}

export const clearPhotoCache = async (): Promise<void> => {
  objectUrls.forEach((objectUrl) => {
    try {
      URL.revokeObjectURL(objectUrl)
    } catch {
      // ignore
    }
  })
  objectUrls.clear()
  userKeys.clear()
  workingUrls.clear()
  try {
    localStorage.removeItem(WORKING_URLS_KEY)
  } catch {
    // ignore
  }
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_BLOBS, STORE_USERS], 'readwrite')
      tx.objectStore(STORE_BLOBS).clear()
      tx.objectStore(STORE_USERS).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // ignore
  }
}
