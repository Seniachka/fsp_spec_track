import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Footer } from '../widgets/footer/ui/Footer'
import { QrModal } from '../pages/qr/QrModal'
import { parseQrLink } from '../pages/qr/qrPayload'
import { IncomingScanPrompt } from '../pages/qr/IncomingScanPrompt'
import { Toast } from '../shared/ui/toast/Toast'
import { useQr } from './providers/QrContext'
import { useProfile } from '../shared/lib/useProfile'
import { useMe } from '../shared/lib/useMe'
import { useModal } from './providers/ModalContext'
import { isAuthenticated } from '../api/client'
import { listContacts } from '../api/Contacts'
import { markScannedContact, listScannedContactIds } from '../shared/lib/scannedContacts'
import { absorbServerContacts } from '../shared/lib/contactMeta'
import {
  readKnownContactIds,
  seedKnownContactsIfEmpty,
  writeKnownContactIds,
} from '../shared/lib/incomingContacts'
import { findIncomingScanContacts } from '../shared/lib/scanIncoming'
import { emitContactsChanged } from '../shared/lib/contactsEvents'
import { shouldShowOpenInAppGate } from '../shared/lib/deepLinks'
import { OpenInAppGate } from '../pages/download/ui/OpenInAppGate'
import { TabNavigationProvider, isTabUserProfilePath } from './providers/TabNavigationContext'
import {
  rememberContactInFriendsCache,
  resetFriendsCacheSession,
  syncFriendsCacheOnce,
} from '../pages/friends/lib/friendsCacheSync'

const HIDE_FOOTER_PATHS = [
  '/profile/edit',
  '/profile/settings',
  '/search/filters',
  '/search/filters/hard-skills',
  '/search/filters/soft-skills',
  '/afisha/events',
  '/afisha/announcements',
  '/afisha/map',
]

export const App = () => {
  const location = useLocation()
  const { isQrModalOpen, openQrModal, closeQrModal } = useQr()
  const { profile } = useProfile()
  const { user: me } = useMe()
  const { isAnyModalOpen } = useModal()
  const [toast, setToast] = useState<string | null>(null)
  const [openInAppDismissed, setOpenInAppDismissed] = useState(false)
  const [qrScanLink, setQrScanLink] = useState<string | null>(null)
  const [incomingPrompt, setIncomingPrompt] = useState<{
    userId: string
    name: string
    avatarUrl?: string | null
  } | null>(null)
  const knownContactsRef = useRef<Set<string>>(new Set())
  const incomingQueueRef = useRef<Array<{ userId: string; name: string; avatarUrl?: string | null }>>([])

  useEffect(() => {
    setOpenInAppDismissed(false)
  }, [location.pathname])

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<string>
      const message = typeof custom.detail === 'string' ? custom.detail.trim() : ''
      if (message) setToast(message)
    }
    window.addEventListener('faculty:toast', handler as EventListener)
    return () => window.removeEventListener('faculty:toast', handler as EventListener)
  }, [])

  /**
   * Личный QR, отсканированный камерой телефона мимо приложения: ссылка с ?qr=1
   * (см. encodeQrPayload) приходит сюда универсальной ссылкой или niti:// через
   * DeepLinkListener, а с веб-гейта — обычным переходом. Такой скан обязан
   * сработать как скан своим сканером, поэтому запоминаем ссылку и отдаём её
   * QrModal. Обычная ссылка на профиль (без qr=1) сюда не попадает и просто
   * открывает профиль.
   *
   * location.key в зависимостях: повторный скан того же QR ведёт на тот же
   * адрес, и без ключа эффект бы не сработал второй раз.
   */
  useEffect(() => {
    const link = `${location.pathname}${location.search}`
    if (!parseQrLink(link)) return
    setQrScanLink(link)
  }, [location.pathname, location.search, location.key])

  /**
   * Ждём логин и онбординг: без токена контакт создавать нечем, а RequireAuth
   * сохраняет обратный путь вместе с ?qr=1 и вернёт нас сюда после входа.
   */
  useEffect(() => {
    if (!qrScanLink) return
    if (!isAuthenticated() || !me?.id) return
    if (location.pathname === '/' || location.pathname.startsWith('/onboarding')) return
    openQrModal()
  }, [qrScanLink, me?.id, location.pathname, openQrModal])

  const handleQrScanTaken = useCallback(() => setQrScanLink(null), [])

  const incomingPromptRef = useRef(incomingPrompt)
  const isAnyModalOpenRef = useRef(isAnyModalOpen)
  const isQrModalOpenRef = useRef(isQrModalOpen)
  incomingPromptRef.current = incomingPrompt
  isAnyModalOpenRef.current = isAnyModalOpen
  isQrModalOpenRef.current = isQrModalOpen

  useEffect(() => {
    if (!isAuthenticated() || !me?.id) {
      knownContactsRef.current = new Set()
      incomingQueueRef.current = []
      setIncomingPrompt(null)
      resetFriendsCacheSession()
      return
    }

    // Разовый sync нитей + полных профилей при входе в приложение
    void syncFriendsCacheOnce().catch(() => {
      // список подтянется при открытии Нитей / retry
    })

    let cancelled = false
    const pollContacts = async () => {
      if (document.hidden || isQrModalOpenRef.current) return
      try {
        const contacts = await listContacts({ limit: 200, offset: 0 })
        if (cancelled) return
        const scannedIds = listScannedContactIds()
        const apiIds = new Set(contacts.map((c) => c.user.id))

        if (seedKnownContactsIfEmpty(apiIds)) {
          // Первый опрос после входа — главная точка восстановления: метки
          // «встретились» и даты после «Выйти» есть только на сервере.
          absorbServerContacts(contacts)
          knownContactsRef.current = apiIds
          return
        }

        const persistedKnown = readKnownContactIds()
        const knownBefore = new Set([...persistedKnown, ...knownContactsRef.current])

        const incoming = findIncomingScanContacts(contacts, knownBefore, scannedIds)
        // Порядок с findIncomingScanContacts не важен: тот решает по source с бэка
        // и локальный набор, куда absorb пишет и входящие связи, уже не спрашивает.
        absorbServerContacts(contacts)
        for (const item of incoming) {
          knownContactsRef.current.add(item.userId)
          markScannedContact(item.userId)
          const contact = contacts.find((c) => c.user.id === item.userId)
          if (contact) void rememberContactInFriendsCache(contact)
          emitContactsChanged()
          incomingQueueRef.current.push(item)
        }

        writeKnownContactIds(apiIds)
        knownContactsRef.current = apiIds

        if (
          !incomingPromptRef.current &&
          !isAnyModalOpenRef.current &&
          !isQrModalOpenRef.current &&
          incomingQueueRef.current.length > 0
        ) {
          const next = incomingQueueRef.current.shift() ?? null
          if (next) setIncomingPrompt(next)
        }
      } catch {
        // ignore polling errors
      }
    }

    void pollContacts()
    // 15s: раньше эффект зависел от модалок и перезапускал опрос; плюс QR сам поллит.
    const timer = window.setInterval(() => void pollContacts(), 15_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [me?.id])

  useEffect(() => {
    if (incomingPrompt || isAnyModalOpen || isQrModalOpen) return
    const next = incomingQueueRef.current.shift() ?? null
    if (next) setIncomingPrompt(next)
  }, [incomingPrompt, isAnyModalOpen, isQrModalOpen])

  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  // id из профиля (после register/refetch) или из /api/me — иначе QR на онбординге пустой
  const userId = profile.id || me?.id || ''

  const hideFooter =
    isAnyModalOpen ||
    location.pathname === '/' ||
    location.pathname.startsWith('/onboarding') ||
    location.pathname.startsWith('/legal') ||
    location.pathname.startsWith('/support') ||
    location.pathname.startsWith('/download') ||
    isTabUserProfilePath(location.pathname) ||
    location.pathname.startsWith('/profile/settings/legal') ||
    HIDE_FOOTER_PATHS.some(
      (path) => location.pathname === path || location.pathname.startsWith(`${path}/`),
    )

  const showOpenInAppGate =
    !openInAppDismissed && shouldShowOpenInAppGate(location.pathname)

  if (showOpenInAppGate) {
    return (
      <OpenInAppGate
        pathname={location.pathname}
        search={location.search}
        onContinueInBrowser={() => setOpenInAppDismissed(true)}
      />
    )
  }

  return (
    <TabNavigationProvider>
      <Outlet />
      {!hideFooter && <Footer />}
      <QrModal
        isOpen={isQrModalOpen}
        onClose={closeQrModal}
        scanRequest={qrScanLink}
        onScanRequestHandled={handleQrScanTaken}
        user={{
          name,
          avatar: profile.avatarUrl || me?.photoUrl || '',
          id: userId,
          product: profile.product,
        }}
      />
      {incomingPrompt && !isQrModalOpen && !isAnyModalOpen && (
        <IncomingScanPrompt
          userId={incomingPrompt.userId}
          name={incomingPrompt.name}
          avatarUrl={incomingPrompt.avatarUrl}
          onClose={() => setIncomingPrompt(null)}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </TabNavigationProvider>
  )
}
