import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { isAuthenticated, getBffToken } from '../../api/client'
import {
  getMe,
  listEduPlaces,
  listKeySkills,
  listSocials,
  listSoftSkills,
  listWorkPlaces,
} from '../../api/Me'
import type { UserProfile } from '../../api/types'
import {
  clearStoredProfile,
  getStoredProfile,
  profilesEqual,
  saveStoredProfile,
} from '../../entities/profile/api/profileStorage'
import { buildProfileEditData } from '../../entities/profile/lib/apiMappers'
import { toUserError } from './userError'
import type { ProfileEditData } from '../../entities/profile/model/types'
import { emptyProfileEditData, normalizeProfileEditData } from '../../entities/profile/model/types'

type RefetchOpts = {
  silent?: boolean
  /** Уже известный user (из register) — не дергать API заново */
  user?: UserProfile | null
  /** Только списки (edu/socials/skills), скаляры профиля не трогаем и GET /api/me не вызываем */
  skipUser?: boolean
  /** Не грузить edu/work/socials/skills — после admin-login сессия ещё не для списков */
  skipLists?: boolean
}

type ProfileContextValue = {
  profile: ProfileEditData
  loading: boolean
  error: string | null
  refetch: (opts?: RefetchOpts) => Promise<ProfileEditData>
  setCachedProfile: (profile: ProfileEditData) => void
  clearCachedProfile: () => void
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

const applyIfChanged = (
  prev: ProfileEditData,
  next: ProfileEditData,
): ProfileEditData => {
  const normalized = normalizeProfileEditData(next)
  if (profilesEqual(prev, normalized)) return prev
  saveStoredProfile(normalized)
  return normalized
}

export const ProfileProvider = ({ children }: { children: ReactNode }) => {
  const initialCached = useRef(getStoredProfile()).current

  const [profile, setProfile] = useState<ProfileEditData>(
    () => initialCached ?? emptyProfileEditData(),
  )
  // Даже с кэшем ждём первый ответ сети, иначе формы гидратятся устаревшим product
  const [loading, setLoading] = useState(() => isAuthenticated())
  const [error, setError] = useState<string | null>(null)

  const setCachedProfile = useCallback((next: ProfileEditData) => {
    setProfile((prev) => applyIfChanged(prev, next))
  }, [])

  const clearCachedProfile = useCallback(() => {
    clearStoredProfile()
    setProfile(normalizeProfileEditData(emptyProfileEditData()))
    setError(null)
    setLoading(false)
  }, [])

  const refetch = useCallback(async (opts?: RefetchOpts): Promise<ProfileEditData> => {
    if (!isAuthenticated()) {
      setLoading(false)
      return getStoredProfile() ?? normalizeProfileEditData(emptyProfileEditData())
    }

    if (!opts?.silent) {
      setLoading(true)
    }
    setError(null)

    try {
      const hasUserOverride = opts != null && 'user' in opts
      const skipUser = Boolean(opts?.skipUser)
      const skipLists = Boolean(opts?.skipLists)

      const [user, education, work, socials, keySkills, softSkills] = await Promise.all([
        skipUser || hasUserOverride
          ? Promise.resolve(hasUserOverride ? (opts.user ?? null) : null)
          : getMe(),
        skipLists ? Promise.resolve([]) : listEduPlaces({ limit: 100 }),
        skipLists ? Promise.resolve([]) : listWorkPlaces({ limit: 100 }),
        skipLists ? Promise.resolve([]) : listSocials({ limit: 100 }),
        skipLists ? Promise.resolve([]) : listKeySkills({ limit: 100 }),
        skipLists ? Promise.resolve([]) : listSoftSkills({ limit: 100 }),
      ])

      if (skipUser && !hasUserOverride) {
        const lists = buildProfileEditData({ education, work, socials, keySkills, softSkills })
        let nextProfile = emptyProfileEditData()
        setProfile((prev) => {
          nextProfile = applyIfChanged(
            prev,
            normalizeProfileEditData({
              ...prev,
              education: lists.education,
              work: lists.work,
              socials: lists.socials,
              hardSkills: lists.hardSkills,
              softSkills: lists.softSkills,
            }),
          )
          return nextProfile
        })
        return nextProfile
      }

      const nextProfile = buildProfileEditData({
        user,
        education,
        work,
        socials,
        keySkills,
        softSkills,
      })

      setProfile((prev) => applyIfChanged(prev, nextProfile))
      return nextProfile
    } catch (err) {
      // В state кладём уже человекочитаемый текст: его рендерят страницы профиля,
      // а сюда прилетают транспортные строки вида «Network request failed (native GET …)».
      setError(toUserError(err, 'Не удалось загрузить профиль'))

      setProfile((prev) => {
        const hasData =
          Boolean(prev.firstName || prev.lastName || prev.about || prev.avatarUrl) ||
          prev.socials.length > 0 ||
          prev.education.length > 0 ||
          prev.work.length > 0 ||
          prev.hardSkills.length > 0 ||
          prev.softSkills.length > 0
        if (hasData) return prev
        return normalizeProfileEditData(emptyProfileEditData())
      })

      return getStoredProfile() ?? normalizeProfileEditData(emptyProfileEditData())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated()) {
      setLoading(false)
      return
    }
    // Dev/VITE_BFF: профиль подгружаем явно после кнопки входа, не на маунте.
    if (import.meta.env.DEV && getBffToken() === 'dev-proxy-bff') {
      setLoading(false)
      return
    }
    void refetch({ silent: Boolean(initialCached) })
  }, [refetch, initialCached])

  const value = useMemo(
    () => ({ profile, loading, error, refetch, setCachedProfile, clearCachedProfile }),
    [profile, loading, error, refetch, setCachedProfile, clearCachedProfile],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export const useProfile = () => {
  const context = useContext(ProfileContext)
  if (!context) {
    throw new Error('useProfile must be used within ProfileProvider')
  }
  return context
}
