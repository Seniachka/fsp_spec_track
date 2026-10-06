import {
  cachePhotos,
  getCachedPhotoSrc,
  hydratePhotosFromCacheApi,
} from './photoCache'

/** Прелоад фото в blob-кэш / IndexedDB; уже в памяти пропускаем. */
export const preloadImages = async (urls: Array<string | null | undefined>) => {
  const unique = [
    ...new Set(urls.map((url) => url?.trim()).filter((url): url is string => Boolean(url))),
  ].filter((url) => !getCachedPhotoSrc(url))

  if (unique.length === 0) return
  await cachePhotos(unique)
}

export const preloadUserPhotos = async (
  users: Array<{ id?: string; photoUrl?: string | null; avatarUrl?: string | null }>,
) => {
  const urls = users.map((user) => user.photoUrl ?? user.avatarUrl)
  const userIds = users.map((user) => user.id)
  const need = urls
    .map((url, i) => ({ url, userId: userIds[i] }))
    .filter(({ url }) => url && !getCachedPhotoSrc(url))
  if (!need.length) return
  await cachePhotos(
    need.map((n) => n.url),
    need.map((n) => n.userId),
  )
}

/**
 * Как в Нитях: сначала байты из IndexedDB (+ по userId), потом докачка.
 */
export const warmUserPhotos = async (
  users: Array<{ id?: string; photoUrl?: string | null; avatarUrl?: string | null }>,
): Promise<void> => {
  const urls = users.map((user) => user.photoUrl ?? user.avatarUrl)
  const userIds = users.map((user) => user.id)
  await hydratePhotosFromCacheApi(urls, userIds)
  await preloadUserPhotos(users)
}

export const warmPhotos = async (urls: Array<string | null | undefined>): Promise<void> => {
  await hydratePhotosFromCacheApi(urls)
  await preloadImages(urls)
}

export { getCachedPhotoSrc } from './photoCache'
