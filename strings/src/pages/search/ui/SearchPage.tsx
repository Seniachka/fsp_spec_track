import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { FiSearch } from 'react-icons/fi'
import type { UserSearchResult } from '../../../api/types'
import { LOCAL_STATUSES } from '../lib/localCatalogs'
import { useStudentSearch, type SearchCardUser } from '../lib/useStudentSearch'
import {
  emptySearchFilters,
  hasActiveSearchFilters,
  type SearchFiltersState,
} from '../model/types'
import linesBg from '../../../assets/Lines_bg_search.png'
import FiltersIcon from '../../../assets/FiltersIcon.svg?url'
import EmptyIcon from '../../../assets/Path.svg'
import './search-page.css'
import { AvatarSticker } from '../../../shared/ui/avatar-sticker/AvatarSticker'
import { UserAvatar } from '../../../shared/ui/user-avatar/UserAvatar'
import { useAvatarStickers } from '../../../shared/lib/useAvatarStickers'
import { usePageContext } from '../../../shared/lib/usePageContext'
import { useMinLoading } from '../../../shared/lib/useMinLoading'
import { useTabNavigation } from '../../../app/providers/TabNavigationContext'

const UserCard = ({
  user,
  onClick,
  sticker,
}: {
  user: SearchCardUser
  onClick: () => void
  sticker: 'favorite' | 'note' | 'scan' | null
}) => {
  return (
    <div className="search-page__user-card" onClick={onClick}>
      <div className="search-page__user-avatar">
        <UserAvatar
          userId={user.id}
          photoUrl={user.photoUrl}
          size="sm"
          alt={`${user.firstName} ${user.lastName}`}
        />
        {sticker && <AvatarSticker kind={sticker} />}
      </div>
      <div className="search-page__user-info">
        <p className="search-page__user-name">
          {user.firstName} {user.lastName}
        </p>
        {user.description && <p className="search-page__user-desc">{user.description}</p>}
      </div>
    </div>
  )
}

const SearchSkeleton = () => (
  <div className="search-page__skeleton" aria-hidden>
    {Array.from({ length: 3 }, (_, i) => (
      <div key={i} className="search-page__user-card search-page__user-card--skeleton">
        <div className="search-page__user-avatar">
          <div className="search-page__skeleton-block search-page__skeleton-block--avatar" />
        </div>
        <div className="search-page__user-info">
          <div className="search-page__skeleton-block search-page__skeleton-block--name" />
          <div className="search-page__skeleton-block search-page__skeleton-block--desc" />
        </div>
      </div>
    ))}
  </div>
)

const normalizeFilters = (raw: Partial<SearchFiltersState> | undefined): SearchFiltersState => {
  const base = emptySearchFilters()
  if (!raw) return base
  return {
    ...base,
    ...raw,
    hardSkills: Array.isArray(raw.hardSkills) ? raw.hardSkills : [],
    softSkills: Array.isArray(raw.softSkills) ? raw.softSkills : [],
  }
}

export const SearchPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { openUserProfile } = useTabNavigation()

  type SearchCtx = {
    searchQuery: string
    activeStatusId: number | null
    filters: SearchFiltersState
  }

  const [ctx, setCtx] = usePageContext<SearchCtx>('search', {
    searchQuery: '',
    activeStatusId: null,
    filters: emptySearchFilters(),
  })
  const searchQuery = ctx.searchQuery
  const setSearchQuery = (v: string) => setCtx((prev) => ({ ...prev, searchQuery: v }))
  const activeStatusId = ctx.activeStatusId
  const setActiveStatusId = (v: number | null) => setCtx((prev) => ({ ...prev, activeStatusId: v }))
  const filters = ctx.filters
  const setFilters = (v: SearchFiltersState | ((prev: SearchFiltersState) => SearchFiltersState)) =>
    setCtx((prev) => ({
      ...prev,
      filters: typeof v === 'function' ? v(prev.filters) : v,
    }))
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  /** Метка последнего применённого набора фильтров — см. эффект ниже */
  const appliedFiltersAtRef = useRef<number | null>(null)

  const statuses = LOCAL_STATUSES
  const { getSticker } = useAvatarStickers()

  // Поиск смонтирован и под фильтрами, и под профилем (keep-alive), поэтому
  // location.state прилетает сюда и при открытии фильтров, и при возврате POP.
  // Применяем набор ровно один раз — по метке filtersAppliedAt из «Сохранить»,
  // иначе сбрасывался бы чип статуса, выдача и пагинация.
  useEffect(() => {
    const state = location.state as
      | { filters?: Partial<SearchFiltersState>; filtersAppliedAt?: number }
      | null
    if (!state?.filters || state.filtersAppliedAt == null) return
    if (appliedFiltersAtRef.current === state.filtersAppliedAt) return
    appliedFiltersAtRef.current = state.filtersAppliedAt

    const next = normalizeFilters(state.filters)
    setCtx((prev) => ({
      ...prev,
      filters: next,
      activeStatusId: next.statusId ?? null,
    }))
  }, [location.state])

  const chipStatusId = filters.statusId ?? activeStatusId

  const {
    results,
    loading: loadingRaw,
    loadingMore,
    hasMore,
    loadMore,
    error,
    isActive,
  } = useStudentSearch(searchQuery, filters, filters.statusId ? null : activeStatusId)
  const loading = useMinLoading(loadingRaw)

  const suggestions = useMemo(() => {
    if (!searchQuery.trim() || !showSuggestions) return []
    return results.slice(0, 5)
  }, [searchQuery, showSuggestions, results])

  const hasFilters = hasActiveSearchFilters(filters) || activeStatusId != null
  const hasSearch = searchQuery.trim() !== ''
  const showResults = hasSearch || hasFilters || isActive
  const hasResults = results.length > 0
  // фон линий — только стартовый экран без поиска
  const showLinesBg = !showResults

  const handleFocus = () => setShowSuggestions(true)
  const handleBlur = () => setTimeout(() => setShowSuggestions(false), 200)

  const handleSuggestionClick = (user: UserSearchResult) => {
    setSearchQuery(`${user.firstName} ${user.lastName}`)
    setShowSuggestions(false)
  }

  const handleStatusClick = (statusId: number | null) => {
    setActiveStatusId(statusId)
    if (filters.statusId != null) {
      setFilters((prev) => ({
        ...prev,
        statusId: undefined,
        statusLabel: undefined,
      }))
    }
  }

  const handleOpenFilters = () => navigate('/search/filters', { state: { filters } })
  const handleUserClick = (userId: string) => openUserProfile(userId, 'search')

  return (
    <main className="search-page">
      <div className="search-page__content">
        <h1 className="search-page__title">Поиск</h1>

        <div className="search-page__search-bar">
          <div className="search-page__input-wrapper">
            <FiSearch className="search-page__search-icon" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Имя Фамилия"
              className="search-page__input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </div>
          <button type="button" className="search-page__filters-btn" onClick={handleOpenFilters}>
            <img src={FiltersIcon} alt="Фильтры" style={{ width: 20, height: 20 }} />
          </button>

          {showSuggestions && searchQuery.trim() && suggestions.length > 0 && (
            <div className="search-page__suggestions">
              {suggestions.map((user) => (
                <div
                  key={user.id}
                  className="search-page__suggestion-item"
                  onMouseDown={() => handleSuggestionClick(user)}
                >
                  <span>
                    {user.firstName} {user.lastName}
                  </span>
                  <span className="search-page__suggestion-desc">{user.speciality}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className={`search-page__list-block${showLinesBg ? ' search-page__list-block--with-bg' : ''}`}
          style={showLinesBg ? { backgroundImage: `url(${linesBg})` } : undefined}
        >
          <div className="search-page__quick-filters">
            <button
              type="button"
              className={`search-page__quick-filter ${chipStatusId == null ? 'search-page__quick-filter--active' : ''}`}
              onClick={() => handleStatusClick(null)}
            >
              Все
            </button>
            {statuses.map((status) => (
              <button
                type="button"
                key={status.id}
                className={`search-page__quick-filter ${chipStatusId === status.id ? 'search-page__quick-filter--active' : ''}`}
                onClick={() => handleStatusClick(status.id)}
              >
                {status.content}
              </button>
            ))}
          </div>

          <div className="search-page__results">
            {showResults ? (
              error ? (
                <div className="search-page__status-msg">
                  <p className="search-page__status-msg-title">Ошибка поиска</p>
                  <p className="search-page__status-msg-sub">{error}</p>
                </div>
              ) : loading ? (
                <SearchSkeleton />
              ) : hasResults ? (
                results.map((user) => (
                  // relation из выдачи не подмешиваем: карточки живут в state
                  // keep-alive-страницы и после правки избранного в профиле
                  // остаются с устаревшим relation — стикер берём из useAvatarStickers
                  <UserCard
                    key={user.id}
                    user={user}
                    sticker={getSticker(user.id)}
                    onClick={() => handleUserClick(user.id)}
                  />
                ))
              ) : (
                <div className="search-page__no-results">
                  <img src={EmptyIcon} alt="" className="search-page__no-results-icon" />
                  <h3 className="search-page__no-results-title">
                    {hasMore ? 'Пока не нашли' : 'Никого не нашли'}
                  </h3>
                  <p className="search-page__no-results-sub">
                    {hasMore
                      ? 'В первых результатах совпадений нет — можно поискать дальше'
                      : 'Попробуй немного поменять фильтры'}
                  </p>
                </div>
              )
            ) : (
              <div className="search-page__empty-state">
                <div className="search-page__empty-content">
                  <p className="search-page__empty-text">
                    <span className="search-page__empty-text-line">Находи</span>
                    <span className="search-page__empty-text-line">новые нити</span>
                  </p>
                </div>
              </div>
            )}

            {/* Без hasResults: при edu-фильтрах первое окно может быть пустым,
                но дальше по offset совпадения есть — кнопка должна остаться. */}
            {showResults && !error && !loading && hasMore && (
              <button
                type="button"
                className="load-more-btn"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? 'Загружаем…' : 'Загрузить ещё'}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
