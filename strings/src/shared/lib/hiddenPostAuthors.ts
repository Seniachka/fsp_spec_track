const HIDDEN_AUTHORS_KEY = 'faculty.hiddenPostAuthorIds'

export const listHiddenPostAuthors = (): Set<string> => {
  try {
    const raw = localStorage.getItem(HIDDEN_AUTHORS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

export const hidePostAuthor = (authorId: string) => {
  if (!authorId) return
  const ids = listHiddenPostAuthors()
  ids.add(authorId)
  localStorage.setItem(HIDDEN_AUTHORS_KEY, JSON.stringify([...ids]))
}

export const unhidePostAuthor = (authorId: string) => {
  if (!authorId) return
  const ids = listHiddenPostAuthors()
  if (!ids.delete(authorId)) return
  localStorage.setItem(HIDDEN_AUTHORS_KEY, JSON.stringify([...ids]))
}

export const notifyHiddenAuthorsChanged = () => {
  window.dispatchEvent(new CustomEvent('faculty:hidden-authors-changed'))
}
