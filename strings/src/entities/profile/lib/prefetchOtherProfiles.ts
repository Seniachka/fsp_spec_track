import {
  listStudentEduPlaces,
  listStudentKeySkills,
  listStudentSoftSkills,
  listStudentSocials,
  listStudentWorkPlaces,
} from '../../../api'
import type { EduPlace, UserProfile } from '../../../api/types'
import {
  getCachedOtherProfile,
  isSameStorageOwner,
  readStorageOwnerId,
  setCachedOtherProfiles,
  type CachedOtherProfile,
} from '../api/otherProfileStorage'
import {
  mapEduPlaceToUi,
  mapSocialToUi,
  mapUserSkillToUi,
  mapWorkPlaceToUi,
  sortEducationEntries,
} from './apiMappers'
import type { EducationEntry, Skill, SocialLink, WorkEntry } from '../model/types'

export type PrefetchOtherProfileInput = {
  user: UserProfile
  isSaved: boolean
  isContact: boolean
  note: string
}

export type PrefetchOtherProfilesOptions = {
  concurrency?: number
  /** Не дергать API, если профиль уже в localStorage */
  skipIfCached?: boolean
  /** Вызывается сразу после загрузки edu-places (для подписи в Нитях) */
  onEduLoaded?: (userId: string, places: EduPlace[]) => void
}

const fetchOne = async (
  input: PrefetchOtherProfileInput,
  onEduLoaded?: PrefetchOtherProfilesOptions['onEduLoaded'],
): Promise<CachedOtherProfile> => {
  const { user, isSaved, isContact, note } = input

  const [eduPlaces, workPlaces, keySkills, soft, socialList] = await Promise.all([
    listStudentEduPlaces(user.id).catch(() => [] as EduPlace[]),
    listStudentWorkPlaces(user.id).catch(() => []),
    listStudentKeySkills(user.id).catch(() => []),
    listStudentSoftSkills(user.id).catch(() => []),
    listStudentSocials(user.id).catch(() => []),
  ])

  onEduLoaded?.(user.id, eduPlaces)

  return {
    user,
    education: sortEducationEntries(
      eduPlaces.map(mapEduPlaceToUi).filter(Boolean) as EducationEntry[],
    ),
    work: workPlaces.map(mapWorkPlaceToUi).filter(Boolean) as WorkEntry[],
    hardSkills: keySkills.map((s) => mapUserSkillToUi(s, 'hard')).filter(Boolean) as Skill[],
    softSkills: soft.map((s) => mapUserSkillToUi(s, 'soft')).filter(Boolean) as Skill[],
    socials: socialList.map(mapSocialToUi).filter(Boolean) as SocialLink[],
    isSaved,
    isContact,
    note: note.trim(),
    cachedAt: Date.now(),
  }
}

/** Параллельно подгружает полные данные чужих профилей и пишет в localStorage */
export const prefetchOtherProfiles = async (
  inputs: PrefetchOtherProfileInput[],
  options: PrefetchOtherProfilesOptions = {},
): Promise<CachedOtherProfile[]> => {
  const concurrency = Math.max(1, options.concurrency ?? 4)
  const skipIfCached = Boolean(options.skipIfCached)
  if (!inputs.length) return []

  const unique = new Map<string, PrefetchOtherProfileInput>()
  for (const input of inputs) {
    const id = input.user?.id
    if (!id) continue
    if (skipIfCached && getCachedOtherProfile(id)) continue
    unique.set(id, input)
  }

  const queue = [...unique.values()]
  if (!queue.length) return []

  // Владелец сторов на момент старта: пока качаем профили, пользователь может
  // выйти или войти под другим аккаунтом — тогда ответы писать уже некуда.
  const ownerAtStart = readStorageOwnerId()

  const results: CachedOtherProfile[] = []
  let cursor = 0

  const worker = async () => {
    while (cursor < queue.length) {
      if (!isSameStorageOwner(ownerAtStart)) return
      const index = cursor
      cursor += 1
      const input = queue[index]
      try {
        const cached = await fetchOne(input, options.onEduLoaded)
        // Сессия могла смениться, пока летел запрос
        if (!isSameStorageOwner(ownerAtStart)) return
        results.push(cached)
        setCachedOtherProfiles([cached])
      } catch {
        // пропускаем одного пользователя — остальные всё равно кэшируем
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()),
  )

  return results
}
