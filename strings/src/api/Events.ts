import { apiFetchJson, ApiRequestError } from './client'
import type { ApiEvent, CreateEventRequest, ListParams, PaginatedResponse, UserProfile } from './types'

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

/** GET /api/events */
export const listEvents = async (params?: ListParams): Promise<ApiEvent[]> => {
  const response = await apiFetchJson<PaginatedResponse<ApiEvent> | ApiEvent[] | null>(
    `/api/events${buildQuery(params ?? { limit: 100, offset: 0 })}`,
  )
  return normalizeList(response)
}

/**
 * POST /api/events/sync — импорт из ЦУ по bff.cookie текущего пользователя.
 * Расписание с CU_SERVICE_COOKIE на бэке опционально; основной путь — эта ручка.
 */
export const syncEventsFromCu = async (): Promise<number> => {
  const response = await apiFetchJson<{ processed: number } | null>('/api/events/sync', {
    method: 'POST',
  })
  return response?.processed ?? 0
}

/** GET /api/events/:id */
export const getEvent = async (id: string): Promise<ApiEvent> =>
  apiFetchJson<ApiEvent>(`/api/events/${id}`)

/** GET /api/me/event-responses — мероприятия, на которые «я иду» */
export const listMyEventResponses = async (params?: ListParams): Promise<ApiEvent[]> => {
  const response = await apiFetchJson<PaginatedResponse<ApiEvent> | ApiEvent[] | null>(
    `/api/me/event-responses${buildQuery(params ?? { limit: 100, offset: 0 })}`,
  )
  return normalizeList(response)
}

/** POST /api/events/:id/responses — 409 = уже идём (idempotent) */
export const respondToEvent = async (eventId: string): Promise<ApiEvent | null> => {
  try {
    return await apiFetchJson<ApiEvent>(`/api/events/${eventId}/responses`, { method: 'POST' })
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 409 || err.status === 404)) return null
    throw err
  }
}

/** DELETE /api/events/:id/responses — 404 = уже нет отклика (idempotent) */
export const deleteEventResponse = async (eventId: string): Promise<void> => {
  try {
    await apiFetchJson<void>(`/api/events/${eventId}/responses`, { method: 'DELETE' })
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) return
    throw err
  }
}

/** GET /api/events/:id/responses */
export const listEventResponders = async (
  eventId: string,
  params?: ListParams,
): Promise<UserProfile[]> => {
  const response = await apiFetchJson<PaginatedResponse<UserProfile> | UserProfile[] | null>(
    `/api/events/${eventId}/responses${buildQuery(params)}`,
  )
  return normalizeList(response)
}

/** POST /api/events — multipart data(+photo) */
export const createEvent = async (
  body: CreateEventRequest,
  photo?: File | Blob | null,
): Promise<ApiEvent> => {
  const formData = new FormData()
  formData.append('data', JSON.stringify(body))
  if (photo) {
    const name = photo instanceof File && photo.name.trim() ? photo.name : 'event.jpg'
    formData.append('photo', photo, name)
  }
  return apiFetchJson<ApiEvent>('/api/events', { method: 'POST', body: formData })
}
