import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { USER_SCOPED_STORES_CLEARED_EVENT } from '../../shared/lib/userScopedStorage'

export type MainTab = 'afisha' | 'search' | 'friends' | 'profile'

export const TAB_ROOTS: Record<MainTab, string> = {
  afisha: '/afisha',
  search: '/search',
  friends: '/friends',
  profile: '/profile',
}

/** Оба ключа пер-аккаунтные — их чистит clearUserScopedStores (SESSION_SCOPED_KEYS) */
const PATHS_KEY = 'faculty.tabPaths'
const LAST_TAB_KEY = 'faculty.lastMainTab'

type TabPaths = Record<MainTab, string>

type ProfileLocationState = {
  profileBackTo?: string
}

type TabNavigationValue = {
  activeTab: MainTab | null
  selectTab: (tab: MainTab) => void
  openUserProfile: (userId: string, fromTab?: MainTab) => void
  exitUserProfile: () => void
}

const TabNavigationContext = createContext<TabNavigationValue | null>(null)

const defaultPaths = (): TabPaths => ({
  afisha: TAB_ROOTS.afisha,
  search: TAB_ROOTS.search,
  friends: TAB_ROOTS.friends,
  profile: TAB_ROOTS.profile,
})

const loadPaths = (): TabPaths => {
  try {
    const raw = sessionStorage.getItem(PATHS_KEY)
    if (!raw) return defaultPaths()
    const parsed = JSON.parse(raw) as Partial<TabPaths>
    return { ...defaultPaths(), ...parsed }
  } catch {
    return defaultPaths()
  }
}

const savePaths = (paths: TabPaths) => {
  try {
    sessionStorage.setItem(PATHS_KEY, JSON.stringify(paths))
  } catch {
    // ignore
  }
}

export const resolveMainTab = (pathname: string): MainTab | null => {
  if (pathname === '/search' || pathname.startsWith('/search/')) return 'search'
  if (pathname === '/friends' || pathname.startsWith('/friends/')) return 'friends'
  if (pathname === '/afisha' || pathname.startsWith('/afisha/')) return 'afisha'
  if (pathname === '/profile' || pathname.startsWith('/profile/')) return 'profile'
  return null
}

/** Чужой профиль внутри таба: /search/u/:id, /afisha/announcements/u/:id, … */
export const isTabUserProfilePath = (pathname: string): boolean =>
  /^\/(search|friends|afisha|profile)\/u\/[^/]+\/?$/.test(pathname) ||
  /^\/afisha\/(announcements|events)\/u\/[^/]+\/?$/.test(pathname)

export const tabUserProfilePath = (tab: MainTab, userId: string, fromPath = ''): string => {
  const id = encodeURIComponent(userId)
  if (tab === 'afisha') {
    if (fromPath.startsWith('/afisha/announcements')) {
      return `/afisha/announcements/u/${id}`
    }
    if (fromPath.startsWith('/afisha/events')) {
      return `/afisha/events/u/${id}`
    }
    return `/afisha/u/${id}`
  }
  const host = tab === 'profile' ? 'profile' : tab
  return `/${host}/u/${id}`
}

/** backTo хранится вместе с query — для проверок нужен только путь */
const pathnameOf = (value: string): string => value.split('?')[0] || value

export const readLastMainTab = (): MainTab => {
  try {
    const value = sessionStorage.getItem(LAST_TAB_KEY)
    if (value === 'afisha' || value === 'search' || value === 'friends' || value === 'profile') {
      return value
    }
  } catch {
    // ignore
  }
  return 'search'
}

export const TabNavigationProvider = ({ children }: { children: ReactNode }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const pathsRef = useRef<TabPaths>(loadPaths())

  const activeTab = resolveMainTab(location.pathname)

  // Логаут/смена аккаунта: пути табов в памяти ведут на чужие профили — сбрасываем.
  // sessionStorage чистит сам clearUserScopedStores.
  useEffect(() => {
    const onCleared = () => {
      pathsRef.current = defaultPaths()
    }
    window.addEventListener(USER_SCOPED_STORES_CLEARED_EVENT, onCleared)
    return () => window.removeEventListener(USER_SCOPED_STORES_CLEARED_EVENT, onCleared)
  }, [])

  useEffect(() => {
    if (!activeTab) return
    pathsRef.current = {
      ...pathsRef.current,
      [activeTab]: `${location.pathname}${location.search}`,
    }
    savePaths(pathsRef.current)
    try {
      sessionStorage.setItem(LAST_TAB_KEY, activeTab)
    } catch {
      // ignore
    }
  }, [activeTab, location.pathname, location.search])

  const selectTab = useCallback(
    (tab: MainTab) => {
      const root = TAB_ROOTS[tab]

      if (activeTab === tab) {
        // Повторный тап по активному разделу — выходим из профиля / вложенного экрана к корню.
        if (location.pathname !== root || location.search) {
          pathsRef.current = { ...pathsRef.current, [tab]: root }
          savePaths(pathsRef.current)
          navigate(root)
        }
        return
      }

      const target = pathsRef.current[tab] || root
      navigate(target)
    },
    [activeTab, location.pathname, location.search, navigate],
  )

  const openUserProfile = useCallback(
    (userId: string, fromTab?: MainTab) => {
      const id = userId.trim()
      if (!id) return
      const tab = fromTab ?? activeTab ?? readLastMainTab()
      const root = TAB_ROOTS[tab]

      const target = tabUserProfilePath(tab, id, location.pathname)

      /**
       * Личный QR, снятый системной камерой телефона: ссылка /profile/<id>?qr=1
       * сначала редиректит на сам профиль, и уже поверх него открывается QrModal.
       * Если в такой ситуации взять текущий адрес как backTo, профиль запомнит
       * «назад» в самого себя — кнопка «Назад» уведёт навигацию в себя, роут не
       * сменится, а профиль останется висеть над погашенным табом (экран без
       * футера, на котором ничего не нажимается). Отсекаем только эту самоссылку:
       * наследуем backTo открытого профиля, а если его нет — корень таба. Переход
       * на ДРУГОЙ профиль (модалка входящего скана поверх профиля A) остаётся
       * обычным звеном цепочки «Назад».
       */
      let backTo = `${location.pathname}${location.search}`
      if (pathnameOf(backTo) === target) {
        backTo = (location.state as ProfileLocationState | null)?.profileBackTo ?? root
      }
      if (pathnameOf(backTo) === target) backTo = root

      navigate(target, {
        state: { profileBackTo: backTo } satisfies ProfileLocationState,
        // Тот же пользователь, что уже открыт — не плодим одинаковые записи истории
        replace: target === location.pathname,
      })
    },
    [activeTab, location.pathname, location.search, location.state, navigate],
  )

  const exitUserProfile = useCallback(() => {
    const saved = (location.state as ProfileLocationState | null)?.profileBackTo
    const tab = resolveMainTab(location.pathname)

    // Страховка на случай уже лежащих в истории «плохих» state (см. openUserProfile):
    // backTo на собственный адрес считаем отсутствующим — иначе «Назад» навигирует
    // в себя, роут не меняется и профиль зависает поверх погашенного таба.
    const state = saved && pathnameOf(saved) !== location.pathname ? saved : undefined

    if (state && resolveMainTab(state) === tab) {
      pathsRef.current = {
        ...pathsRef.current,
        ...(tab ? { [tab]: state } : {}),
      }
      savePaths(pathsRef.current)
      navigate(state)
      return
    }

    if (tab) {
      const root = TAB_ROOTS[tab]
      pathsRef.current = { ...pathsRef.current, [tab]: root }
      savePaths(pathsRef.current)
      navigate(root)
      return
    }

    navigate(-1)
  }, [location.pathname, location.state, navigate])

  const value = useMemo(
    () => ({ activeTab, selectTab, openUserProfile, exitUserProfile }),
    [activeTab, selectTab, openUserProfile, exitUserProfile],
  )

  return <TabNavigationContext.Provider value={value}>{children}</TabNavigationContext.Provider>
}

export const useTabNavigation = (): TabNavigationValue => {
  const ctx = useContext(TabNavigationContext)
  if (!ctx) {
    throw new Error('useTabNavigation must be used within TabNavigationProvider')
  }
  return ctx
}
