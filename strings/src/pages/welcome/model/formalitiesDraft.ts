const STORAGE_KEY = 'niti-formalities-draft'

export type FormalitiesDraft = {
  open: boolean
  acceptedTerms: boolean
  acceptedPrivacy: boolean
}

export const loadFormalitiesDraft = (): FormalitiesDraft | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as FormalitiesDraft
    if (
      typeof parsed?.open !== 'boolean' ||
      typeof parsed?.acceptedTerms !== 'boolean' ||
      typeof parsed?.acceptedPrivacy !== 'boolean'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export const saveFormalitiesDraft = (draft: FormalitiesDraft) => {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
}

export const clearFormalitiesDraft = () => {
  sessionStorage.removeItem(STORAGE_KEY)
}
