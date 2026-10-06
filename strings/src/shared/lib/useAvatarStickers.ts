import { useCallback, useEffect, useState } from 'react'
import { isAuthenticated } from '../../api/client'
import { listContacts } from '../../api/Contacts'
import { listSavedUsers } from '../../api/SavedUsers'
import {
  isSameStorageOwner,
  readStorageOwnerId,
} from '../../entities/profile/api/otherProfileStorage'
import { resolveAvatarSticker, type AvatarStickerKind } from '../lib/avatarSticker'
import { absorbServerContacts } from '../lib/contactMeta'
import { CONTACTS_CHANGED_EVENT } from '../lib/contactsEvents'
import { listScannedContactIds } from '../lib/scannedContacts'

/** Сколько избранных / контактов тянем под стикеры (как в опросе контактов в App) */
const STICKER_LIST_LIMIT = 200

/**
 * Источник правды для стикеров — серверные списки избранного и контактов.
 * Любая правка (избранное, заметка, скан QR) шлёт CONTACTS_CHANGED_EVENT,
 * по нему перечитываем: экраны со стикерами живут в keep-alive и сами не
 * перемонтируются при возврате из чужого профиля.
 */
export const useAvatarStickers = () => {
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  const [noteIds, setNoteIds] = useState<Set<string>>(() => new Set())
  const [scannedIds, setScannedIds] = useState<Set<string>>(() => listScannedContactIds())

  const refetch = useCallback(async () => {
    setScannedIds(listScannedContactIds())
    if (!isAuthenticated()) {
      setSavedIds(new Set())
      setNoteIds(new Set())
      return
    }
    try {
      const ownerAtStart = readStorageOwnerId()
      // Явный limit: дефолт бэкенда мог бы обрезать список, и у части избранных
      // стикер бы не появился (раньше это компенсировал relation из выдачи поиска).
      const [saved, contacts] = await Promise.all([
        listSavedUsers({ limit: STICKER_LIST_LIMIT }),
        listContacts({ limit: STICKER_LIST_LIMIT }),
      ])
      // Пока ходили в сеть, могли нажать «Выйти»: запоздавший ответ вернул бы id
      // контактов ушедшего аккаунта в localStorage поверх вычищенных сторов
      // (чистка идёт с добивками, см. userScopedStorage).
      if (!isSameStorageOwner(ownerAtStart)) return
      // Серверные метки «встретились» — в локальный стор, и сразу перечитываем:
      // иначе стикер скана появлялся бы только на следующем перезапросе.
      absorbServerContacts(contacts)
      setScannedIds(listScannedContactIds())
      setSavedIds(new Set(saved.map((u) => u.id)))
      setNoteIds(
        new Set(
          contacts
            .filter((c) => Boolean(c.note?.trim()))
            .map((c) => c.user.id),
        ),
      )
    } catch {
      // оставляем предыдущие
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  useEffect(() => {
    const onContactsChanged = () => void refetch()
    window.addEventListener(CONTACTS_CHANGED_EVENT, onContactsChanged)
    return () => window.removeEventListener(CONTACTS_CHANGED_EVENT, onContactsChanged)
  }, [refetch])

  const getSticker = useCallback(
    (
      userId: string,
      overrides?: { isSaved?: boolean; hasNote?: boolean; fromScan?: boolean },
    ): AvatarStickerKind | null =>
      resolveAvatarSticker({
        isSaved: overrides?.isSaved ?? savedIds.has(userId),
        hasNote: overrides?.hasNote ?? noteIds.has(userId),
        fromScan: overrides?.fromScan ?? scannedIds.has(userId),
      }),
    [savedIds, noteIds, scannedIds],
  )

  return { getSticker, refetch, savedIds, noteIds, scannedIds }
}
