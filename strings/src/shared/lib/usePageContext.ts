import { useEffect, useRef, useState } from 'react'

const PAGE_CONTEXT_PREFIX = 'faculty.pageContext.'

/**
 * Состояние страниц — данные аккаунта, а не устройства: поисковый запрос,
 * фильтры и активная вкладка «Нити» не должны переезжать в следующий аккаунт.
 * Вызывается из clearUserScopedStores (логаут и смена аккаунта).
 */
export const clearPageContexts = (): void => {
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(PAGE_CONTEXT_PREFIX)) keys.push(key)
    }
    for (const key of keys) {
      sessionStorage.removeItem(key)
    }
  } catch {
    // приватный режим/квоты — молча пропускаем
  }
}

/**
 * Сохраняет состояние страницы в sessionStorage и восстанавливает при монтировании.
 * Нужно, чтобы при уходе в профиль и возврате сохранялись фильтры/запрос и т.п.
 */
export const usePageContext = <T,>(key: string, initial: T) => {
  const storageKey = `${PAGE_CONTEXT_PREFIX}${key}`
  const restored = useRef(false)

  const [state, setState] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (!raw) return initial
      const parsed = JSON.parse(raw) as T
      if (
        initial !== null &&
        typeof initial === 'object' &&
        !Array.isArray(initial) &&
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      ) {
        return { ...initial, ...parsed }
      }
      return parsed
    } catch {
      return initial
    }
  })

  useEffect(() => {
    restored.current = true
  }, [])

  useEffect(() => {
    if (!restored.current) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // ignore quota
    }
  }, [state, storageKey])

  return [state, setState] as const
}
