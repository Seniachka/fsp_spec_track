import { apiFetchJson } from './client'
import type {
  ApiPost,
  CreatePostRequest,
  ListParams,
  PaginatedResponse,
  UpdatePostRequest,
  UserProfile,
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

/** GET /api/posts — лента (неархивные) */
export const listPosts = async (params?: ListParams): Promise<ApiPost[]> => {
  const response = await apiFetchJson<PaginatedResponse<ApiPost> | ApiPost[] | null>(
    `/api/posts${buildQuery(params ?? { limit: 100, offset: 0 })}`,
  )
  return normalizeList(response)
}

/** @deprecated используй listPosts — объявления = /api/posts */
export const getAnnouncements = listPosts

/** GET /api/posts/:id */
export const getPost = async (id: string): Promise<ApiPost> =>
  apiFetchJson<ApiPost>(`/api/posts/${id}`)

/** POST /api/posts */
export const createPost = async (body: CreatePostRequest): Promise<ApiPost> =>
  apiFetchJson<ApiPost>('/api/posts', {
    method: 'POST',
    body: JSON.stringify(body),
  })

/** PUT /api/posts/:id */
export const updatePost = async (id: string, body: UpdatePostRequest): Promise<ApiPost> =>
  apiFetchJson<ApiPost>(`/api/posts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

/** DELETE /api/posts/:id */
export const deletePost = async (id: string): Promise<void> => {
  await apiFetchJson<void>(`/api/posts/${id}`, { method: 'DELETE' })
}

/** GET /api/me/posts — мои объявления (вкл. архив) */
export const listMyPosts = async (params?: ListParams): Promise<ApiPost[]> => {
  const response = await apiFetchJson<PaginatedResponse<ApiPost> | ApiPost[] | null>(
    `/api/me/posts${buildQuery(params ?? { limit: 100, offset: 0 })}`,
  )
  return normalizeList(response)
}

/** GET /api/me/post-responses — объявления, на которые я откликнулся */
export const listMyPostResponses = async (params?: ListParams): Promise<ApiPost[]> => {
  const response = await apiFetchJson<PaginatedResponse<ApiPost> | ApiPost[] | null>(
    `/api/me/post-responses${buildQuery(params ?? { limit: 100, offset: 0 })}`,
  )
  return normalizeList(response)
}

/** POST /api/posts/:id/responses */
export const respondToPost = async (postId: string): Promise<ApiPost> =>
  apiFetchJson<ApiPost>(`/api/posts/${postId}/responses`, { method: 'POST' })

/** DELETE /api/posts/:id/responses */
export const deletePostResponse = async (postId: string): Promise<void> => {
  await apiFetchJson<void>(`/api/posts/${postId}/responses`, { method: 'DELETE' })
}

/** GET /api/posts/:id/responses */
export const listPostResponders = async (
  postId: string,
  params?: ListParams,
): Promise<UserProfile[]> => {
  const response = await apiFetchJson<PaginatedResponse<UserProfile> | UserProfile[] | null>(
    `/api/posts/${postId}/responses${buildQuery(params ?? { limit: 50, offset: 0 })}`,
  )
  return normalizeList(response)
}
