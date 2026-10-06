import { apiFetchJson } from './client'

export type ComplaintRequest = {
  reason: string
  text: string
}

const normalizeComplaint = (payload: { reason: string; text?: string }): ComplaintRequest => {
  const reason = payload.reason.trim()
  const text = (payload.text ?? '').trim() || 'Без комментария'
  return { reason, text }
}

/** POST /api/students/{id}/complaints — 202 */
export const complainAboutStudent = async (
  userId: string,
  payload: { reason: string; text?: string },
): Promise<void> => {
  await apiFetchJson<void>(`/api/students/${userId}/complaints`, {
    method: 'POST',
    body: JSON.stringify(normalizeComplaint(payload)),
  })
}

/** POST /api/posts/{id}/complaints — 202 */
export const complainAboutPost = async (
  postId: string,
  payload: { reason: string; text?: string },
): Promise<void> => {
  await apiFetchJson<void>(`/api/posts/${postId}/complaints`, {
    method: 'POST',
    body: JSON.stringify(normalizeComplaint(payload)),
  })
}
