import { useEffect, useState } from 'react'
import { FiUser } from 'react-icons/fi'
import {
  cachePhoto,
  forgetUserPhoto,
  getCachedPhotoSrcForUser,
  getMemoryPhotoSrcForUser,
  getWorkingPhotoUrl,
  photoCacheKey,
  PHOTO_CACHE_UPDATED_EVENT,
  rememberWorkingPhotoUrl,
  resolvePhotoSrc,
} from '../../lib/photoCache'
import './user-avatar.css'

type UserAvatarProps = {
  userId: string
  photoUrl?: string | null
  alt?: string
  className?: string
  imageClassName?: string
  size?: 'xxs' | 'xs' | 'sm' | 'md' | 'fill'
}

/**
 * null — API прямо сказала «фото нет»: ни working URL, ни кэш подставлять нельзя,
 * иначе удалённая аватарка висит вечно. undefined/'' — «поле не пришло», там
 * прошлый working URL по-прежнему лучший кандидат. Схлопывать одно в другое нельзя.
 */
const resolveRemote = (userId: string, photoUrl?: string | null): string | null => {
  if (photoUrl === null) return null
  return photoUrl?.trim() || getWorkingPhotoUrl(userId) || ''
}

export const UserAvatar = ({
  userId,
  photoUrl,
  alt = '',
  className = '',
  imageClassName = '',
  size = 'md',
}: UserAvatarProps) => {
  const remote = resolveRemote(userId, photoUrl)
  const cacheKey = photoCacheKey(remote)
  const initial = resolvePhotoSrc(userId, remote)
  const isLocalSrc = (src: string) => src.startsWith('blob:') || src.startsWith('data:')
  const [displaySrc, setDisplaySrc] = useState(initial.src)
  const [failed, setFailed] = useState(false)
  const [allowRemote, setAllowRemote] = useState(
    () =>
      initial.fromCache ||
      isLocalSrc(initial.src) ||
      Boolean(getWorkingPhotoUrl(userId)) ||
      !remote,
  )

  useEffect(() => {
    setFailed(false)
    // Ответ cachePhoto от прошлого userId/photoUrl не должен перетирать новое фото
    let cancelled = false
    const cleanup = () => {
      cancelled = true
    }

    // Фото удалили — рисуем заглушку и выкидываем связку userId → фото целиком
    // (blob, IndexedDB, working URL), иначе кэш продолжит отдавать старый кадр.
    if (photoUrl === null) {
      forgetUserPhoto(userId)
      setDisplaySrc('')
      setAllowRemote(true)
      return cleanup
    }

    // Сюда доходим только с известным фото — null отработал выше
    const nextRemote = resolveRemote(userId, photoUrl) ?? ''
    const resolved = resolvePhotoSrc(userId, nextRemote)
    // data: из LS не должен блокировать полный blob из IDB
    const full = getMemoryPhotoSrcForUser(userId, nextRemote)
    const best = full || resolved.src
    setDisplaySrc(best)

    if (full) {
      setAllowRemote(true)
      return cleanup
    }

    if (!nextRemote || isLocalSrc(nextRemote) || isLocalSrc(resolved.src)) {
      setAllowRemote(true)
      // Если пришёл только data: — всё равно подтянуть оригинал в фоне
      if (nextRemote.startsWith('data:') || resolved.src.startsWith('data:')) {
        const remoteForCache = getWorkingPhotoUrl(userId)
        if (remoteForCache) {
          void cachePhoto(remoteForCache, { userId }).then((src) => {
            if (cancelled) return
            if (src) {
              setDisplaySrc(src)
              setFailed(false)
            }
          })
        }
      }
      return cleanup
    }
    if (resolved.fromCache || getWorkingPhotoUrl(userId)) {
      setAllowRemote(true)
      void cachePhoto(getWorkingPhotoUrl(userId) || nextRemote, { userId }).then((src) => {
        if (cancelled) return
        if (src) {
          setDisplaySrc(src)
          setFailed(false)
        }
      })
      return cleanup
    }

    setAllowRemote(false)
    void cachePhoto(nextRemote, { userId }).then((src) => {
      if (cancelled) return
      if (src) {
        setDisplaySrc(src)
        setFailed(false)
        setAllowRemote(true)
        return
      }
      const working = getWorkingPhotoUrl(userId)
      if (working) setDisplaySrc(working)
      setAllowRemote(true)
    })
    return cleanup
  }, [photoUrl, userId])

  useEffect(() => {
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; userId?: string }>).detail
      if (detail?.userId && detail.userId !== userId) return
      if (
        detail?.key &&
        cacheKey &&
        detail.key !== cacheKey &&
        detail.userId !== userId
      ) {
        return
      }
      const local = getCachedPhotoSrcForUser(userId, remote)
      if (local) {
        setDisplaySrc(local)
        setFailed(false)
        setAllowRemote(true)
      }
    }
    window.addEventListener(PHOTO_CACHE_UPDATED_EVENT, onUpdated as EventListener)
    return () => window.removeEventListener(PHOTO_CACHE_UPDATED_EVENT, onUpdated as EventListener)
  }, [cacheKey, remote, userId])

  const src = displaySrc || (allowRemote && remote ? remote : '')
  const showPhoto = Boolean(src) && !failed

  if (showPhoto) {
    return (
      <img
        src={src}
        alt={alt}
        className={`user-avatar user-avatar--${size} user-avatar--photo ${imageClassName} ${className}`.trim()}
        referrerPolicy="no-referrer"
        decoding={isLocalSrc(src) ? 'sync' : 'async'}
        draggable={false}
        onLoad={() => {
          if (!src.startsWith('blob:') && !src.startsWith('data:')) {
            rememberWorkingPhotoUrl(userId, src)
          }
          const toCache = src.startsWith('blob:') ? remote : src
          if (toCache) void cachePhoto(toCache, { userId })
        }}
        onError={() => {
          const local = getCachedPhotoSrcForUser(userId, remote)
          if (local && src !== local) {
            setDisplaySrc(local)
            setFailed(false)
            return
          }
          const working = getWorkingPhotoUrl(userId)
          if (working && src !== working) {
            setDisplaySrc(working)
            setFailed(false)
            return
          }
          setFailed(true)
        }}
      />
    )
  }

  if (remote && !allowRemote && !failed) {
    return (
      <div
        className={`user-avatar user-avatar--${size} user-avatar--placeholder ${className}`.trim()}
        aria-hidden
      />
    )
  }

  return (
    <div
      className={`user-avatar user-avatar--${size} user-avatar--placeholder ${className}`.trim()}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      {/* Заглушка как в макете: белая контурная иконка человека (та же, что в таб-баре).
       * Размер и толщина обводки задаются в CSS (--avatar-icon-ratio / --avatar-icon-stroke),
       * поэтому здесь только сам глиф. */}
      <FiUser className="user-avatar__icon" aria-hidden focusable={false} />
    </div>
  )
}
