export type UserProfile = {
  id: string
  photoUrl: string | null
  firstName: string
  lastName: string
  bio: string | null
  birthdate: string | null
  showBirthdate?: boolean
  speciality: string | null
  status: string | null
  role: string
  /** ISO timestamp — онбординг завершён на сервере */
  completedAt?: string | null
  /**
   * ISO timestamp принятия документов. null/отсутствует — согласие ещё не
   * зафиксировано на сервере, показываем «Формальности» перед входом.
   * Старый бэкенд поле не отдаёт — тогда это тоже «согласия нет».
   */
  consentedAt?: string | null
  /** Ревизия пользовательского соглашения, под которой подписался пользователь */
  termsVersion?: string | null
  /** Ревизия политики конфиденциальности, под которой подписался пользователь */
  privacyVersion?: string | null
  /** Владелец профиля заблокировал текущего зрителя — поля урезаны */
  blockedByThem?: boolean
  /** Аккаунт soft-deleted */
  deleted?: boolean
}

/**
 * JSON-часть `data` в PUT /api/me (multipart).
 * Переданный ключ перезаписывает поле; отсутствующий — не меняет.
 * status на чтении — строка; на запись — statusId.
 */
export type UpdateMeData = {
  bio?: string | null
  birthdate?: string | null
  showBirthdate?: boolean | null
  speciality?: string | null
  statusId?: number | null
}

export type StatusOption = {
  id: number
  content: string
}

/**
 * Списковый ответ бэка (схема PageMeta в docs/openapi.yaml). Поля метаданных
 * необязательные: тот же тип описывает и ответ старого билда без PageMeta.
 */
export type PaginatedResponse<T> = {
  data: T[]
  total: number
  limit?: number
  offset?: number
  /** За этой страницей есть ещё записи (offset + data.length < total) */
  hasMore?: boolean
  /** Offset следующей страницы; null — страниц больше нет */
  nextOffset?: number | null
}

/**
 * Страница списка для вызывающих, которым нужен курсор: считать «есть ещё» и
 * следующий offset по длине уже показанного списка нельзя — её двигают
 * локальные удаления и добавления.
 */
export type ListPage<T> = {
  items: T[]
  hasMore: boolean
  /** Offset следующей страницы; null — догружать нечего */
  nextOffset: number | null
}

export type ListParams = {
  limit?: number
  offset?: number
}

export type EduGrade =
  | 'bachelor'
  | 'master'
  | 'postgraduate'
  | 'residency'
  | 'dpo'
  | 'dpomaster'
  | 'specialist'

export type EduPlace = {
  id: number
  universityId: number
  universityName?: string
  grade: EduGrade
  level: string
  specialization: string
  startYear: number
  endYear: number | null
  isStudyingNow: boolean
}

export type EduPlaceInput = {
  universityId: number
  grade: EduGrade
  level: string
  specialization: string
  startYear: number
  endYear: number | null
  isStudyingNow: boolean
}

export type WorkGrade = 'intern' | 'junior' | 'middle' | 'senior' | 'lead'

export type WorkPlace = {
  id: number
  companyName: string
  grade: WorkGrade
  position: string
  startYear: number
  endYear: number | null
  isWorkingNow: boolean
}

export type WorkPlaceInput = {
  companyName: string
  grade: WorkGrade
  position: string
  startYear: number
  endYear: number | null
  isWorkingNow: boolean
}

export type SocialType =
  | 'vk'
  | 'telegram'
  | 'github'
  | 'linkedin'
  | 'tg_channel'
  | 'behance'
  | 'max'
  | 'time'

export type Social = {
  id: number
  social: SocialType
  link: string
  isPreferred: boolean
}

export type SocialInput = {
  social: SocialType
  link: string
  isPreferred: boolean
}

/** Элемент из GET /api/me/key-skills и /api/me/soft-skills */
export type UserSkill = {
  id: number
  name: string
  /** Категория каталога hard skills; у легаси-навыков её нет */
  categoryId?: number | null
  sortOrder?: number | null
}

/** GET /api/key-skill-categories — категория каталога профессиональных навыков */
export type SkillCategory = {
  id: number
  name: string
  sortOrder: number
}

export type ApiError = {
  error: string
  code?: string
}

/**
 * Body POST /api/me/consent и необязательный body POST /api/students/register.
 * Версии — ревизия документов (LEGAL_REVISION), под которой пользователь подписался.
 */
export type ConsentPayload = {
  termsVersion: string
  privacyVersion: string
}

/**
 * Кто кого отсканировал: 'scan' — я его, 'incoming' — он меня. Решает сервер
 * (клиент источник не передаёт), нужно для детекции входящих сканов.
 */
export type ContactSource = 'scan' | 'incoming'

/** Элемент GET /api/me/contacts */
export type Contact = {
  note: string | null
  /** Нет поля — старый бэк; строки до миграции приходят с 'scan' */
  source?: ContactSource | null
  /** RFC3339, дата встречи. null — контакт создан до миграции */
  createdAt?: string | null
  user: UserProfile
}

export type CreateContactRequest = {
  contactId: string
  note?: string | null
}

export type UpdateContactRequest = {
  note?: string | null
}

export type Company = {
  id: number
  name: string
}

export type WorkPosition = {
  id: number
  name: string
}

/** Направление обучения (справочник GET /api/edu-directions) */
export type EduDirection = {
  id: number
  name: string
}

export type University = {
  id: number
  name: string
  shortName: string
}

export type UserRelation = 'saved' | 'contact' | 'other'

export type UserSearchResult = UserProfile & {
  relation: UserRelation
  /**
   * Основное место учёбы (ЦУ, пока учится — первым).
   * Нужно для подписи «Маг ‘1 — Продуктовый менеджмент» в выдаче поиска.
   * Может отсутствовать: у пользователя нет мест учёбы.
   */
  eduPlace?: EduPlace | null
}

/** Body POST /api/students/search */
export type SearchStudentsRequest = {
  q?: string | null
  statusId?: number | null
  speciality?: string | null
  companies?: string[]
  keySkillIds?: number[]
  softSkillIds?: number[]
  limit?: number
  offset?: number
}

export type EventCategory = string

/** GET/POST /api/events */
export type ApiEvent = {
  id: string
  title: string
  content: string
  photoUrl: string | null
  place: string
  category: EventCategory
  startsAt: string
  endsAt?: string | null
  registrationLink: string | null
  isDraft: boolean
  createdAt: string
  author: UserProfile | null
}

export type CreateEventRequest = {
  title: string
  content: string
  place: string
  category: string
  startsAt: string
  registrationLink?: string | null
  isDraft?: boolean
}

/** GET/POST /api/posts — объявления */
export type ApiPost = {
  id: string
  title: string
  content: string
  isArchived: boolean
  createdAt: string
  author: UserProfile | null
}

export type CreatePostRequest = {
  title: string
  content: string
}

export type UpdatePostRequest = {
  title: string
  content: string
  isArchived: boolean
}
