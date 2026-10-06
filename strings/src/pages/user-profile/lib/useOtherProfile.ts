import { ApiRequestError } from '../../../api/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getStudent,
  listStudentEduPlaces,
  listStudentKeySkills,
  listStudentSoftSkills,
  listStudentSocials,
  listStudentWorkPlaces,
} from '../../../api'
import type { UserProfile } from '../../../api/types'
import {
  getCachedOtherProfile,
  isSameStorageOwner,
  readStorageOwnerId,
  setCachedOtherProfile,
} from '../../../entities/profile/api/otherProfileStorage'
import {
  mapEduPlaceToUi,
  mapSocialToUi,
  mapUserSkillToUi,
  mapWorkPlaceToUi,
  sortEducationEntries,
} from '../../../entities/profile/lib/apiMappers'
import type { EducationEntry, Skill, SocialLink, WorkEntry } from '../../../entities/profile/model/types'
import { absorbServerContact } from '../../../shared/lib/contactMeta'
import { getFriendsListCache } from '../../friends/lib/friendsListStorage'
import { useProfile } from '../../../shared/lib/useProfile'
import { toUserError } from '../../../shared/lib/userError'
import { findContactById } from './findContactById'
import { findSavedUserById } from './findSavedUserById'

export const isProfileContentEmpty = (user: UserProfile | null): boolean => {
  if (!user) return true
  return !user.speciality && !user.bio && !user.birthdate && !user.status
}

/**
 * Заметка живёт на контакте в кэше Нитей: он собирается из /api/me/contacts и
 * патчится при каждом сохранении. Кэш чужого профиля из выдачи поиска пишется с
 * пустой заметкой — иначе кнопка «заметка» не подсветилась бы при заходе из поиска.
 */
const noteFromFriendsCache = (userId: string | undefined): string | null => {
  if (!userId) return null
  const contact = getFriendsListCache()?.contacts.find((item) => item.id === userId)
  if (!contact) return null
  return contact.note?.trim() ?? ''
}

export const useOtherProfile = (userId: string | undefined) => {
  const navigate = useNavigate()
  const { profile: meProfile } = useProfile()
  const myId = meProfile.id?.trim() || null

  // Стартовый кэш читаем один раз за монтирование: getCachedOtherProfile парсит
  // весь стор (до 200 профилей), а нужен он только инициализаторам стейта.
  const [initialCache] = useState(() => (userId ? getCachedOtherProfile(userId) : null))

  const [activeUserId, setActiveUserId] = useState(userId)
  const [user, setUser] = useState<UserProfile | null>(() => initialCache?.user ?? null)
  const [education, setEducation] = useState<EducationEntry[]>(
    () => sortEducationEntries(initialCache?.education ?? []),
  )
  const [work, setWork] = useState<WorkEntry[]>(() => initialCache?.work ?? [])
  const [hardSkills, setHardSkills] = useState<Skill[]>(() => initialCache?.hardSkills ?? [])
  const [softSkills, setSoftSkills] = useState<Skill[]>(() => initialCache?.softSkills ?? [])
  const [socials, setSocials] = useState<SocialLink[]>(() => initialCache?.socials ?? [])
  const [isSaved, setIsSaved] = useState(() => initialCache?.isSaved ?? false)
  const [isContact, setIsContact] = useState(() => initialCache?.isContact ?? false)
  const [note, setNote] = useState(
    () => noteFromFriendsCache(userId) ?? initialCache?.note ?? '',
  )
  const [loading, setLoading] = useState(() => !initialCache)
  const [error, setError] = useState<string | null>(null)

  // Номер последнего запроса: ответ, стартовавший для прошлого userId, не должен
  // перезаписать данные текущего профиля.
  const requestIdRef = useRef(0)
  /** Для какого userId уже сходили за свежими скалярами поверх кэша */
  const refreshedIdRef = useRef<string | null>(null)

  // Синхронно подставляем кэш при смене userId (без вспышки чужого профиля)
  if (userId !== activeUserId) {
    // Профиль сменился — всё, что уже летит по сети, объявляем устаревшим
    requestIdRef.current += 1
    setActiveUserId(userId)
    const cached = userId ? getCachedOtherProfile(userId) : null
    setUser(cached?.user ?? null)
    setEducation(sortEducationEntries(cached?.education ?? []))
    setWork(cached?.work ?? [])
    setHardSkills(cached?.hardSkills ?? [])
    setSoftSkills(cached?.softSkills ?? [])
    setSocials(cached?.socials ?? [])
    setIsSaved(cached?.isSaved ?? false)
    setIsContact(cached?.isContact ?? false)
    setNote(noteFromFriendsCache(userId) ?? cached?.note ?? '')
    setLoading(!cached)
    setError(null)
  }

  /**
   * silent — тихое обновление поверх кэша (stale-while-revalidate): экран уже
   * что-то показывает, поэтому ни спиннера, ни экрана ошибки быть не должно.
   * При провале сети остаёмся на кэше — он всё ещё лучше пустого профиля.
   */
  const refetch = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!userId) return

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const isStale = () => requestIdRef.current !== requestId

    if (!silent) {
      setLoading(true)
      setError(null)
    }

    try {
      const ownerAtStart = readStorageOwnerId()
      const [student, savedLookup, lookup, eduPlaces, workPlaces, keySkills, soft, socialList] =
        await Promise.all([
          getStudent(userId),
          findSavedUserById(userId),
          findContactById(userId),
          // null — список дочитать не удалось (сеть/5xx). Не путать с [] —
          // «на сервере пусто»: ниже упавший список подменяется прежним из
          // кэша, а честно пустой перезаписывает его.
          listStudentEduPlaces(userId).catch(() => null),
          listStudentWorkPlaces(userId).catch(() => null),
          listStudentKeySkills(userId).catch(() => null),
          listStudentSoftSkills(userId).catch(() => null),
          listStudentSocials(userId).catch(() => null),
        ])

      const contact = lookup.contact
      // Метка «встретились» и дата с сервера — в локальные сторы: этот экран
      // часто первый, куда человек заходит после перезахода в аккаунт.
      // Но если за время запроса нажали «Выйти» — писать нельзя: сторы уже
      // вычищены (с добивками, см. userScopedStorage), и id контактов ушедшего
      // аккаунта воскресли бы поверх чистки.
      if (isSameStorageOwner(ownerAtStart)) absorbServerContact(contact)
      // Контакты/избранное дочитать не удалось — бейджи и заметку не сбрасываем,
      // оставляем то, что уже знаем про этот профиль.
      const prior = getCachedOtherProfile(userId)
      const known = lookup.complete && savedLookup.complete ? null : prior
      // Упавший запрос списка не должен стирать то, что уже показано и лежит в
      // кэше: тихий рефетч идёт при каждом открытии профиля, и один сбой сети
      // иначе «удалял» бы человеку навыки или соцсети до следующего захода.
      const nextEducation = eduPlaces
        ? sortEducationEntries(eduPlaces.map(mapEduPlaceToUi).filter(Boolean) as EducationEntry[])
        : sortEducationEntries(prior?.education ?? [])
      const nextWork = workPlaces
        ? (workPlaces.map(mapWorkPlaceToUi).filter(Boolean) as WorkEntry[])
        : (prior?.work ?? [])
      const nextHard = keySkills
        ? (keySkills.map((s) => mapUserSkillToUi(s, 'hard')).filter(Boolean) as Skill[])
        : (prior?.hardSkills ?? [])
      const nextSoft = soft
        ? (soft.map((s) => mapUserSkillToUi(s, 'soft')).filter(Boolean) as Skill[])
        : (prior?.softSkills ?? [])
      const nextSocials = socialList
        ? (socialList.map(mapSocialToUi).filter(Boolean) as SocialLink[])
        : (prior?.socials ?? [])
      // На кэш откатываемся отдельно по каждому списку: если контакты дочитаны,
      // «не контакт» — честный ответ, и подменять его прежним isContact/заметкой
      // из-за упавшего запроса ИЗБРАННОГО нельзя (иначе снятый на другом
      // устройстве бейдж «в Нитях» воскресает и уезжает обратно в кэш).
      const nextIsSaved = savedLookup.complete ? savedLookup.isSaved : Boolean(known?.isSaved)
      const nextIsContact = lookup.complete ? Boolean(contact) : Boolean(known?.isContact)
      const nextNote = lookup.complete ? (contact?.note?.trim() ?? '') : (known?.note ?? '')
      // Списки дочитать не удалось и прежней записи нет — про бейджи и заметку
      // мы ничего не знаем, показываем пустые значения только на этот заход.
      const contactStateKnown = lookup.complete || Boolean(known)
      const savedStateKnown = savedLookup.complete || Boolean(known)

      // Заведомо неполный результат в кэш не пишем: ложные «не контакт» /
      // «не в избранном» осели бы в localStorage и показывались бы при каждом
      // следующем заходе, пока не приедет ответ следующего рефетча.
      // isSameStorageOwner — тот же рубеж, что и у absorbServerContact выше:
      // ответ, пришедший после «Выйти», не должен воскресить профиль,
      // который ушедший аккаунт унёс с собой.
      if (contactStateKnown && savedStateKnown && isSameStorageOwner(ownerAtStart)) {
        setCachedOtherProfile({
          user: student,
          education: nextEducation,
          work: nextWork,
          hardSkills: nextHard,
          softSkills: nextSoft,
          socials: nextSocials,
          isSaved: nextIsSaved,
          isContact: nextIsContact,
          note: nextNote,
          cachedAt: Date.now(),
        })
      }

      // Пока ходили в сеть, экран мог переехать на другой профиль
      if (isStale()) return

      setUser(student)
      setEducation(nextEducation)
      setWork(nextWork)
      setHardSkills(nextHard)
      setSoftSkills(nextSoft)
      setSocials(nextSocials)
      setIsSaved(nextIsSaved)
      setIsContact(nextIsContact)
      setNote(nextNote)
    } catch (err) {
      if (isStale()) return
      // Тихое обновление права стирать экран не имеет: показанный кэш честнее
      // пустого профиля с «Не удалось загрузить».
      if (silent) return
      setUser(null)
      setEducation([])
      setWork([])
      setHardSkills([])
      setSoftSkills([])
      setSocials([])
      // 404 — профиль скрыт (взаимная блокировка) или удалён: «обнови экран» тут не поможет
      setError(
        err instanceof ApiRequestError && err.status === 404
          ? 'Профиль недоступен'
          : toUserError(err, 'Не удалось загрузить профиль'),
      )
    } finally {
      // Тихий рефетч спиннер не поднимал — и гасить ему нечего
      if (!silent && !isStale()) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return

    if (myId && myId === userId) {
      navigate('/profile', { replace: true })
      return
    }

    // Кэш есть — показываем его сразу, без спиннера, и тут же перечитываем ВСЁ.
    // Раньше тихо обновлялись только скаляры и контакт, а списки не читались
    // никогда: люди меняют любые поля, и удалённая соцсеть или навык висели бы
    // у всех остальных вечно. Скаляры при этом чинятся тем же запросом —
    // главный из них photoUrl: подпись presigned-ссылки живёт 15 минут, и
    // залипший в кэше null заставлял UserAvatar стереть аватарку и навсегда
    // показывать заглушку живому человеку с фото.
    const cached = getCachedOtherProfile(userId)
    if (cached) {
      setLoading(false)
      setError(null)
      // Один тихий рефетч на userId за монтирование: эффект перезапускается,
      // когда myId приезжает из профиля позже кэша.
      if (refreshedIdRef.current !== userId) {
        refreshedIdRef.current = userId
        void refetch({ silent: true })
      }
      return
    }

    void refetch()
  }, [userId, myId, navigate, refetch])

  return {
    user,
    education,
    work,
    hardSkills,
    softSkills,
    socials,
    isSaved,
    setIsSaved,
    isContact,
    setIsContact,
    note,
    setNote,
    loading,
    error,
    refetch,
    isEmpty: isProfileContentEmpty(user),
  }
}
