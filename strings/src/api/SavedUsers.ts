import { apiFetchJson, ApiRequestError } from './client'
import type { ListPage, ListParams, PaginatedResponse, UserProfile } from './types'

const buildQuery = (params?: ListParams): string => {
  if (!params) return ''
  const search = new URLSearchParams()
  if (params.limit != null) search.set('limit', String(params.limit))
  if (params.offset != null) search.set('offset', String(params.offset))
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

const normalizeList = (
  response: PaginatedResponse<UserProfile> | UserProfile[] | null | undefined,
): UserProfile[] => {
  if (response == null) return []
  if (Array.isArray(response)) return response
  return response.data ?? []
}

/**
 * Метаданные страницы из ответа. Бэк отдаёт hasMore/nextOffset (PageMeta), но
 * ответ может прийти и без них (голый массив со старого билда) — тогда считаем
 * по длине страницы: полная страница значит «возможно, есть ещё».
 */
const normalizePage = (
  response: PaginatedResponse<UserProfile> | UserProfile[] | null | undefined,
  params?: ListParams,
): ListPage<UserProfile> => {
  const items = normalizeList(response)
  const offset = params?.offset ?? 0
  const meta = response != null && !Array.isArray(response) ? response : null

  if (meta?.hasMore != null) {
    // nextOffset обязателен по контракту, но пустым его прислать всё же могут —
    // тогда следующая страница начинается сразу за вычитанной.
    const nextOffset = meta.nextOffset ?? (meta.hasMore ? offset + items.length : null)
    return { items, hasMore: meta.hasMore, nextOffset }
  }

  const hasMore = params?.limit != null && items.length >= params.limit
  return { items, hasMore, nextOffset: hasMore ? offset + items.length : null }
}

/** GET /api/me/saved-users — страница с курсором пагинации */
export const listSavedUsersPage = async (params?: ListParams): Promise<ListPage<UserProfile>> => {
  try {
    const response = await apiFetchJson<PaginatedResponse<UserProfile> | UserProfile[] | null>(
      `/api/me/saved-users${buildQuery(params)}`,
    )
    return normalizePage(response, params)
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return { items: [], hasMore: false, nextOffset: null }
    }
    throw error
  }
}

/** GET /api/me/saved-users — только записи, для вызывающих без пагинации */
export const listSavedUsers = async (params?: ListParams): Promise<UserProfile[]> =>
  (await listSavedUsersPage(params)).items

/**
 * GET /api/me/saved-users/{userId} — точечная проверка «в избранном».
 * 200 — да, 404 — нет; прямой аналог GET /api/me/contacts/{contactId}.
 */
export const getSavedUser = async (userId: string): Promise<UserProfile | null> => {
  try {
    return await apiFetchJson<UserProfile>(`/api/me/saved-users/${userId}`)
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return null
    }
    throw error
  }
}

/** POST /api/me/saved-users/{userId} */
export const addSavedUser = async (userId: string): Promise<UserProfile> =>
  apiFetchJson<UserProfile>(`/api/me/saved-users/${userId}`, { method: 'POST' })

/** DELETE /api/me/saved-users/{userId} */
export const deleteSavedUser = async (userId: string): Promise<void> => {
  await apiFetchJson<void>(`/api/me/saved-users/${userId}`, { method: 'DELETE' })
}
