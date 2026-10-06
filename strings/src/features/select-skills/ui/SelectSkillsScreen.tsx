import { useEffect, useMemo, useState, type Ref } from 'react'
import { FiChevronDown } from 'react-icons/fi'
import { skillsRepository } from '../../../entities/skill/api/skillsRepository'
import { catalogItemToProfileSkill } from '../../../entities/skill/lib/mappers'
import type { SkillCatalogItem, SkillCategory, SkillType } from '../../../entities/skill/model/types'
import type { Skill } from '../../../entities/profile/model/types'
import ArrowBackIcon from '../../../assets/components/arrowBack'
import { Button } from '../../../shared/ui/button/Button'
import './select-skills.css'

type SelectSkillsScreenProps = {
  type: SkillType
  selected: Skill[]
  onClose: () => void
  onSave: (skills: Skill[]) => Promise<void>
  /** Ref и класс корня — для экранов, которые живут в свайп-оверлее (фильтры поиска) */
  rootRef?: Ref<HTMLElement>
  className?: string
  /** Заголовок вместо дефолтного («Скиллы» / «Интересы») */
  title?: string
  /** Подсказка под поиском; без неё строки нет вовсе (профиль и онбординг) */
  hint?: string
  /** Максимум выбранных навыков; без него выбор не ограничен (профиль и онбординг) */
  maxSelected?: number
  /** Подписи кнопки: по умолчанию «Сохранить» / «Сохранение…» */
  submitLabel?: string
  savingLabel?: string
  /**
   * Показывать выбранные навыки, которых нет в аккордеоне (легаси без категории
   * или выпавшие из каталога), отдельной группой сверху. Нужно там, где есть лимит:
   * иначе невидимую галочку нельзя ни снять, ни честно посчитать. По умолчанию выключено
   * — профиль и онбординг такие навыки просто молча сохраняют.
   */
  showHiddenSelected?: boolean
}

/** Категория со своими навыками — строка аккордеона на экране скиллов */
type SkillGroup = {
  category: SkillCategory
  items: SkillCatalogItem[]
}

const TITLES: Record<SkillType, string> = {
  hard: 'Скиллы',
  soft: 'Интересы',
}

const SEARCH_PLACEHOLDERS: Record<SkillType, string> = {
  hard: 'Найти навык',
  soft: 'Интересы',
}

/** Синтетическая категория для выбранных навыков вне аккордеона: id не пересекается с реальными */
const HIDDEN_CATEGORY: SkillCategory = { id: -1, name: 'Выбранные', sortOrder: -1 }

export const SelectSkillsScreen = ({
  type,
  selected,
  onClose,
  onSave,
  rootRef,
  className,
  title,
  hint,
  maxSelected,
  submitLabel = 'Сохранить',
  savingLabel = 'Сохранение…',
  showHiddenSelected = false,
}: SelectSkillsScreenProps) => {
  const isHard = type === 'hard'
  const [catalog, setCatalog] = useState<SkillCatalogItem[]>([])
  const [categories, setCategories] = useState<SkillCategory[]>([])
  // Группа «Выбранные» раскрыта сразу: там лежит то, что пользователю нужно увидеть первым
  const [openCategoryIds, setOpenCategoryIds] = useState<Set<number>>(
    () => new Set([HIDDEN_CATEGORY.id]),
  )
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set(selected.map((s) => s.id)))
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const load = async (): Promise<{ items: SkillCatalogItem[]; cats: SkillCategory[] }> => {
      if (type === 'hard') {
        // Каталог и категории независимы — тянем разом, чтобы был один экран загрузки
        const [items, cats] = await Promise.all([
          skillsRepository.getCatalog('hard'),
          skillsRepository.getKeySkillCategories(),
        ])
        return { items, cats }
      }
      return { items: await skillsRepository.getCatalog(type), cats: [] }
    }
    void load().then(({ items, cats }) => {
      if (cancelled) return
      setCatalog(items)
      setCategories(cats)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [type])

  const q = query.trim().toLowerCase()

  const sortedCategories = useMemo(
    () =>
      [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru')),
    [categories],
  )

  /** Навыки, разложенные по категориям: без категории (легаси) и без её описания в список не попадают */
  const categoryGroups = useMemo<SkillGroup[]>(() => {
    if (!isHard) return []
    const byCategory = new Map<number, SkillCatalogItem[]>()
    for (const item of catalog) {
      if (item.categoryId == null) continue
      const bucket = byCategory.get(item.categoryId)
      if (bucket) bucket.push(item)
      else byCategory.set(item.categoryId, [item])
    }
    return sortedCategories
      .map((category) => ({
        category,
        items: [...(byCategory.get(category.id) ?? [])].sort(
          (a, b) =>
            (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
            a.label.localeCompare(b.label, 'ru'),
        ),
      }))
      .filter((group) => group.items.length > 0)
  }, [isHard, catalog, sortedCategories])

  /**
   * Уже выбранные навыки, которых в аккордеоне нет (легаси без categoryId или выпавшие
   * из каталога). Показываем их отдельной группой, иначе галочку не снять, а лимит выбора
   * упирается в невидимые строки.
   */
  const hiddenSelectedGroup = useMemo<SkillGroup | null>(() => {
    if (!showHiddenSelected || !isHard) return null
    const inCategories = new Set<number>()
    for (const group of categoryGroups) {
      for (const item of group.items) inCategories.add(item.id)
    }
    const hidden = selected.filter((skill) => !inCategories.has(skill.id))
    // Каталог перебираем, только если прятать действительно есть что (обычный случай — нечего)
    if (hidden.length === 0) return null
    const byId = new Map(catalog.map((item) => [item.id, item]))
    const items = hidden
      .map<SkillCatalogItem>(
        (skill) =>
          byId.get(skill.id) ?? { id: skill.id, label: skill.label, type, categoryId: null },
      )
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
    return { category: HIDDEN_CATEGORY, items }
  }, [showHiddenSelected, isHard, categoryGroups, catalog, selected, type])

  const groups = useMemo<SkillGroup[]>(
    () => (hiddenSelectedGroup ? [hiddenSelectedGroup, ...categoryGroups] : categoryGroups),
    [hiddenSelectedGroup, categoryGroups],
  )

  const visibleGroups = useMemo<SkillGroup[]>(() => {
    if (!q) return groups
    return groups
      .map((group) => ({
        category: group.category,
        items: group.items.filter((item) => item.label.toLowerCase().includes(q)),
      }))
      .filter((group) => group.items.length > 0)
  }, [groups, q])

  const selectedCountByCategory = useMemo(() => {
    const counts = new Map<number, number>()
    for (const group of groups) {
      counts.set(group.category.id, group.items.filter((item) => selectedIds.has(item.id)).length)
    }
    return counts
  }, [groups, selectedIds])

  const filtered = useMemo(() => {
    if (!q) return catalog
    return catalog.filter((item) => item.label.toLowerCase().includes(q))
  }, [catalog, q])

  /** Всё, что пользователь может снять на этом экране */
  const displayable = useMemo<SkillCatalogItem[]>(
    () => (isHard ? groups.flatMap((group) => group.items) : catalog),
    [isHard, groups, catalog],
  )

  const displayableIds = useMemo(() => new Set(displayable.map((item) => item.id)), [displayable])

  /** Лимит считаем только по видимым строкам: невидимую галочку пользователь снять не может */
  const countVisibleSelected = (ids: Set<number>) => {
    let count = 0
    for (const id of ids) {
      if (displayableIds.has(id)) count += 1
    }
    return count
  }

  const limitReached = maxSelected != null && countVisibleSelected(selectedIds) >= maxSelected

  const toggle = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (maxSelected != null && countVisibleSelected(prev) >= maxSelected) return prev
        next.add(id)
      }
      return next
    })
  }

  const toggleCategory = (id: number) => {
    setOpenCategoryIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    // Уже сохранённые навыки, которых нет среди показанных (легаси без категории или
    // выпавшие из каталога), снять пользователь не мог — оставляем как есть,
    // иначе сохранение их сотрёт
    const skills = [
      ...displayable.filter((item) => selectedIds.has(item.id)).map(catalogItemToProfileSkill),
      ...selected.filter((skill) => !displayableIds.has(skill.id)),
    ]
    setSaving(true)
    try {
      await onSave(skills)
    } finally {
      setSaving(false)
    }
  }

  const renderSkill = (item: SkillCatalogItem, nested: boolean) => {
    const checked = selectedIds.has(item.id)
    // Лимит выбора: невыбранные строки гаснут и перестают нажиматься
    const blocked = limitReached && !checked
    return (
      <li key={item.id}>
        <button
          type="button"
          className={`select-skills__item${nested ? ' select-skills__item--nested' : ''}${
            blocked ? ' select-skills__item--blocked' : ''
          }`}
          onClick={() => toggle(item.id)}
          disabled={blocked}
        >
          <span
            className={`select-skills__checkbox${checked ? ' select-skills__checkbox--checked' : ''}`}
            aria-hidden
          >
            {checked ? '✓' : ''}
          </span>
          <span className="select-skills__label">{item.label}</span>
        </button>
      </li>
    )
  }

  const renderCategories = () => {
    if (visibleGroups.length === 0) return <li className="select-skills__empty">Ничего не нашлось</li>
    // При поиске категории работают как разделители: раскрыты все, сворачивать нечего
    const searching = q.length > 0
    return visibleGroups.map(({ category, items }) => {
      const expanded = searching || openCategoryIds.has(category.id)
      const count = selectedCountByCategory.get(category.id) ?? 0
      const badge =
        count > 0 ? <span className="select-skills__category-badge">{count}</span> : null
      return (
        <li key={category.id} className="select-skills__group">
          {searching ? (
            <div className="select-skills__category select-skills__category--static">
              <span className="select-skills__category-name">{category.name}</span>
              {badge}
            </div>
          ) : (
            <button
              type="button"
              className="select-skills__category"
              onClick={() => toggleCategory(category.id)}
              aria-expanded={expanded}
            >
              <span className="select-skills__category-name">{category.name}</span>
              {badge}
              <FiChevronDown
                className={`select-skills__category-chevron${
                  expanded ? ' select-skills__category-chevron--open' : ''
                }`}
                size={20}
                aria-hidden
              />
            </button>
          )}
          {expanded && (
            <ul className="select-skills__sublist" role="group" aria-label={category.name}>
              {items.map((item) => renderSkill(item, true))}
            </ul>
          )}
        </li>
      )
    })
  }

  const heading = title ?? TITLES[type]

  return (
    <section
      ref={rootRef}
      className={`select-skills${className ? ` ${className}` : ''}`}
      aria-label={heading}
    >
      <header className="select-skills__header">
        <button type="button" className="select-skills__back" onClick={onClose} aria-label="Назад">
          <ArrowBackIcon />
        </button>
        <h1 className="select-skills__title">{heading}</h1>
      </header>

      <div className="select-skills__search-wrap">
        <label className="select-skills__search">
          <span className="select-skills__search-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M11.5 7C11.5 9.48528 9.48528 11.5 7 11.5C4.51472 11.5 2.5 9.48528 2.5 7C2.5 4.51472 4.51472 2.5 7 2.5C9.48528 2.5 11.5 4.51472 11.5 7ZM10.6792 11.7399C9.66322 12.5297 8.38653 13 7 13C3.68629 13 1 10.3137 1 7C1 3.68629 3.68629 1 7 1C10.3137 1 13 3.68629 13 7C13 8.38653 12.5297 9.66322 11.7399 10.6792L14.5303 13.4697C14.8232 13.7626 14.8232 14.2374 14.5303 14.5303C14.2374 14.8232 13.7626 14.8232 13.4697 14.5303L10.6792 11.7399Z"
                fill="black"
                fillOpacity="0.5"
              />
            </svg>
          </span>
          <input
            type="search"
            className="select-skills__search-input"
            placeholder={SEARCH_PLACEHOLDERS[type]}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {hint && <p className="select-skills__hint">{hint}</p>}

      <ul className="select-skills__list">
        {loading && catalog.length === 0 ? (
          <li className="select-skills__empty">Загрузка…</li>
        ) : isHard ? (
          renderCategories()
        ) : (
          filtered.map((item) => renderSkill(item, false))
        )}
      </ul>

      <footer className="select-skills__footer">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? savingLabel : submitLabel}
        </Button>
      </footer>
    </section>
  )
}
