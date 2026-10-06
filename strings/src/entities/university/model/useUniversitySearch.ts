import { useEffect, useMemo, useState } from 'react'
import { UNIVERSITIES_MAX_PAGE_LIMIT, listUniversitiesPage } from '../../../api/Reference'
import { isAuthenticated } from '../../../api/client'
import { mergeUniversitiesCache, searchUniversities, type University } from './universities'

/** Пауза перед запросом — та же, что в поиске людей (useStudentSearch) */
const DEBOUNCE_MS = 300

/** Сколько вузов показываем за раз: больше бэкенд всё равно не отдаст */
const PAGE_LIMIT = UNIVERSITIES_MAX_PAGE_LIMIT

export type UseUniversitySearchResult = {
  universities: University[]
  loading: boolean
  error: string | null
  /** Список собран из локального каталога: справочник с бэка не доехал */
  fromFallback: boolean
}

type UniversitySearchState = {
  /** Запрос, к которому относится список; null — ответа ещё не было */
  query: string | null
  universities: University[]
  fromFallback: boolean
  error: string | null
}

/** Локальный каталог тем же правилом, что и серверный поиск: имя или аббревиатура */
const localMatches = (query: string): University[] =>
  searchUniversities(query).slice(0, PAGE_LIMIT)

/**
 * Поиск вуза на сервере: GET /api/universities?q=… .
 * Весь справочник больше не вычитываем — после импорта мирового списка в нём
 * порядка десяти тысяч записей, и постраничный обход занимал бы около сотни
 * последовательных запросов на каждом открытии поля выбора вуза.
 *
 * Пустой ввод отдаёт первую страницу справочника: бэкенд ставит вузы каталога ЦУ
 * первыми, поэтому это осмысленный первый экран, а не пустота.
 * Если API недоступен (или отдал пусто), фильтруем локальный каталог, как раньше.
 */
export const useUniversitySearch = (query: string): UseUniversitySearchResult => {
  const trimmed = query.trim()
  const [state, setState] = useState<UniversitySearchState>(() => ({
    // Без авторизации запроса не будет — список сразу считаем окончательным
    query: isAuthenticated() ? null : '',
    universities: localMatches(''),
    fromFallback: !isAuthenticated(),
    error: null,
  }))

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    // Дебаунс: пока набирают, запрос не уходит. Всё состояние меняем уже внутри
    // таймера — синхронный setState в теле эффекта дал бы каскад рендеров.
    const timer = window.setTimeout(() => {
      if (!isAuthenticated()) {
        setState({
          query: trimmed,
          universities: localMatches(trimmed),
          fromFallback: true,
          error: null,
        })
        return
      }

      void listUniversitiesPage(
        { q: trimmed, limit: PAGE_LIMIT, offset: 0 },
        { signal: controller.signal },
      )
        .then((page) => {
          if (cancelled) return
          if (page.data.length > 0) {
            // Найденное дописываем в общий кэш: getUniversityById должен узнавать
            // вузы, которых нет в локальном каталоге (подписи в профиле и нитях).
            mergeUniversitiesCache(page.data)
            setState({
              query: trimmed,
              universities: page.data,
              fromFallback: false,
              error: null,
            })
            return
          }
          // Пусто — либо справочник не доехал, либо и правда ничего не нашлось:
          // в обоих случаях показываем локальный каталог (он же и есть фолбэк).
          setState({
            query: trimmed,
            universities: localMatches(trimmed),
            fromFallback: true,
            error: null,
          })
        })
        .catch((err: unknown) => {
          if (cancelled) return
          setState({
            query: trimmed,
            universities: localMatches(trimmed),
            fromFallback: true,
            error: err instanceof Error ? err.message : 'Не удалось загрузить вузы',
          })
        })
    }, DEBOUNCE_MS)

    return () => {
      // Ввод продолжился — устаревший запрос отменяем, его ответ не применяем
      cancelled = true
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [trimmed])

  // Список ещё от прошлого запроса — значит идёт поиск. Отдельного флага нет:
  // его пришлось бы поднимать синхронно в эффекте.
  const loading = state.query !== trimmed

  return useMemo(
    () => ({
      universities: state.universities,
      loading,
      error: state.error,
      fromFallback: state.fromFallback,
    }),
    [state.universities, state.error, state.fromFallback, loading],
  )
}
