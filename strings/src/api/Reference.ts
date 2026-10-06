import { apiFetchJson } from './client'
import type {
  Company,
  EduDirection,
  ListParams,
  PaginatedResponse,
  SkillCategory,
  StatusOption,
  University,
  UserSkill,
  WorkPosition,
} from './types'

const buildQuery = (params?: ListParams): string => {
  if (!params) return ''
  const search = new URLSearchParams()
  if (params.limit != null) search.set('limit', String(params.limit))
  if (params.offset != null) search.set('offset', String(params.offset))
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

const normalizeList = <T>(response: PaginatedResponse<T> | T[] | null | undefined): T[] => {
  if (response == null) return []
  if (Array.isArray(response)) return response
  return response.data ?? []
}

const normalizePage = <T>(
  response: PaginatedResponse<T> | T[] | null | undefined,
  params?: ListParams,
): PaginatedResponse<T> => {
  if (response == null) {
    return { data: [], total: 0, limit: params?.limit, offset: params?.offset }
  }
  if (Array.isArray(response)) {
    return { data: response, total: response.length, limit: params?.limit, offset: params?.offset }
  }
  return {
    data: response.data ?? [],
    total: response.total ?? response.data?.length ?? 0,
    limit: response.limit ?? params?.limit,
    offset: response.offset ?? params?.offset,
  }
}

/** GET /api/statuses — для экранов, где нужен свежий список с бэка */
export const listStatuses = async (params?: ListParams): Promise<StatusOption[]> => {
  const response = await apiFetchJson<PaginatedResponse<StatusOption> | StatusOption[] | null>(
    `/api/statuses${buildQuery(params ?? { limit: 100, offset: 0 })}`,
  )
  return normalizeList(response)
}

/** Одна страница компаний (прогрессивная загрузка) */
export const listCompaniesPage = async (
  params?: ListParams,
): Promise<PaginatedResponse<Company>> => {
  const response = await apiFetchJson<PaginatedResponse<Company> | Company[] | null>(
    `/api/companies${buildQuery(params)}`,
  )
  return normalizePage(response, params)
}

/** Все компании */
export const listCompanies = async (): Promise<Company[]> => {
  const all: Company[] = []
  let offset = 0
  const limit = 100
  for (;;) {
    const page = await listCompaniesPage({ limit, offset })
    all.push(...page.data)
    offset += page.data.length
    if (page.data.length === 0 || all.length >= page.total) break
  }
  return all
}

/** Одна страница специализаций / должностей */
export const listWorkPositionsPage = async (
  params?: ListParams,
): Promise<PaginatedResponse<WorkPosition>> => {
  const response = await apiFetchJson<PaginatedResponse<WorkPosition> | WorkPosition[] | null>(
    `/api/work-positions${buildQuery(params)}`,
  )
  return normalizePage(response, params)
}

/** Все специализации с GET /api/work-positions */
export const listWorkPositions = async (): Promise<WorkPosition[]> => {
  const all: WorkPosition[] = []
  let offset = 0
  const limit = 100
  for (;;) {
    const page = await listWorkPositionsPage({ limit, offset })
    all.push(...page.data)
    offset += page.data.length
    if (page.data.length === 0 || all.length >= page.total) break
  }
  return all
}

/** Одна страница направлений обучения */
export const listEduDirectionsPage = async (
  params?: ListParams,
): Promise<PaginatedResponse<EduDirection>> => {
  const response = await apiFetchJson<PaginatedResponse<EduDirection> | EduDirection[] | null>(
    `/api/edu-directions${buildQuery(params)}`,
  )
  return normalizePage(response, params)
}

/** Все направления обучения с GET /api/edu-directions */
export const listEduDirections = async (): Promise<EduDirection[]> => {
  const all: EduDirection[] = []
  let offset = 0
  const limit = 100
  for (;;) {
    const page = await listEduDirectionsPage({ limit, offset })
    all.push(...page.data)
    offset += page.data.length
    if (page.data.length === 0 || all.length >= page.total) break
  }
  return all
}

const fetchAllSkills = async (path: '/api/key-skills' | '/api/soft-skills'): Promise<UserSkill[]> => {
  const all: UserSkill[] = []
  let offset = 0
  const limit = 100
  for (;;) {
    const response = await apiFetchJson<PaginatedResponse<UserSkill> | UserSkill[] | null>(
      `${path}${buildQuery({ limit, offset })}`,
    )
    const page = normalizePage(response, { limit, offset })
    all.push(...page.data)
    offset += page.data.length
    if (page.data.length === 0 || all.length >= page.total) break
  }
  return all
}

/** GET /api/key-skills — справочник скиллов */
export const listKeySkillsCatalog = (): Promise<UserSkill[]> => fetchAllSkills('/api/key-skills')

/** GET /api/soft-skills — справочник интересов */
export const listSoftSkillsCatalog = (): Promise<UserSkill[]> => fetchAllSkills('/api/soft-skills')

/** GET /api/key-skill-categories — 10 категорий каталога скиллов */
export const listKeySkillCategories = async (): Promise<SkillCategory[]> => {
  const all: SkillCategory[] = []
  let offset = 0
  const limit = 100
  for (;;) {
    const response = await apiFetchJson<PaginatedResponse<SkillCategory> | SkillCategory[] | null>(
      `/api/key-skill-categories${buildQuery({ limit, offset })}`,
    )
    const page = normalizePage(response, { limit, offset })
    all.push(...page.data)
    offset += page.data.length
    if (page.data.length === 0 || all.length >= page.total) break
  }
  return all
}

/**
 * Параметры справочника вузов: кроме страницы бэкенд принимает поиск.
 * q — подстрока названия или аббревиатуры без учёта регистра (спецсимволы ilike
 * экранирует сам бэкенд, шаблоны % и _ ищутся как обычные символы),
 * country — код страны ISO alpha-2.
 */
export type UniversityListParams = ListParams & {
  q?: string
  country?: string
}

const buildUniversityQuery = (params?: UniversityListParams): string => {
  if (!params) return ''
  const search = new URLSearchParams()
  if (params.limit != null) search.set('limit', String(params.limit))
  if (params.offset != null) search.set('offset', String(params.offset))
  const q = params.q?.trim()
  if (q) search.set('q', q)
  const country = params.country?.trim()
  if (country) search.set('country', country)
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

/** Больше бэкенд за раз не отдаёт — сам урезает limit до 100 */
export const UNIVERSITIES_MAX_PAGE_LIMIT = 100

/**
 * Одна страница вузов. q/country — серверный поиск; signal отменяет устаревший
 * запрос (набор в поле выбора вуза). Вузы каталога ЦУ бэкенд ставит первыми,
 * поэтому пустой q даёт осмысленный первый экран.
 */
export const listUniversitiesPage = async (
  params?: UniversityListParams,
  init?: { signal?: AbortSignal | null },
): Promise<PaginatedResponse<University>> => {
  const response = await apiFetchJson<PaginatedResponse<University> | University[] | null>(
    `/api/universities${buildUniversityQuery(params)}`,
    { signal: init?.signal },
  )
  return normalizePage(response, params)
}

/**
 * После импорта мирового справочника в нём порядка десяти тысяч вузов, и вычитать
 * его целиком — это сотня последовательных запросов, на которых приложение встаёт.
 * Ограничиваем обход: бэкенд сортирует каталог ЦУ первым, поэтому в этих страницах
 * лежат все нужные нам вузы. Экранам с полем выбора вуза нужен не весь список,
 * а серверный поиск — listUniversitiesPage с q.
 */
const MAX_UNIVERSITY_PAGES = 5

/** Начало справочника вузов с GET /api/universities (не больше MAX_UNIVERSITY_PAGES страниц) */
export const listUniversities = async (): Promise<University[]> => {
  const all: University[] = []
  let offset = 0
  const limit = UNIVERSITIES_MAX_PAGE_LIMIT
  for (let page = 0; page < MAX_UNIVERSITY_PAGES; page += 1) {
    const chunk = await listUniversitiesPage({ limit, offset })
    all.push(...chunk.data)
    offset += chunk.data.length
    if (chunk.data.length === 0 || all.length >= chunk.total) break
  }
  return all
}
