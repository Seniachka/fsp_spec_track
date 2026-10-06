import { apiFetchJson, ApiRequestError } from './client'
import type { ListParams, PaginatedResponse, UserProfile } from './types'

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

/** GET /api/me/blocked-users */
export const listBlockedUsers = async (params?: ListParams): Promise<UserProfile[]> => {
  try {
    const response = await apiFetchJson<PaginatedResponse<UserProfile> | UserProfile[] | null>(
      `/api/me/blocked-users${buildQuery(params)}`,
    )
    return normalizeList(response)
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return []
    }
    throw error
  }
}

/** POST /api/me/blocked-users/{userId} */
export const blockUser = async (userId: string): Promise<UserProfile> =>
  apiFetchJson<UserProfile>(`/api/me/blocked-users/${userId}`, { method: 'POST' })

/** DELETE /api/me/blocked-users/{userId} */
export const unblockUser = async (userId: string): Promise<void> => {
  await apiFetchJson<void>(`/api/me/blocked-users/${userId}`, { method: 'DELETE' })
}
