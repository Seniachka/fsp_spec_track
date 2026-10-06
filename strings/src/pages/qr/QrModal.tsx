import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { FiX } from 'react-icons/fi'
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import styles from './QrModal.module.css'
import { QrBadge } from './QrBadge'
import { Lanyard } from './Lanyard'
import { QrCamera } from './QrCamera'
import { QrResult } from './QrResult'
import { QrSaved } from './QrSaved'
import { parseQrPayload } from './qrPayload'
import { ApiRequestError } from '../../api/client'
import { getMe } from '../../api/Me'
import { createContact, getContact, listContacts, updateContact } from '../../api/Contacts'
import { markScannedContact, listScannedContactIds } from '../../shared/lib/scannedContacts'
import { NOTE_MAX } from '../../shared/lib/noteLimits'
import { absorbServerContact } from '../../shared/lib/contactMeta'
import { emitContactsChanged } from '../../shared/lib/contactsEvents'
import {
  patchFriendNoteInCache,
  rememberContactInFriendsCache,
} from '../friends/lib/friendsCacheSync'
import { findIncomingScanContacts } from '../../shared/lib/scanIncoming'
import { isTabUserProfilePath, useTabNavigation } from '../../app/providers/TabNavigationContext'
import { Overlay } from '../../shared/ui/overlay/Overlay'
import {
  canOpenAppSettings,
  checkMediaPermission,
  openAppSettings,
} from '../../shared/lib/mediaPermissions'
import ScanerIcon from '../../assets/Scaner.svg'
import QrIcon from '../../assets/Qr.svg'
import { isUserId } from './qrPayload'

/** Временные кнопки превью экранов после скана — включи, чтобы снова проверить UI */
const SHOW_QR_RESULT_PREVIEW = false

/** Пауза после закрытия предупреждения (камера без доступа иначе зацикливает диалог) */
const SCAN_FAIL_COOLDOWN_MS = 5000

/** Окно контактов для «нас отсканировали»: как в App — иначе дефолтные 20 врут про новых */
const BADGE_CONTACTS_LIMIT = 200

/** 'scanning' — разбор ссылки из внешнего QR: камера не нужна, ждём ответ API */
type Screen = 'badge' | 'camera' | 'scanning' | 'result' | 'saved'

/** Откуда пришёл код: со сканера в приложении или по ссылке из камеры телефона */
type ScanSource = 'camera' | 'link'

/**
 * Причина неудачи скана. Отказ в доступе к камере сюда не входит: там ретрай
 * бесполезен, для него отдельный экран (см. cameraDenied).
 */
type ScanFailKind = 'camera' | 'code' | 'self' | 'network'

const SCAN_FAIL_CONTENT: Record<ScanFailKind, { title: string; text: string; action: string }> = {
  camera: {
    title: 'Такое иногда случается',
    text: 'Проверь, что QR в кадре целиком, и попробуй ещё раз',
    action: 'Попробовать еще раз',
  },
  code: {
    title: 'Незнакомый QR-код',
    text: 'Не удалось распознать QR. Проверь, что это код из «Нитей», и попробуй ещё раз',
    action: 'Попробовать еще раз',
  },
  self: {
    title: 'Это твой QR-код',
    text: 'Это твой собственный QR-код. Покажи его другому человеку или отсканируй его код',
    action: 'Понятно',
  },
  network: {
    title: 'Не получилось добавить',
    text: 'Проверь соединение с интернетом и попробуй ещё раз',
    action: 'Попробовать еще раз',
  },
}

export interface QrUser {
  name: string
  avatar: string
  id: string
  product?: string
}

type ScanResult = {
  isFriend: boolean
  friendName: string
  friendId: string
  friendAvatar?: string | null
}

interface QrModalProps {
  isOpen: boolean
  onClose: () => void
  user?: QrUser
  /**
   * Ссылка из личного QR, открытая камерой телефона (см. parseQrLink).
   * Модалка разбирает её тем же handleScan, что и скан своим сканером.
   */
  scanRequest?: string | null
  /** Ссылку забрали в работу — снаружи её можно погасить, чтобы не повторилась */
  onScanRequestHandled?: () => void
}

export const QrModal = ({
  isOpen,
  onClose,
  user,
  scanRequest = null,
  onScanRequestHandled,
}: QrModalProps) => {
  const { openUserProfile } = useTabNavigation()
  const location = useLocation()
  const [screen, setScreen] = useState<Screen>('badge')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scanFailOpen, setScanFailOpen] = useState(false)
  const [scanFailKind, setScanFailKind] = useState<ScanFailKind>('camera')
  const [cameraDenied, setCameraDenied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [cameraKey, setCameraKey] = useState(0)
  const [resolvedUser, setResolvedUser] = useState<QrUser | undefined>(user)
  const badgeBaselineRef = useRef<Set<string> | null>(null)
  const lastScanFailClosedAtRef = useRef(0)
  const scanFailCooldownTimerRef = useRef<number | null>(null)
  const screenRef = useRef<Screen>(screen)
  const isOpenRef = useRef(isOpen)
  const scanFailOpenRef = useRef(scanFailOpen)
  const userRef = useRef(user)
  /** Разбираемая ссылка из внешнего QR: по ней повторяем попытку после сбоя сети */
  const linkScanRef = useRef<string | null>(null)
  const scanSourceRef = useRef<ScanSource>('camera')
  /** Ссылку уже взяли в работу — второй раз тот же QR не добавляем */
  const handledScanRequestRef = useRef<string | null>(null)
  const onScanRequestHandledRef = useRef(onScanRequestHandled)
  onScanRequestHandledRef.current = onScanRequestHandled

  screenRef.current = screen
  isOpenRef.current = isOpen
  scanFailOpenRef.current = scanFailOpen
  userRef.current = user

  // Поля отдельно: сам объект user пересоздаётся на каждый рендер App
  const userId = user?.id
  const userName = user?.name
  const userAvatar = user?.avatar
  const userProduct = user?.product

  const clearScanFailCooldownTimer = useCallback(() => {
    if (scanFailCooldownTimerRef.current != null) {
      window.clearTimeout(scanFailCooldownTimerRef.current)
      scanFailCooldownTimerRef.current = null
    }
  }, [])

  /** Сброс только на открытие/закрытие: user — новый объект на каждый рендер App */
  useEffect(() => {
    if (isOpen) {
      setScreen('badge')
      setScanResult(null)
      setScanFailOpen(false)
      setScanFailKind('camera')
      setCameraDenied(false)
      setBusy(false)
      setSavingNote(false)
      setNoteError(null)
      badgeBaselineRef.current = null
      lastScanFailClosedAtRef.current = 0
      linkScanRef.current = null
      scanSourceRef.current = 'camera'
      clearScanFailCooldownTimer()
      setResolvedUser(userRef.current)
    } else {
      clearScanFailCooldownTimer()
    }
  }, [isOpen, clearScanFailCooldownTimer])

  /** Профиль догрузился, пока модалка открыта — обновляем бейдж, не сбрасывая экран */
  useEffect(() => {
    if (!isOpen || !userId) return
    setResolvedUser((prev) => {
      // useMe отвечает раньше useProfile, поэтому у пропа может быть id и пустое
      // имя/продукт. Пустым не затираем то, что уже дотянул фолбэк /api/me.
      const base = prev?.id === userId ? prev : undefined
      const next: QrUser = {
        id: userId,
        name: userName || base?.name || '',
        avatar: userAvatar || base?.avatar || '',
        product: userProduct || base?.product,
      }
      return base &&
        base.name === next.name &&
        base.avatar === next.avatar &&
        base.product === next.product
        ? base
        : next
    })
  }, [isOpen, userId, userName, userAvatar, userProduct])

  /** Если id ещё нет (типично сразу после логина) — дотягиваем /api/me */
  useEffect(() => {
    if (!isOpen) return
    if (isUserId(resolvedUser?.id)) return

    let cancelled = false
    void (async () => {
      try {
        const me = await getMe()
        if (cancelled || !me?.id) return
        const name = [me.firstName, me.lastName].filter(Boolean).join(' ')
        setResolvedUser((prev) => ({
          name: name || prev?.name || '',
          avatar: me.photoUrl || prev?.avatar || '',
          id: me.id,
          product: me.speciality || prev?.product,
        }))
      } catch {
        // placeholder в QrBadge
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, resolvedUser?.id])

  /** Снимок контактов при входе на экран «мой QR» — ловим только новых (нас отсканировали). */
  useEffect(() => {
    if (!isOpen || screen !== 'badge') return
    // Возврат на бейдж (бейдж → камера → бейдж): снимок этого открытия уже есть
    // и он валиден. Пересевать его нельзя — тот, кто отсканировал нас, пока была
    // открыта камера, попал бы сразу в базу и «новым» его уже не посчитать.
    if (badgeBaselineRef.current) return

    let cancelled = false
    void (async () => {
      try {
        const contacts = await listContacts({ limit: BADGE_CONTACTS_LIMIT, offset: 0 })
        if (cancelled) return
        badgeBaselineRef.current = new Set(contacts.map((c) => c.user.id))
      } catch {
        // База так и осталась неизвестной — её возьмёт первый удачный poll.
        // Ничего не затираем: пустой снапшот выдал бы старые контакты за новые.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, screen])

  /** Пока показываем свой QR — ловим, когда нас отсканировали (новый контакт). */
  useEffect(() => {
    if (!isOpen || screen !== 'badge') return

    let cancelled = false

    const poll = async () => {
      try {
        const contacts = await listContacts({ limit: BADGE_CONTACTS_LIMIT, offset: 0 })
        if (cancelled) return

        const baseline = badgeBaselineRef.current
        if (!baseline) {
          // Снапшота нет (ошибка сети) — берём за базу первый удачный ответ
          badgeBaselineRef.current = new Set(contacts.map((c) => c.user.id))
          return
        }

        const scannedIds = listScannedContactIds()
        const incoming = findIncomingScanContacts(contacts, baseline, scannedIds)
        if (incoming.length === 0) return

        const first = incoming[0]
        baseline.add(first.userId)
        markScannedContact(first.userId)
        emitContactsChanged()

        setScanResult({
          isFriend: false,
          friendName: first.name,
          friendId: first.userId,
          friendAvatar: first.avatarUrl,
        })
        setScreen('result')
      } catch {
        // ignore poll errors
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), 4000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [isOpen, screen])

  const openScanFailDialog = useCallback(() => {
    // Диалог живёт над сканером или над разбором внешней ссылки; на бейдже и на
    // карточке результата ему делать нечего
    if (!isOpenRef.current) return
    if (screenRef.current !== 'camera' && screenRef.current !== 'scanning') return
    clearScanFailCooldownTimer()
    setScanFailOpen(true)
  }, [clearScanFailCooldownTimer])

  /**
   * @param kind — что именно не получилось: от этого зависит текст диалога.
   * @param force — сразу показать (ошибка после действия пользователя: плохой QR, API).
   * Без force — кулдаун после закрытия (сбой запуска камеры).
   */
  const showScanFail = useCallback(
    (kind: ScanFailKind, opts?: { force?: boolean }) => {
      setBusy(false)
      // Ссылку из внешнего QR разбираем без камеры: включать её ради диалога об
      // ошибке нельзя — это лишний запрос доступа и пустой экран под диалогом.
      if (scanSourceRef.current !== 'link') {
        screenRef.current = 'camera'
        setScreen('camera')
      }

      // Диалог уже на экране — не подменяем текст под пальцем
      if (scanFailOpenRef.current) return
      setScanFailKind(kind)

      const force = opts?.force === true
      const elapsed = Date.now() - lastScanFailClosedAtRef.current
      const remaining = SCAN_FAIL_COOLDOWN_MS - elapsed

      if (!force && lastScanFailClosedAtRef.current > 0 && remaining > 0) {
        if (scanFailCooldownTimerRef.current == null) {
          scanFailCooldownTimerRef.current = window.setTimeout(() => {
            scanFailCooldownTimerRef.current = null
            openScanFailDialog()
          }, remaining)
        }
        return
      }

      openScanFailDialog()
    },
    [openScanFailDialog],
  )

  const dismissScanFail = useCallback(() => {
    lastScanFailClosedAtRef.current = Date.now()
    clearScanFailCooldownTimer()
    setScanFailOpen(false)
    setBusy(false)
  }, [clearScanFailCooldownTimer])

  const restartScanner = useCallback(() => {
    dismissScanFail()
    setCameraKey((k) => k + 1)
  }, [dismissScanFail])

  /** Доступ к камере запрещён — вместо диалога с ретраем показываем свой экран */
  const handleCameraDenied = useCallback(() => {
    clearScanFailCooldownTimer()
    setScanFailOpen(false)
    setBusy(false)
    setCameraDenied(true)
  }, [clearScanFailCooldownTimer])

  /**
   * Пользователь ушёл в Настройки и вернулся. iOS обычно перезапускает
   * приложение после смены разрешения, но если не перезапустил — поднимаем
   * сканер сами, чтобы не заставлять закрывать и открывать модалку.
   */
  useEffect(() => {
    if (!isOpen || !cameraDenied) return

    let cancelled = false
    let handle: PluginListenerHandle | null = null

    const recheck = async () => {
      const state = await checkMediaPermission('camera')
      // 'unknown' — веб или молчащий плагин: пробуем стартовать, решит getUserMedia
      if (cancelled || state === 'denied') return
      setCameraDenied(false)
      setCameraKey((k) => k + 1)
    }

    void (async () => {
      try {
        // На вебе этот же listener живёт на visibilitychange (@capacitor/app/web)
        const listener = await App.addListener('resume', () => void recheck())
        if (cancelled) {
          void listener.remove()
          return
        }
        handle = listener
      } catch {
        // плагин недоступен — останется ручной путь «закрыть и открыть заново»
      }
    })()

    return () => {
      cancelled = true
      void handle?.remove()
    }
  }, [isOpen, cameraDenied])

  /**
   * Один и тот же путь для скана своим сканером и для ссылки из личного QR,
   * открытой камерой телефона: контакт создаётся, 409 показывает «уже в Нитях»,
   * дальше — та же карточка результата.
   */
  const handleScan = useCallback(
    async (data: string | null, source: ScanSource = 'camera') => {
      scanSourceRef.current = source
      linkScanRef.current = source === 'link' ? data : null

      if (!data?.trim()) {
        showScanFail('code', { force: true })
        return
      }

      const payload = parseQrPayload(data)
      if (!payload) {
        showScanFail('code', { force: true })
        return
      }

      // resolvedUser, а не prop: сразу после логина id приезжает только из /api/me
      if (resolvedUser?.id && payload.id === resolvedUser.id) {
        showScanFail('self', { force: true })
        return
      }

      setBusy(true)

      try {
        const contact = await createContact({ contactId: payload.id })
        const friendId = contact.user?.id || payload.id
        absorbServerContact(contact)
        // Локальная метка со своей датой — на случай старого бэка без source
        markScannedContact(friendId)
        void rememberContactInFriendsCache(contact)
        emitContactsChanged()
        const friendName =
          [contact.user?.firstName, contact.user?.lastName].filter(Boolean).join(' ') ||
          payload.name ||
          'Новый контакт'

        setScanResult({
          isFriend: false,
          friendName,
          friendId,
          friendAvatar: contact.user?.photoUrl,
        })
        clearScanFailCooldownTimer()
        setScanFailOpen(false)
        setScreen('result')
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 409) {
          markScannedContact(payload.id)
          emitContactsChanged()
          // Связь уже есть — показываем настоящие имя и фото из существующего
          // контакта, а не заглушку (раньше сюда всегда прилетал null)
          let existing: Awaited<ReturnType<typeof getContact>> = null
          try {
            existing = await getContact(payload.id)
            absorbServerContact(existing)
          } catch {
            // не смогли достать контакт — останется имя из QR, а фото возьмётся
            // из кэша (см. friendAvatar ниже)
          }
          const friendName =
            [existing?.user?.firstName, existing?.user?.lastName].filter(Boolean).join(' ') ||
            payload.name ||
            'Этот человек'
          setScanResult({
            isFriend: true,
            friendName,
            friendId: existing?.user?.id || payload.id,
            // Контакт есть — отдаём его photoUrl как есть (null = «фото нет»).
            // Контакт не дочитался (сеть/404) — undefined, а не null: null для
            // UserAvatar значит «API сказала, фото нет», и он стёр бы кэш
            // аватарки (blob, IndexedDB, working URL) живому человеку с фото.
            friendAvatar: existing?.user ? existing.user.photoUrl : undefined,
          })
          clearScanFailCooldownTimer()
          setScanFailOpen(false)
          setScreen('result')
          return
        }

        showScanFail('network', { force: true })
      } finally {
        setBusy(false)
      }
    },
    [showScanFail, resolvedUser?.id, clearScanFailCooldownTimer],
  )

  /**
   * Ссылка из внешнего QR: разбираем её тем же handleScan. Ждём свой id —
   * без него не отличить собственный QR от чужого (после холодного старта он
   * приезжает из /api/me отдельным запросом, см. эффект выше).
   */
  useEffect(() => {
    if (!scanRequest) {
      // Ссылку погасили снаружи: тот же QR, отсканированный ещё раз, должен сработать снова
      handledScanRequestRef.current = null
      return
    }
    if (!isOpen) return
    if (handledScanRequestRef.current === scanRequest) return
    if (!isUserId(resolvedUser?.id)) return

    handledScanRequestRef.current = scanRequest
    onScanRequestHandledRef.current?.()
    setScreen('scanning')
    screenRef.current = 'scanning'
    void handleScan(scanRequest, 'link')
  }, [isOpen, scanRequest, resolvedUser?.id, handleScan])

  /**
   * «Попробовать ещё раз» в диалоге. Для внешней ссылки камеру поднимать нечего:
   * повторяем ровно тот же код (типичный случай — упавшая сеть).
   */
  const retryScan = useCallback(() => {
    dismissScanFail()
    const pendingLink = linkScanRef.current
    if (pendingLink) {
      setScreen('scanning')
      screenRef.current = 'scanning'
      void handleScan(pendingLink, 'link')
      return
    }
    setScreen('camera')
    setCameraKey((k) => k + 1)
  }, [dismissScanFail, handleScan])

  const handleError = useCallback(
    (err: unknown) => {
      console.error('Ошибка сканирования', err)
      showScanFail('camera')
    },
    [showScanFail],
  )

  const goToBadge = () => {
    dismissScanFail()
    lastScanFailClosedAtRef.current = 0
    setScreen('badge')
  }

  const openCamera = () => {
    dismissScanFail()
    lastScanFailClosedAtRef.current = 0
    // Дальше сканируем сами: ретрай больше не должен вести на внешнюю ссылку
    linkScanRef.current = null
    scanSourceRef.current = 'camera'
    // Доступ могли выдать между заходами — начинаем с чистого листа
    setCameraDenied(false)
    setCameraKey((k) => k + 1)
    setScreen('camera')
  }

  const previewScanResult = (isFriend: boolean) => {
    setScanFailOpen(false)
    setScanResult({
      isFriend,
      friendName: isFriend ? 'Алексей Смирнов' : 'Мария Иванова',
      friendId: '',
      friendAvatar: null,
    })
    setScreen('result')
  }

  const handleClose = () => onClose()

  /**
   * Кнопка в диалоге ошибки. Со сканера это «попробовать ещё раз». Для ссылки из
   * внешнего QR повтор осмыслен только при сбое сети: собственный QR и
   * нечитаемый код от повтора не исправятся — просто закрываем модалку, под ней
   * уже открыт профиль из ссылки.
   */
  const handleScanFailAction = () => {
    if (linkScanRef.current && scanFailKind !== 'network') {
      dismissScanFail()
      handleClose()
      return
    }
    retryScan()
  }

  const handleSkipNote = () => {
    handleClose()
  }

  const handleGoToProfile = () => {
    const id = scanResult?.friendId?.trim()
    handleClose()
    if (!id) return

    /**
     * QR, снятый системной камерой телефона, открывает модалку поверх уже
     * открытого профиля этого же человека (ссылка /profile/<id>?qr=1 сначала
     * редиректит на профиль). Тогда «Перейти в профиль» — это просто закрыть
     * модалку: лишняя навигация только ломает историю кнопки «Назад».
     */
    const alreadyHere =
      isTabUserProfilePath(location.pathname) &&
      location.pathname.replace(/\/$/, '').endsWith(`/u/${encodeURIComponent(id)}`)
    if (alreadyHere) return

    openUserProfile(id)
  }

  const handleSaveNote = async (note: string) => {
    if (!scanResult?.friendId) {
      setScreen('saved')
      return
    }

    const trimmed = note.trim()
    if (!trimmed) {
      handleClose()
      return
    }

    setSavingNote(true)
    setNoteError(null)
    try {
      await updateContact(scanResult.friendId, { note: trimmed.slice(0, NOTE_MAX) })
      patchFriendNoteInCache(scanResult.friendId, trimmed.slice(0, NOTE_MAX))
      emitContactsChanged()
      setScreen('saved')
    } catch {
      // Не уводим на «Сохранили» — текст остаётся в поле, можно повторить
      setNoteError('Не получилось сохранить заметку. Попробуй ещё раз')
    } finally {
      setSavingNote(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className={`${styles.overlay} ${screen === 'camera' ? styles.overlayCamera : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div
        className={styles.modal}
        onClick={(e) => {
          if (screen === 'badge') {
            if (e.target === e.currentTarget) handleClose()
            return
          }
          e.stopPropagation()
        }}
      >
        {screen === 'badge' && <Lanyard />}

        {screen === 'badge' && (
          <button type="button" className={styles.closeBtn} onClick={handleClose}>
            <FiX size={28} />
          </button>
        )}

        <div
          className={styles.content}
          onClick={(e) => {
            if (screen === 'badge' && e.target === e.currentTarget) handleClose()
          }}
        >
          {screen === 'badge' && (
            <>
              <QrBadge user={resolvedUser} />
              {SHOW_QR_RESULT_PREVIEW ? (
                <div className={styles.previewBtns}>
                  <button
                    type="button"
                    className={styles.previewBtn}
                    onClick={() => previewScanResult(true)}
                  >
                    Уже в Нитях
                  </button>
                  <button
                    type="button"
                    className={styles.previewBtn}
                    onClick={() => previewScanResult(false)}
                  >
                    Новый контакт
                  </button>
                </div>
              ) : (
                <button type="button" className={styles.scanBtn} onClick={openCamera}>
                  <img src={ScanerIcon} alt="" />
                  <span>Отсканировать QR друга</span>
                </button>
              )}
            </>
          )}

          {screen === 'camera' && (
            <>
              <div className={styles.cameraWrapper}>
                <button
                  type="button"
                  className={`${styles.closeBtn} ${styles.closeBtnCamera}`}
                  onClick={handleClose}
                >
                  <FiX size={28} />
                </button>
                {cameraDenied ? (
                  <div
                    className={styles.cameraDenied}
                    role="alertdialog"
                    aria-labelledby="qr-camera-denied-title"
                    aria-describedby="qr-camera-denied-text"
                  >
                    <h3 id="qr-camera-denied-title" className={styles.cameraDeniedTitle}>
                      Нет доступа к камере
                    </h3>
                    <p id="qr-camera-denied-text" className={styles.cameraDeniedText}>
                      Чтобы сканировать QR, разреши доступ к камере: Настройки → Нити → Камера
                    </p>
                    {canOpenAppSettings() && (
                      <button
                        type="button"
                        className={styles.cameraDeniedBtn}
                        onClick={() => {
                          openAppSettings()
                        }}
                      >
                        Открыть Настройки
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${styles.cameraDeniedBtn} ${styles.cameraDeniedBtnSecondary}`}
                      onClick={handleClose}
                    >
                      Закрыть
                    </button>
                  </div>
                ) : (
                  <>
                    <QrCamera
                      key={cameraKey}
                      onScan={(data) => void handleScan(data)}
                      onError={handleError}
                      onPermissionDenied={handleCameraDenied}
                      paused={busy || scanFailOpen}
                    />
                    {busy && (
                      <div className={styles.scanBusy}>
                        <p>Добавляем в Нити…</p>
                      </div>
                    )}
                    <button
                      type="button"
                      className={styles.cameraScanBtn}
                      onClick={restartScanner}
                      aria-label="Сканировать"
                    >
                      <span className={styles.cameraScanBtnInner} />
                    </button>
                  </>
                )}
              </div>
              <button type="button" className={styles.cameraActionBtn} onClick={goToBadge}>
                <img src={QrIcon} className={styles.cameraActionIcon} alt="" />
                <span>Показать мой QR</span>
              </button>
            </>
          )}

          {screen === 'scanning' && (
            <>
              <Lanyard />
              <button type="button" className={styles.closeBtn} onClick={handleClose}>
                <FiX size={28} />
              </button>
              <p className={styles.scanPending} role="status">
                Добавляем в Нити…
              </p>
            </>
          )}

          {screen === 'result' && <Lanyard />}

          {screen === 'result' && (
            <button type="button" className={styles.closeBtn} onClick={handleClose}>
              <FiX size={28} />
            </button>
          )}

          {screen === 'result' && scanResult && (
            <QrResult
              isFriend={scanResult.isFriend}
              friendName={scanResult.friendName}
              friendId={scanResult.friendId}
              friendAvatar={scanResult.friendAvatar}
              onClose={handleClose}
              onSkip={handleSkipNote}
              onGoToProfile={handleGoToProfile}
              onSaveNote={handleSaveNote}
              saving={savingNote}
              error={noteError}
            />
          )}

          {screen === 'saved' && <Lanyard />}

          {screen === 'saved' && (
            <button type="button" className={styles.closeBtn} onClick={handleClose}>
              <FiX size={28} />
            </button>
          )}

          {screen === 'saved' && (
            <QrSaved
              onClose={handleClose}
              friendId={scanResult?.friendId}
              friendAvatar={scanResult?.friendAvatar}
              friendName={scanResult?.friendName}
            />
          )}
        </div>
      </div>

      {scanFailOpen &&
        createPortal(
          <Overlay centered elevated onBackdropClick={handleScanFailAction}>
            <div
              className={styles.scanFailDialog}
              role="alertdialog"
              aria-labelledby="qr-scan-fail-title"
              aria-describedby="qr-scan-fail-text"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <h3 id="qr-scan-fail-title" className={styles.scanFailTitle}>
                {SCAN_FAIL_CONTENT[scanFailKind].title}
              </h3>
              <p id="qr-scan-fail-text" className={styles.scanFailText}>
                {SCAN_FAIL_CONTENT[scanFailKind].text}
              </p>
              <button type="button" className={styles.scanFailBtn} onClick={handleScanFailAction}>
                {SCAN_FAIL_CONTENT[scanFailKind].action}
              </button>
            </div>
          </Overlay>,
          document.body,
        )}
    </div>
  )
}
