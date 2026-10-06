import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isAuthenticated } from '../../../api/client'
import { listStudentEduPlaces, searchStudents } from '../../../api/Students'
import type { EduPlace, SearchStudentsRequest, UserSearchResult } from '../../../api/types'
import {
  buildPersonSubtitle,
  extractCourseNumber,
  isCuEduPlace,
  pickCuEduPlace,
  type EduLineSource,
} from '../../../entities/education/lib/eduLine'
import {
  hasActiveSearchFilters,
  type SearchFiltersState,
} from '../model/types'
import { getCachedOtherProfile } from '../../../entities/profile/api/otherProfileStorage'
import { prefetchOtherProfiles } from '../../../entities/profile/lib/prefetchOtherProfiles'
import { getWorkingPhotoUrl, isSignedPhotoUrlExpired } from '../../../shared/lib/photoCache'
import { warmUserPhotos } from '../../../shared/lib/preloadImages'
import { getFriendsListCache } from '../../friends/lib/friendsListStorage'

const DEBOUNCE_MS = 300

/** Сколько карточек показываем сразу и добираем каждой «Загрузить ещё» */
const SEARCH_PAGE_SIZE = 20
/** При edu-фильтрах часть страницы отсеется на клиенте — сырую берём шире */
const RAW_PAGE_SIZE_EDU = 40
/** Предохранитель: за один шаг не тянем больше стольких сырых страниц */
const MAX_RAW_PAGES_PER_STEP = 3

export type SearchCardUser = UserSearchResult & {
  description: string
  eduPlace?: EduPlace | null
}

/** Профиль уже в localStorage (Нити / прошлый поиск) — карточку ЦУ берём оттуда */
const cachedEduPlaces = (userId: string): EduLineSource[] =>
  getCachedOtherProfile(userId)?.education ?? []

/**
 * Все известные места учёбы: основное из выдачи поиска + локальный кэш профиля.
 * Бэкенд может отдать в eduPlace не ЦУ, а другой вуз — карточку ЦУ ищем по всему
 * набору. Заблокировавшим нас бек редактирует выдачу (eduPlace = null) — не
 * обходим редактуру локальным кэшем их старого профиля.
 */
const knownEduPlaces = (
  user: UserSearchResult,
  place: EduPlace | null | undefined,
): EduLineSource[] => {
  // ЦУ уже в выдаче либо профиль отредактирован беком — в localStorage не лезем
  if (place && isCuEduPlace(place)) return [place]
  if (user.blockedByThem) return place ? [place] : []
  return [...(place ? [place] : []), ...cachedEduPlaces(user.id)]
}

/** Подпись в выдаче — общий хелпер, как в Нитях: «Маг ‘1 — Продуктовый менеджмент» */
const buildDescription = (user: UserSearchResult, places: EduLineSource[]): string =>
  buildPersonSubtitle({ places, speciality: user.speciality, status: user.status })

/** Догрузили edu-places (бэкенд без eduPlace в выдаче) — обновляем подпись */
const applyEduDescription = (
  items: SearchCardUser[],
  userId: string,
  places: EduPlace[],
): SearchCardUser[] => {
  const index = items.findIndex((item) => item.id === userId)
  if (index < 0) return items
  const place = pickCuEduPlace(places)
  const description = buildDescription(items[index], places) || items[index].description
  if (description === items[index].description) return items
  const next = items.slice()
  next[index] = { ...items[index], description, eduPlace: place }
  return next
}

/**
 * В справочнике степень ДПО называется 'dpomaster', в старых профилях лежит
 * legacy-алиас 'dpo' — для сравнения приводим оба к одному значению.
 */
const normalizeGrade = (grade: string | null | undefined): string =>
  grade === 'dpo' ? 'dpomaster' : grade ?? ''

const matchesEduFilters = (places: EduPlace[], filters: SearchFiltersState): boolean => {
  const needFaculty = Boolean(filters.faculty?.trim())
  const needDegree = Boolean(filters.degree)
  const needCourse = filters.course != null

  if (!needFaculty && !needDegree && !needCourse) return true
  if (!places.length) return false

  return places.some((place) => {
    if (needFaculty && place.specialization?.trim() !== filters.faculty?.trim()) {
      return false
    }
    if (needDegree && normalizeGrade(place.grade) !== normalizeGrade(filters.degree)) {
      return false
    }
    if (needCourse) {
      const course = extractCourseNumber(place.level)
      if (course !== String(filters.course)) return false
    }
    return true
  })
}

export const buildSearchRequest = (
  query: string,
  filters: SearchFiltersState,
  statusIdFromChip?: number | null,
): SearchStudentsRequest | null => {
  const q = query.trim()
  const statusId = filters.statusId ?? statusIdFromChip ?? null
  const speciality = filters.speciality?.trim() || null
  const workPlace = filters.workPlace?.trim()
  const companies = workPlace ? [workPlace] : undefined
  const keySkillIds = filters.hardSkills.map((s) => s.id)
  const softSkillIds = filters.softSkills.map((s) => s.id)
  const hasEduFilters = Boolean(
    filters.faculty?.trim() || filters.degree || filters.course != null,
  )

  const hasQuery = q.length > 0
  const hasFilters =
    statusId != null ||
    Boolean(speciality) ||
    Boolean(companies?.length) ||
    keySkillIds.length > 0 ||
    softSkillIds.length > 0 ||
    hasEduFilters

  if (!hasQuery && !hasFilters) {
    return null
  }

  return {
    q: hasQuery ? q : null,
    statusId,
    speciality,
    companies,
    keySkillIds: keySkillIds.length > 0 ? keySkillIds : undefined,
    softSkillIds: softSkillIds.length > 0 ? softSkillIds : undefined,
    // при edu-фильтрах берём шире — дофильтруем на клиенте по edu-places
    limit: hasEduFilters ? RAW_PAGE_SIZE_EDU : SEARCH_PAGE_SIZE,
    offset: 0,
  }
}

/** Подписи + клиентская дофильтровка по edu-местам для одной сырой страницы */
const enrichSearchPage = async (
  users: UserSearchResult[],
  filters: SearchFiltersState,
  needEduFilters: boolean,
): Promise<SearchCardUser[]> => {
  const enriched = await Promise.all(
    users.map(async (user) => {
      // Без edu-фильтров хватает основного места учёбы из выдачи поиска
      if (!needEduFilters) {
        const place = user.eduPlace ?? null
        return {
          user,
          places: [] as EduPlace[],
          place,
          description: buildDescription(user, knownEduPlaces(user, place)),
        }
      }

      try {
        const places = await listStudentEduPlaces(user.id)
        return {
          user,
          places,
          place: pickCuEduPlace(places),
          description: buildDescription(user, places),
        }
      } catch {
        const place = user.eduPlace ?? null
        return {
          user,
          places: [] as EduPlace[],
          place,
          description: buildDescription(user, knownEduPlaces(user, place)),
        }
      }
    }),
  )

  return enriched
    .filter(({ places }) => matchesEduFilters(places, filters))
    .map(({ user, place, description }) => ({
      ...user,
      description,
      eduPlace: place,
    }))
}

type SearchPageChunk = {
  items: SearchCardUser[]
  /** offset следующей сырой страницы бэкенда */
  nextOffset: number
  hasMore: boolean
}

/**
 * Одна «страница» выдачи: тянем сырые страницы бэкенда, пока не наберётся
 * SEARCH_PAGE_SIZE карточек (при edu-фильтрах часть отсеивается на клиенте).
 */
const loadSearchPage = async (
  request: SearchStudentsRequest,
  offset: number,
  filters: SearchFiltersState,
  needEduFilters: boolean,
): Promise<SearchPageChunk> => {
  const rawLimit = request.limit ?? SEARCH_PAGE_SIZE
  const items: SearchCardUser[] = []
  /** id уже набранных в этот чанк — сырые страницы бэкенда могут пересекаться */
  const chunkIds = new Set<string>()
  let nextOffset = offset
  let hasMore = true

  for (let step = 0; step < MAX_RAW_PAGES_PER_STEP; step += 1) {
    const page = await searchStudents({ ...request, limit: rawLimit, offset: nextOffset })
    nextOffset += page.data.length
    if (page.data.length < rawLimit) hasMore = false

    // Дубли режем сразу: иначе одинаковые карточки и duplicate React keys
    for (const user of await enrichSearchPage(page.data, filters, needEduFilters)) {
      if (chunkIds.has(user.id)) continue
      chunkIds.add(user.id)
      items.push(user)
    }
    if (!hasMore || items.length >= SEARCH_PAGE_SIZE) break
  }

  return { items, nextOffset, hasMore }
}

/** Полные данные профилей → localStorage (открытие профиля без сети) */
/** Подставляем URL аватара с Нитей — тот же string попадает в HTTP cache браузера */
const withStablePhotoUrls = (items: SearchCardUser[]): SearchCardUser[] => {
  const friends = getFriendsListCache()
  const avatarById = new Map<string, string>()
  friends?.contacts.forEach((c) => {
    if (c.avatarUrl) avatarById.set(c.id, c.avatarUrl)
  })
  friends?.savedUsers.forEach((u) => {
    if (u.avatarUrl) avatarById.set(u.id, u.avatarUrl)
  })

  // Протухшая подпись (TTL 15 мин) — плохой кандидат: S3 ответит 403, а
  // photoCache за таким URL в сеть не пойдёт вовсе (isSignedPhotoUrlExpired),
  // и человек с фото получит заглушку. Свежий URL из выдачи лучше.
  const live = (url: string | null | undefined): string | null =>
    url && !isSignedPhotoUrlExpired(url) ? url : null

  return items.map((user) => {
    const working = getWorkingPhotoUrl(user.id)
    const fromFriends = avatarById.get(user.id)
    const fromProfile = getCachedOtherProfile(user.id)?.user.photoUrl?.trim()
    // Предпочитаем уже «рабочий» URL (нити), иначе свежий из поиска.
    // Хвост из просроченных — только когда своего URL в выдаче нет: заменять их
    // на null нельзя, для UserAvatar это «фото нет» и он стирает кэш аватарки.
    const photoUrl =
      live(working) ||
      live(fromFriends) ||
      user.photoUrl ||
      live(fromProfile) ||
      working ||
      fromFriends ||
      fromProfile ||
      null
    return photoUrl === user.photoUrl ? user : { ...user, photoUrl }
  })
}

const prefetchSearchProfiles = (
  items: SearchCardUser[],
  onEduLoaded: (userId: string, places: EduPlace[]) => void,
) => {
  // Заблокировавших нас не префетчим: их выдача отредактирована беком,
  // а onEduLoaded вернул бы курс в подпись в обход редактуры.
  const visible = items.filter((user) => !user.blockedByThem)
  if (!visible.length) return
  void prefetchOtherProfiles(
    visible.map((user) => ({
      user,
      isSaved: user.relation === 'saved',
      isContact: user.relation === 'contact',
      note: '',
    })),
    {
      concurrency: 4,
      skipIfCached: true,
      // подстраховка, если бэкенд не отдал eduPlace в выдаче
      onEduLoaded,
    },
  )
}

export const useStudentSearch = (
  query: string,
  filters: SearchFiltersState,
  chipStatusId?: number | null,
) => {
  const request = useMemo(
    () => buildSearchRequest(query, filters, chipStatusId),
    [query, filters, chipStatusId],
  )

  const [results, setResults] = useState<SearchCardUser[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** offset следующей сырой страницы, id уже показанных и активный запрос */
  const offsetRef = useRef(0)
  const shownIdsRef = useRef(new Set<string>())
  const requestRef = useRef(request)

  const needEduFilters = Boolean(
    filters.faculty?.trim() || filters.degree || filters.course != null,
  )

  const applyEdu = useCallback((userId: string, places: EduPlace[]) => {
    setResults((prev) => applyEduDescription(prev, userId, places))
  }, [])

  useEffect(() => {
    // Новый запрос/фильтры — снова показываем первые SEARCH_PAGE_SIZE
    requestRef.current = request
    offsetRef.current = 0
    shownIdsRef.current = new Set()
    // Синхронно, не в таймере: иначе в 300мс окно дебаунса кнопка «Загрузить ещё»
    // ещё видна и клик дописал бы страницу нового запроса к старой выдаче.
    setHasMore(false)

    if (!request || !isAuthenticated()) {
      setResults([])
      setHasMore(false)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      setHasMore(false)

      void loadSearchPage(request, 0, filters, needEduFilters)
        .then(async ({ items, nextOffset, hasMore: more }) => {
          if (cancelled) return

          const withPhotos = withStablePhotoUrls(items)
          await warmUserPhotos(withPhotos)
          if (cancelled) return

          offsetRef.current = nextOffset
          shownIdsRef.current = new Set(withPhotos.map((user) => user.id))
          setResults(withPhotos)
          setHasMore(more)
          prefetchSearchProfiles(withPhotos, applyEdu)
        })
        .catch((err) => {
          if (cancelled) return
          const message = err instanceof Error ? err.message : 'Не удалось выполнить поиск'
          setError(message)
          setResults([])
          setHasMore(false)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [request, filters, needEduFilters, applyEdu])

  /** «Загрузить ещё» — дотягивает следующие SEARCH_PAGE_SIZE карточек */
  const loadMore = useCallback(async () => {
    const activeRequest = requestRef.current
    if (!activeRequest || loadingMore || !hasMore) return

    setLoadingMore(true)
    try {
      const chunk = await loadSearchPage(
        activeRequest,
        offsetRef.current,
        filters,
        needEduFilters,
      )
      // Пока грузили — сменился запрос: чужие результаты не дописываем
      if (requestRef.current !== activeRequest) return

      const fresh = chunk.items.filter((user) => !shownIdsRef.current.has(user.id))
      const withPhotos = withStablePhotoUrls(fresh)
      await warmUserPhotos(withPhotos)
      // Второй рубеж: пока грелись фото, запрос тоже мог смениться — иначе
      // дописали бы страницу старого запроса к новой выдаче и сбили offset
      if (requestRef.current !== activeRequest) return

      offsetRef.current = chunk.nextOffset
      withPhotos.forEach((user) => shownIdsRef.current.add(user.id))
      if (withPhotos.length) setResults((prev) => [...prev, ...withPhotos])
      // «Бэкенд проигнорировал offset» — это когда страница пришла НЕпустой,
      // но целиком из уже показанных id. Пустое окно (все 120 сырых строк
      // отсеяны edu-фильтрами) — легитимно: offset уже продвинут, следующий
      // клик продолжит сканирование, кнопку не прячем.
      const backendIgnoredOffset = chunk.items.length > 0 && withPhotos.length === 0
      setHasMore(chunk.hasMore && !backendIgnoredOffset)
      prefetchSearchProfiles(withPhotos, applyEdu)
    } catch {
      // Ошибка сети не должна навсегда прятать кнопку: offset не сдвинут,
      // повторный тап корректно повторит тот же запрос.
    } finally {
      setLoadingMore(false)
    }
  }, [filters, needEduFilters, hasMore, loadingMore, applyEdu])

  const isActive = request != null || hasActiveSearchFilters(filters) || query.trim().length > 0

  return {
    results,
    total: results.length,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    error,
    isActive,
  }
}
