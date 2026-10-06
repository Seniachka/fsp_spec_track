import {
  getStoredAvatarDataUrl,
  persistAvatarPreview,
} from '../../../shared/lib/avatarDataStore'
import { getMemoryPhotoSrcForUser } from '../../../shared/lib/photoCache'
import { warmUserPhotos } from '../../../shared/lib/preloadImages'
import type { FriendItem } from '../model/types'

/** Полный blob важнее data URL — иначе остаются «шакальные» превью */
export const withReadyAvatarUrls = (items: FriendItem[]): FriendItem[] =>
  items.map((item) => {
    const ready =
      getMemoryPhotoSrcForUser(item.id, item.avatarUrl) || getStoredAvatarDataUrl(item.id)
    if (!ready) return item
    return { ...item, avatarUrl: ready }
  })

const ensurePreviewFromMemory = async (item: FriendItem): Promise<void> => {
  if (!item.avatarUrl || getStoredAvatarDataUrl(item.id)) return
  const memorySrc = getMemoryPhotoSrcForUser(item.id, item.avatarUrl)
  if (!memorySrc?.startsWith('blob:')) return
  try {
    const response = await fetch(memorySrc)
    const blob = await response.blob()
    if (blob.size > 0) await persistAvatarPreview(item.id, blob)
  } catch {
    // ignore
  }
}

/**
 * Дождаться полного качества (blob из IDB/сети). data URL — только запасной синхронный кадр.
 */
export const prepareFriendsAvatars = async (items: FriendItem[]): Promise<FriendItem[]> => {
  if (!items.length) return items
  await warmUserPhotos(items)
  // Превью в LS — в фоне, на экран отдаём blob
  void Promise.all(items.map((item) => ensurePreviewFromMemory(item)))
  return withReadyAvatarUrls(items)
}

export const friendsAvatarsReadySync = (items: FriendItem[]): boolean =>
  items.every(
    (item) =>
      !item.avatarUrl ||
      item.avatarUrl.startsWith('blob:') ||
      item.avatarUrl.startsWith('data:') ||
      Boolean(getMemoryPhotoSrcForUser(item.id, item.avatarUrl)) ||
      Boolean(getStoredAvatarDataUrl(item.id)),
  )
