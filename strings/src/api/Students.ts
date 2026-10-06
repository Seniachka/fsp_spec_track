import { apiFetchJson } from './client'
import type {
  ConsentPayload,
  EduPlace,
  ListParams,
  PaginatedResponse,
  SearchStudentsRequest,
  Social,
  UserProfile,
  UserSearchResult,
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

/**
 * POST /api/students/register — регистрирует или возвращает текущего CU-пользователя.
 * Принятые версии документов отправляем сразу в теле; старый бэкенд их игнорирует,
 * поэтому вызывающий проверяет consentedAt в ответе и при необходимости
 * добивает согласие отдельным POST /api/me/consent.
 */
export const registerStudent = async (consent?: ConsentPayload): Promise<UserProfile> => {
  return apiFetchJson<UserProfile>('/api/students/register', {
    method: 'POST',
    ...(consent ? { body: JSON.stringify(consent) } : {}),
  })
}

/** Нормализует элемент поиска: photoUrl может прийти null или во вложенном user */
const normalizeSearchResult = (raw: UserSearchResult | Record<string, unknown>): UserSearchResult => {
  const item = raw as UserSearchResult & { user?: UserProfile }
  const nested = item.user
  const photoUrl =
    (typeof item.photoUrl === 'string' && item.photoUrl) ||
    (typeof nested?.photoUrl === 'string' && nested.photoUrl) ||
    null

  if (nested && (!item.firstName || !item.id)) {
    return {
      ...nested,
      relation: item.relation,
      eduPlace: item.eduPlace ?? null,
      photoUrl,
    }
  }

  return {
    ...item,
    photoUrl,
  }
}

const normalizeSearchPage = (
  response: PaginatedResponse<UserSearchResult> | UserSearchResult[] | null | undefined,
): { data: UserSearchResult[]; total: number } => {
  if (response == null) return { data: [], total: 0 }
  if (Array.isArray(response)) {
    return { data: response.map(normalizeSearchResult), total: response.length }
  }
  const data = (response.data ?? []).map(normalizeSearchResult)
  return { data, total: response.total ?? data.length }
}

/** POST /api/students/search */
export const searchStudents = async (
  body: SearchStudentsRequest = {},
): Promise<{ data: UserSearchResult[]; total: number }> => {
  const response = await apiFetchJson<PaginatedResponse<UserSearchResult> | UserSearchResult[] | null>(
    '/api/students/search',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
  return normalizeSearchPage(response)
}

/** GET /api/students/{id} */
export const getStudent = (id: string): Promise<UserProfile> =>
  apiFetchJson<UserProfile>(`/api/students/${id}`)

/** GET /api/students/{id}/edu-places */
export const listStudentEduPlaces = async (
  userId: string,
  params?: ListParams,
): Promise<EduPlace[]> => {
  const response = await apiFetchJson<PaginatedResponse<EduPlace> | EduPlace[] | null>(
    `/api/students/${userId}/edu-places${buildQuery(params ?? { limit: 20, offset: 0 })}`,
  )
  return normalizeList(response)
}

/** GET /api/students/{id}/work-places */
export const listStudentWorkPlaces = async (
  userId: string,
  params?: ListParams,
): Promise<import('./types').WorkPlace[]> => {
  const response = await apiFetchJson<
    PaginatedResponse<import('./types').WorkPlace> | import('./types').WorkPlace[] | null
  >(`/api/students/${userId}/work-places${buildQuery(params ?? { limit: 20, offset: 0 })}`)
  return normalizeList(response)
}

/** GET /api/students/{id}/key-skills */
export const listStudentKeySkills = async (
  userId: string,
  params?: ListParams,
): Promise<import('./types').UserSkill[]> => {
  const response = await apiFetchJson<
    PaginatedResponse<import('./types').UserSkill> | import('./types').UserSkill[] | null
  >(`/api/students/${userId}/key-skills${buildQuery(params ?? { limit: 50, offset: 0 })}`)
  return normalizeList(response)
}

/** GET /api/students/{id}/soft-skills */
export const listStudentSoftSkills = async (
  userId: string,
  params?: ListParams,
): Promise<import('./types').UserSkill[]> => {
  const response = await apiFetchJson<
    PaginatedResponse<import('./types').UserSkill> | import('./types').UserSkill[] | null
  >(`/api/students/${userId}/soft-skills${buildQuery(params ?? { limit: 50, offset: 0 })}`)
  return normalizeList(response)
}

/** GET /api/students/{id}/socials */
export const listStudentSocials = async (
  userId: string,
  params?: ListParams,
): Promise<Social[]> => {
  const response = await apiFetchJson<PaginatedResponse<Social> | Social[] | null>(
    `/api/students/${userId}/socials${buildQuery(params ?? { limit: 20, offset: 0 })}`,
  )
  return normalizeList(response)
}
