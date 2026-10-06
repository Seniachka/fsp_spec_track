/** Сокращения степеней для подписи под именем: «Маг ‘1 — Продуктовый менеджмент» */
export const EDU_GRADE_SHORT: Record<string, string> = {
  bachelor: 'Бак',
  master: 'Маг',
  dpo: 'ДПО',
  dpomaster: 'ДПО',
  specialist: 'Спец',
  postgraduate: 'Асп',
  residency: 'Орд',
}

/** id ЦУ в справочнике вузов (GET /api/universities) */
export const CU_UNIVERSITY_ID = 207

/** Из «2 курс» / «2» → «2» */
export const extractCourseNumber = (level: string | undefined | null): string => {
  const match = (level ?? '').match(/\d+/)
  return match?.[0] ?? ''
}

/**
 * Вуз места учёбы в любом виде: EduPlace из API (universityName)
 * либо EducationEntry профиля (university / universityShort).
 */
export type EduUniversitySource = {
  universityId?: number | null
  universityName?: string | null
  university?: string | null
  universityShort?: string | null
}

/** Степень и курс — приходят из интеграции с ЦУ */
export type EduGradeSource = {
  grade?: string | null
  /** Курс из интеграции с ЦУ: «1» или «1 курс» */
  level?: string | null
}

/**
 * Общая форма места учёбы: EduPlace из API либо EducationEntry профиля.
 */
export type EduLineSource = EduUniversitySource & EduGradeSource

const isCuUniversityName = (raw: string | null | undefined): boolean => {
  const value = (raw ?? '').trim()
  if (!value) return false
  return value.toUpperCase() === 'ЦУ' || /центральн/i.test(value)
}

/** Место учёбы в ЦУ: id из справочника, аббревиатура или название вуза */
export const isCuEduPlace = (place: EduUniversitySource | null | undefined): boolean => {
  if (!place) return false
  if ((place.universityId ?? 0) === CU_UNIVERSITY_ID) return true
  return (
    isCuUniversityName(place.universityShort) ||
    isCuUniversityName(place.universityName) ||
    isCuUniversityName(place.university)
  )
}

/**
 * Карточка ЦУ — единственный источник степени и курса в подписях.
 * Мест учёбы у человека может быть несколько (РУДН + ЦУ): степень и курс
 * чужого вуза в подпись не берём.
 */
export const pickCuEduPlace = <T extends EduUniversitySource>(
  places: T[] | T | null | undefined,
): T | null => {
  if (!places) return null
  const list = Array.isArray(places) ? places : [places]
  return list.find((place) => isCuEduPlace(place)) ?? null
}

/** «Маг ‘1» / «Маг» — степень с курсом из карточки ЦУ */
export const formatCuGradeCourse = (place: EduGradeSource | null | undefined): string => {
  const short = place ? EDU_GRADE_SHORT[place.grade ?? ''] || '' : ''
  if (!short) return ''
  const course = extractCourseNumber(place?.level)
  return course ? `${short} ‘${course}` : short
}

/**
 * Подпись под именем: «Маг ‘1 — Продуктовый менеджмент».
 * Степень и курс — только из карточки ЦУ, специализация — отдельное поле
 * профиля (UserProfile.speciality), а не направление места учёбы.
 */
export const formatEduShortLine = (
  cuPlace: EduGradeSource | null | undefined,
  speciality?: string | null,
): string => {
  const degree = formatCuGradeCourse(cuPlace)
  const specialization = speciality?.trim() || ''
  if (degree && specialization) return `${degree} — ${specialization}`
  return degree || specialization
}

export type PersonSubtitleInput = {
  /** Все известные места учёбы: из выдачи поиска, кэша профиля или API */
  places?: EduLineSource[] | EduLineSource | null
  /** Поле «Специализация» из профиля (UserProfile.speciality) */
  speciality?: string | null
  /** Последний fallback, если нет ни карточки ЦУ, ни специализации */
  status?: string | null
}

/**
 * ЕДИНАЯ подпись карточки человека во всех списках (Поиск / Нити / Избранное):
 * «<степень>‘<курс> — <специализация>».
 * Нет карточки ЦУ — остаётся специализация; нет специализации — только степень
 * с курсом; нет ни того, ни другого — статус, чтобы строка не была пустой.
 */
export const buildPersonSubtitle = ({
  places,
  speciality,
  status,
}: PersonSubtitleInput): string =>
  formatEduShortLine(pickCuEduPlace(places), speciality) || status?.trim() || ''
