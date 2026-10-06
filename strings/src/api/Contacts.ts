import { apiFetchJson, ApiRequestError } from './client'
import type {
  Contact,
  CreateContactRequest,
  ListPage,
  ListParams,
  PaginatedResponse,
  UpdateContactRequest,
} from './types'

const buildQuery = (params?: ListParams): string => {
  if (!params) return ''
  const search = new URLSearchParams()
  if (params.limit != null) search.set('limit', String(params.limit))
  if (params.offset != null) search.set('offset', String(params.offset))
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

const normalizeList = (response: PaginatedResponse<Contact> | Contact[] | null | undefined): Contact[] => {
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
  response: PaginatedResponse<Contact> | Contact[] | null | undefined,
  params?: ListParams,
): ListPage<Contact> => {
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

/** GET /api/me/contacts — страница с курсором пагинации */
export const listContactsPage = async (params?: ListParams): Promise<ListPage<Contact>> => {
  try {
    const response = await apiFetchJson<PaginatedResponse<Contact> | Contact[] | null>(
      `/api/me/contacts${buildQuery(params)}`,
    )
    return normalizePage(response, params)
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return { items: [], hasMore: false, nextOffset: null }
    }
    throw error
  }
}

/** GET /api/me/contacts — только записи, для вызывающих без пагинации */
export const listContacts = async (params?: ListParams): Promise<Contact[]> =>
  (await listContactsPage(params)).items

/**
 * GET /api/me/contacts/{contactId} — точечная проверка «человек у меня в нитях».
 * 200 — да (с заметкой и профилем), 404 — связи нет либо аккаунт удалён.
 * contactId здесь — id пользователя, как в PUT/DELETE ниже.
 */
export const getContact = async (contactId: string): Promise<Contact | null> => {
  try {
    return await apiFetchJson<Contact>(`/api/me/contacts/${contactId}`)
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return null
    }
    throw error
  }
}

/** POST /api/me/contacts */
export const createContact = async (body: CreateContactRequest): Promise<Contact> =>
  apiFetchJson<Contact>('/api/me/contacts', {
    method: 'POST',
    body: JSON.stringify(body),
  })

/** PUT /api/me/contacts/{contactId} */
export const updateContact = async (contactId: string, body: UpdateContactRequest): Promise<Contact> =>
  apiFetchJson<Contact>(`/api/me/contacts/${contactId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

/** DELETE /api/me/contacts/{contactId} */
export const deleteContact = async (contactId: string): Promise<void> => {
  await apiFetchJson<void>(`/api/me/contacts/${contactId}`, { method: 'DELETE' })
}
