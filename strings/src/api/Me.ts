import { apiFetchJson, ApiRequestError } from './client'
import type {
  ConsentPayload,
  EduPlace,
  EduPlaceInput,
  ListParams,
  PaginatedResponse,
  Social,
  SocialInput,
  UpdateMeData,
  UserProfile,
  UserSkill,
  WorkPlace,
  WorkPlaceInput,
} from './types'

const buildQuery = (params?: ListParams): string => {
  if (!params) return ''
  const search = new URLSearchParams()
  if (params.limit != null) search.set('limit', String(params.limit))
  if (params.offset != null) search.set('offset', String(params.offset))
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

let getMeInflight: Promise<UserProfile | null> | null = null

export const resetGetMeInflight = (): void => {
  getMeInflight = null
}

/**
 * Транспортные опции для конкретного вызова /api/me.
 * Стартовые гейты (welcome, RequireOnboardingComplete) режут бюджет ретраев:
 * дефолтные 4 попытки по 30 с держат пользователя на пустом экране ~2 минуты.
 */
export type GetMeOptions = {
  nativeTimeoutMs?: number
  nativeRetryAttempts?: number
}

/** Короткая политика для стартовых гейтов: 2 попытки по 8 с ≈ 16 с худшего случая. */
export const GATE_GET_ME_OPTIONS: GetMeOptions = {
  nativeTimeoutMs: 8000,
  nativeRetryAttempts: 2,
}

export const getMe = async (options?: GetMeOptions): Promise<UserProfile | null> => {
  // Схлопываем параллельные /me (useProfile + useMe на старте).
  // Опции применяются к запросу, который его и завёл: догоняющие вызовы
  // ждут уже летящий, а гейты всё равно рисуют ошибку по своему таймеру.
  if (getMeInflight) return getMeInflight

  getMeInflight = (async () => {
    try {
      return await apiFetchJson<UserProfile | null>('/api/me', options)
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        return null
      }
      throw error
    } finally {
      getMeInflight = null
    }
  })()

  return getMeInflight
}

export type UpdateMeParams = {
  data?: UpdateMeData
  photo?: File | Blob | null
}

const photoFileName = (photo: File | Blob): string =>
  photo instanceof File && photo.name.trim() ? photo.name : 'avatar.jpg'

/**
 * PUT /api/me
 * multipart:
 * - `data` — JSON-строка (не File! иначе бэкенд игнорирует)
 * - `photo` — файл image/* (сохраняется в S3 + `users.photo_s3_key`)
 *
 * Идёт через native-очередь + ретраи в apiFetch (FormData).
 * Бэк также умеет application/json без multipart — можно упростить после выката.
 */
export const updateMe = async ({ data, photo }: UpdateMeParams): Promise<UserProfile> => {
  if (data == null && photo == null) {
    throw new Error('updateMe: нужен data и/или photo')
  }

  const formData = new FormData()

  if (data != null) {
    formData.append('data', JSON.stringify(data))
  }

  if (photo != null) {
    // Имя файла важно: иначе часть клиентов шлёт photo без filename/Content-Type image/*
    formData.append('photo', photo, photoFileName(photo))
  }

  return apiFetchJson<UserProfile>('/api/me', {
    method: 'PUT',
    body: formData,
  })
}

/** Удаление аватарки через DELETE /api/me/photo */
export const deleteMePhoto = async (): Promise<void> => {
  await apiFetchJson<void>('/api/me/photo', { method: 'DELETE' })
}

/** DELETE /api/me — soft-delete аккаунта */
export const deleteMe = async (): Promise<void> => {
  await apiFetchJson<void>('/api/me', { method: 'DELETE' })
}

/** POST /api/me/restore — восстановление soft-deleted аккаунта */
export const restoreMe = async (): Promise<UserProfile | null> =>
  apiFetchJson<UserProfile | null>('/api/me/restore', { method: 'POST' })

/**
 * POST /api/me/consent — фиксируем принятые редакции документов.
 * Работает и для CU-сессии, и для админской, ещё до завершения онбординга.
 * 404/405 — старый бэкенд без эндпоинта: вызывающий не должен блокировать вход.
 */
export const recordConsent = async (payload: ConsentPayload): Promise<void> => {
  await apiFetchJson<void>('/api/me/consent', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** POST /api/me/onboarding/complete */
export const completeOnboarding = async (): Promise<void> => {
  await apiFetchJson<void>('/api/me/onboarding/complete', { method: 'POST' })
}


const normalizeList = <T>(
  response: PaginatedResponse<T> | T[] | null | undefined,
): T[] => {
  if (response == null) return []
  if (Array.isArray(response)) return response
  return response.data ?? []
}

/**
 * 404 — это «раздела ещё нет», нормальная пустота.
 * Остальное (сеть, 5xx) отдаём наверх: молча опустевший профиль выглядит как
 * потеря данных, а по проброшенной ошибке UI покажет человеческий текст
 * (toUserError различает сеть, 401/403 и серверные сбои).
 */
const safeList = async <T>(
  loader: () => Promise<PaginatedResponse<T> | T[] | null | undefined>,
): Promise<T[]> => {
  try {
    return normalizeList(await loader())
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return []
    }
    throw error
  }
}

export const listEduPlaces = async (params?: ListParams): Promise<EduPlace[]> =>
  safeList(() =>
    apiFetchJson<PaginatedResponse<EduPlace> | EduPlace[] | null>(
      `/api/me/edu-places${buildQuery(params)}`,
    ),
  )

export const createEduPlace = async (body: EduPlaceInput): Promise<EduPlace> =>
  apiFetchJson<EduPlace>('/api/me/edu-places', { method: 'POST', body: JSON.stringify(body) })

export const updateEduPlace = async (eduId: number, body: EduPlaceInput): Promise<EduPlace> =>
  apiFetchJson<EduPlace>(`/api/me/edu-places/${eduId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

export const deleteEduPlace = async (eduId: number): Promise<void> => {
  await apiFetchJson<void>(`/api/me/edu-places/${eduId}`, { method: 'DELETE' })
}

export const listWorkPlaces = async (params?: ListParams): Promise<WorkPlace[]> =>
  safeList(() =>
    apiFetchJson<PaginatedResponse<WorkPlace> | WorkPlace[] | null>(
      `/api/me/work-places${buildQuery(params)}`,
    ),
  )

export const createWorkPlace = async (body: WorkPlaceInput): Promise<WorkPlace> =>
  apiFetchJson<WorkPlace>('/api/me/work-places', { method: 'POST', body: JSON.stringify(body) })

export const updateWorkPlace = async (workId: number, body: WorkPlaceInput): Promise<WorkPlace> =>
  apiFetchJson<WorkPlace>(`/api/me/work-places/${workId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

export const deleteWorkPlace = async (workId: number): Promise<void> => {
  await apiFetchJson<void>(`/api/me/work-places/${workId}`, { method: 'DELETE' })
}

export const listSocials = async (params?: ListParams): Promise<Social[]> =>
  safeList(() =>
    apiFetchJson<PaginatedResponse<Social> | Social[] | null>(`/api/me/socials${buildQuery(params)}`),
  )

export const createSocial = async (body: SocialInput): Promise<Social> =>
  apiFetchJson<Social>('/api/me/socials', { method: 'POST', body: JSON.stringify(body) })

export const updateSocial = async (socialId: number, body: SocialInput): Promise<Social> =>
  apiFetchJson<Social>(`/api/me/socials/${socialId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

export const deleteSocial = async (socialId: number): Promise<void> => {
  await apiFetchJson<void>(`/api/me/socials/${socialId}`, { method: 'DELETE' })
}

export const listKeySkills = async (params?: ListParams): Promise<UserSkill[]> =>
  safeList(() =>
    apiFetchJson<PaginatedResponse<UserSkill> | UserSkill[] | null>(
      `/api/me/key-skills${buildQuery(params)}`,
    ),
  )

export const addKeySkill = async (skillId: number): Promise<void> => {
  await apiFetchJson<void>(`/api/me/key-skills/${skillId}`, { method: 'POST' })
}

export const removeKeySkill = async (skillId: number): Promise<void> => {
  await apiFetchJson<void>(`/api/me/key-skills/${skillId}`, { method: 'DELETE' })
}

export const listSoftSkills = async (params?: ListParams): Promise<UserSkill[]> =>
  safeList(() =>
    apiFetchJson<PaginatedResponse<UserSkill> | UserSkill[] | null>(
      `/api/me/soft-skills${buildQuery(params)}`,
    ),
  )

export const addSoftSkill = async (skillId: number): Promise<void> => {
  await apiFetchJson<void>(`/api/me/soft-skills/${skillId}`, { method: 'POST' })
}

export const removeSoftSkill = async (skillId: number): Promise<void> => {
  await apiFetchJson<void>(`/api/me/soft-skills/${skillId}`, { method: 'DELETE' })
}

/** GET /api/me/completeness — заполненность профиля (0–100) */
export type MeCompleteness = {
  percent: number
}

export const getMeCompleteness = async (): Promise<MeCompleteness> =>
  apiFetchJson<MeCompleteness>('/api/me/completeness')
