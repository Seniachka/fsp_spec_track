import { sortEducationEntries } from '../lib/apiMappers'
import type { ProfileEditData } from '../model/types'
import { normalizeProfileEditData } from '../model/types'

const STORAGE_KEY = 'profile_data'

const durableAvatarUrl = (url: string | null | undefined): string | null => {
  const value = url?.trim() || null
  // blob:/data: не переживают reload и не должны попадать в кэш
  if (!value || value.startsWith('blob:') || value.startsWith('data:')) return null
  return value
}

export const getStoredProfile = (): ProfileEditData | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const normalized = normalizeProfileEditData(JSON.parse(raw) as Partial<ProfileEditData>)
    normalized.avatarUrl = durableAvatarUrl(normalized.avatarUrl)
    // Кэш мог быть записан старой версией — карточка ЦУ снова первой
    normalized.education = sortEducationEntries(normalized.education)
    return normalized
  } catch {
    return null
  }
}

export const saveStoredProfile = (profile: ProfileEditData): void => {
  try {
    const normalized = normalizeProfileEditData(profile)
    normalized.avatarUrl = durableAvatarUrl(normalized.avatarUrl)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // quota / private mode — игнорируем
  }
}

export const clearStoredProfile = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export const profilesEqual = (a: ProfileEditData, b: ProfileEditData): boolean =>
  JSON.stringify(normalizeProfileEditData(a)) === JSON.stringify(normalizeProfileEditData(b))
