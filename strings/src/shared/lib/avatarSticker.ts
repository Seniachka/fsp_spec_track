export type AvatarStickerKind = 'favorite' | 'note' | 'scan'

/** Приоритет: избранное → заметка → скан */
export const resolveAvatarSticker = (flags: {
  isSaved?: boolean
  hasNote?: boolean
  fromScan?: boolean
}): AvatarStickerKind | null => {
  if (flags.isSaved) return 'favorite'
  if (flags.hasNote) return 'note'
  if (flags.fromScan) return 'scan'
  return null
}
