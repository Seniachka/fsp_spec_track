import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { FiArrowLeft } from 'react-icons/fi'
import { FACULTY_OPTIONS } from '../../onboarding/model/facultyOptions'
import { SelectDropdown } from '../../../shared/ui/select-dropdown/SelectDropdown'
import { useWorkPositions } from '../../../shared/lib/useWorkPositions'
import { usePageSwipeRight } from '../../../shared/lib/usePageSwipeRight'
import { useSearchReference } from '../lib/useSearchReference'
import {
  emptySearchFilters,
  getCoursesByGrade,
  getEduGradeLabel,
  type SearchFiltersState,
  type SelectedSkill,
} from '../model/types'
import './filters-page.css'

const SkillBadge = ({ name, onRemove }: { name: string; onRemove: () => void }) => (
  <span className="filters-page__skill-badge">
    {name}
    <button type="button" className="filters-page__skill-remove" onClick={onRemove}>
      ×
    </button>
  </span>
)

const normalizeIncomingFilters = (raw: Partial<SearchFiltersState> | undefined): SearchFiltersState => {
  const base = emptySearchFilters()
  if (!raw) return base

  const normalizeSkills = (skills: unknown): SelectedSkill[] => {
    if (!Array.isArray(skills)) return []
    return skills
      .map((item) => {
        if (item && typeof item === 'object' && 'id' in item && 'name' in item) {
          const id = Number((item as SelectedSkill).id)
          const name = String((item as SelectedSkill).name ?? '')
          if (!Number.isFinite(id) || !name) return null
          return { id, name }
        }
        return null
      })
      .filter((s): s is SelectedSkill => s != null)
  }

  return {
    ...base,
    statusId: raw.statusId,
    statusLabel: raw.statusLabel,
    speciality: raw.speciality ?? '',
    workPlace: raw.workPlace ?? '',
    faculty: raw.faculty ?? '',
    degree: raw.degree,
    course: raw.course,
    hardSkills: normalizeSkills(raw.hardSkills),
    softSkills: normalizeSkills(raw.softSkills),
  }
}

export const FiltersPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const isCoveredBySkills =
    location.pathname.startsWith('/search/filters/hard-skills') ||
    location.pathname.startsWith('/search/filters/soft-skills')
  const { rootRef, rootClassName, navigateBack } = usePageSwipeRight({
    backTo: '/search',
    edgeSwipeEnabled: !isCoveredBySkills,
  })
  const {
    statuses,
    companies,
    eduGrades,
    keySkills,
    softSkills: softSkillsCatalog,
    skillsLoading,
    error: referenceError,
  } = useSearchReference()
  const {
    names: specialityOptions,
    error: specialitiesError,
  } = useWorkPositions()

  const getInitialFilters = (): SearchFiltersState => {
    const state = location.state as {
      keepFilters?: boolean
      updatedSkillType?: 'hard' | 'soft'
      updatedSkills?: SelectedSkill[]
      filters?: Partial<SearchFiltersState>
    } | null

    if (state?.keepFilters) {
      const saved = localStorage.getItem('filtersState')
      if (saved) {
        try {
          const parsed = normalizeIncomingFilters(JSON.parse(saved) as Partial<SearchFiltersState>)
          if (state.updatedSkillType === 'hard') {
            return { ...parsed, hardSkills: state.updatedSkills || [] }
          }
          if (state.updatedSkillType === 'soft') {
            return { ...parsed, softSkills: state.updatedSkills || [] }
          }
          return parsed
        } catch {
          // ignore
        }
      }
    }

    return normalizeIncomingFilters(state?.filters)
  }

  const initialFilters = getInitialFilters()

  const [statusId, setStatusId] = useState<number | undefined>(initialFilters.statusId)
  const [statusLabel, setStatusLabel] = useState(initialFilters.statusLabel)
  const [speciality, setSpeciality] = useState(initialFilters.speciality || '')
  const [workPlace, setWorkPlace] = useState(initialFilters.workPlace || '')
  const [faculty, setFaculty] = useState(initialFilters.faculty || '')
  const [degree, setDegree] = useState<string | undefined>(
    initialFilters.degree != null ? String(initialFilters.degree) : undefined,
  )
  const [course, setCourse] = useState<number | undefined>(initialFilters.course)
  const [hardSkills, setHardSkills] = useState<SelectedSkill[]>(initialFilters.hardSkills)
  const [softSkills, setSoftSkills] = useState<SelectedSkill[]>(initialFilters.softSkills)
  const [isDirty, setIsDirty] = useState(false)
  /** location.key записи, чей набор скиллов уже применён — см. эффект ниже */
  const appliedSkillsKeyRef = useRef<string | null>(null)

  const currentFilters = useMemo(
    (): SearchFiltersState => ({
      statusId,
      statusLabel,
      speciality,
      workPlace,
      faculty,
      degree,
      course,
      hardSkills,
      softSkills,
    }),
    [statusId, statusLabel, speciality, workPlace, faculty, degree, course, hardSkills, softSkills],
  )

  useEffect(() => {
    localStorage.setItem('filtersState', JSON.stringify(currentFilters))
  }, [currentFilters])

  const companyNames = useMemo(() => companies.map((c) => c.name), [companies])
  const facultyOptions = useMemo(
    () =>
      Array.from(
        new Set([...FACULTY_OPTIONS, ...specialityOptions].filter(Boolean)),
      ),
    [specialityOptions],
  )
  const availableCourses = degree ? getCoursesByGrade(degree) : []

  const statusOptions = useMemo(
    () => statuses.map((s) => ({ value: String(s.id), label: s.content })),
    [statuses],
  )
  const degreeOptions = useMemo(
    () => eduGrades.map((g) => ({ value: g, label: getEduGradeLabel(g) })),
    [eduGrades],
  )
  const courseOptions = useMemo(
    () => availableCourses.map((c) => ({ value: String(c), label: `${c} курс` })),
    [availableCourses],
  )

  useEffect(() => {
    const initial = normalizeIncomingFilters(
      (location.state as { filters?: Partial<SearchFiltersState> } | null)?.filters,
    )
    const hasChanges =
      statusId !== initial.statusId ||
      speciality !== (initial.speciality || '') ||
      workPlace !== (initial.workPlace || '') ||
      faculty !== (initial.faculty || '') ||
      degree !== (initial.degree != null ? String(initial.degree) : undefined) ||
      course !== initial.course ||
      JSON.stringify(hardSkills) !== JSON.stringify(initial.hardSkills) ||
      JSON.stringify(softSkills) !== JSON.stringify(initial.softSkills)
    setIsDirty(hasChanges)
  }, [statusId, speciality, workPlace, faculty, degree, course, hardSkills, softSkills, location.state])

  // Фильтры живут под выбором скиллов (keep-alive) и заново не монтируются —
  // применяем выбор на каждый возврат со страницы скиллов, а не только на mount
  useEffect(() => {
    const state = location.state as {
      updatedSkillType?: 'hard' | 'soft'
      updatedSkills?: SelectedSkill[]
    } | null

    if (state?.updatedSkillType) {
      // Payload лежит в самой записи истории и приезжает снова при POP на неё
      // (аппаратный «назад» на Android) — тогда он затёр бы правки, сделанные
      // уже после возврата. Применяем каждую запись ровно один раз, по её key.
      if (appliedSkillsKeyRef.current === location.key) return
      appliedSkillsKeyRef.current = location.key
      if (state.updatedSkillType === 'hard') setHardSkills(state.updatedSkills || [])
      else setSoftSkills(state.updatedSkills || [])
      localStorage.removeItem('selectedSkills')
      return
    }

    const saved = localStorage.getItem('selectedSkills')
    if (!saved) return
    try {
      const parsed = JSON.parse(saved) as {
        skillType?: 'hard' | 'soft'
        skills?: SelectedSkill[]
      }
      if (parsed.skillType === 'hard') setHardSkills(parsed.skills || [])
      else if (parsed.skillType === 'soft') setSoftSkills(parsed.skills || [])
    } catch {
      // ignore
    }
    localStorage.removeItem('selectedSkills')
  }, [location.state, location.key])

  const handleRemoveSkill = (skillId: number, type: 'hard' | 'soft') => {
    if (type === 'hard') setHardSkills((prev) => prev.filter((s) => s.id !== skillId))
    else setSoftSkills((prev) => prev.filter((s) => s.id !== skillId))
  }

  const handleAddSkill = (type: 'hard' | 'soft') => {
    localStorage.setItem('filtersState', JSON.stringify(currentFilters))
    navigate(`/search/filters/${type}-skills`, {
      state: {
        selectedSkills: type === 'hard' ? hardSkills : softSkills,
        returnTo: '/search/filters',
        skillType: type,
        keepFilters: true,
      },
    })
  }

  const handleReset = () => {
    setStatusId(undefined)
    setStatusLabel(undefined)
    setSpeciality('')
    setWorkPlace('')
    setFaculty('')
    setDegree(undefined)
    setCourse(undefined)
    setHardSkills([])
    setSoftSkills([])
    setIsDirty(false)
    localStorage.removeItem('filtersState')
  }

  const handleApply = () => {
    // filtersAppliedAt — метка применения: поиск остаётся смонтированным под
    // фильтрами и должен принять набор ровно один раз (не на открытии фильтров
    // и не на возврате POP к этой записи истории)
    navigate('/search', { state: { filters: currentFilters, filtersAppliedAt: Date.now() } })
  }

  return (
    <main ref={rootRef} className={`filters-page ${rootClassName}`}>
      <div className="filters-page__header">
        <button type="button" className="filters-page__back" onClick={() => navigateBack()}>
          <FiArrowLeft size={24} />
        </button>
        <h1 className="filters-page__title">Фильтры</h1>
        <button type="button" className="filters-page__reset-link" onClick={handleReset}>
          Сбросить
        </button>
      </div>

      <div className="filters-page__body">
        {/* Один error на все справочники (компании / скиллы / вузы) — не врём,
            что упали именно компании */}
        {referenceError && (
          <p className="filters-page__hint">Не удалось загрузить справочники: {referenceError}</p>
        )}

        <div className="filters-page__section">
          <SelectDropdown
            value={statusId != null ? String(statusId) : ''}
            placeholder="Статус"
            options={statusOptions}
            fitContent
            onChange={(next) => {
              const id = Number(next)
              setStatusId(id)
              setStatusLabel(statuses.find((s) => s.id === id)?.content)
            }}
          />
        </div>

        <div className="filters-page__section">
          <SelectDropdown
            value={speciality}
            placeholder="Специализация"
            options={specialityOptions}
            searchable
            onChange={setSpeciality}
          />
          {specialitiesError && specialityOptions.length === 0 && (
            <p className="filters-page__hint">Не удалось загрузить специализации: {specialitiesError}</p>
          )}
        </div>

        <div className="filters-page__section">
          <SelectDropdown
            value={workPlace}
            placeholder="Место работы"
            options={companyNames}
            searchable
            onChange={setWorkPlace}
          />
        </div>

        <div className="filters-page__section">
          <SelectDropdown
            value={faculty}
            placeholder="Направление"
            options={facultyOptions}
            searchable
            onChange={setFaculty}
          />
        </div>

        <div className="filters-page__section">
          <SelectDropdown
            value={degree ?? ''}
            placeholder="Степень обучения"
            options={degreeOptions}
            onChange={(next) => {
              setDegree(next)
              setCourse(undefined)
            }}
          />
        </div>

        <div className="filters-page__section">
          <SelectDropdown
            value={course != null ? String(course) : ''}
            placeholder="Курс"
            options={courseOptions}
            disabled={!degree}
            onChange={(next) => setCourse(Number(next))}
          />
          {!degree && <p className="filters-page__hint">Сначала выберите степень обучения</p>}
        </div>

        <div className="filters-page__section filters-page__section--skills">
          <div className="filters-page__section-header">
            <span className="filters-page__section-label">Скиллы</span>
            <button
              type="button"
              className="filters-page__add-btn"
              onClick={() => handleAddSkill('hard')}
              disabled={keySkills.length === 0 || skillsLoading}
            >
              Добавить
            </button>
          </div>
          <div className="filters-page__selected-skills">
            {hardSkills.map((skill) => (
              <SkillBadge
                key={skill.id}
                name={skill.name}
                onRemove={() => handleRemoveSkill(skill.id, 'hard')}
              />
            ))}
          </div>
          {skillsLoading && keySkills.length === 0 && (
            <p className="filters-page__hint">Загрузка скиллов…</p>
          )}
        </div>

        <div className="filters-page__section filters-page__section--skills">
          <div className="filters-page__section-header">
            <span className="filters-page__section-label">Интересы</span>
            <button
              type="button"
              className="filters-page__add-btn"
              onClick={() => handleAddSkill('soft')}
              disabled={softSkillsCatalog.length === 0 || skillsLoading}
            >
              Добавить
            </button>
          </div>
          <div className="filters-page__selected-skills">
            {softSkills.map((skill) => (
              <SkillBadge
                key={skill.id}
                name={skill.name}
                onRemove={() => handleRemoveSkill(skill.id, 'soft')}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="filters-page__actions">
        <button type="button" className="filters-page__apply-btn" onClick={handleApply} disabled={!isDirty}>
          Сохранить
        </button>
      </div>
    </main>
  )
}
