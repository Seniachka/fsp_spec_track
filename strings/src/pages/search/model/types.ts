import type { EduGrade, UserSkill } from '../../../api/types'

/** Выбранный скилл в фильтрах поиска */
export type SelectedSkill = {
  id: number
  name: string
}

/**
 * Состояние фильтров поиска.
 * В POST /api/students/search уходят: statusId, speciality, companies, keySkillIds, softSkillIds.
 * faculty / degree / course фильтруем на клиенте по edu-places (бэкенд search их не принимает).
 */
export type SearchFiltersState = {
  statusId?: number
  statusLabel?: string
  speciality?: string
  workPlace?: string
  faculty?: string
  degree?: EduGrade | string
  course?: number
  hardSkills: SelectedSkill[]
  softSkills: SelectedSkill[]
}

export const emptySearchFilters = (): SearchFiltersState => ({
  hardSkills: [],
  softSkills: [],
})

export const EDU_GRADE_LABELS: Record<string, string> = {
  bachelor: 'Бакалавриат',
  master: 'Магистратура',
  // В БД (edu_grade) и в LOCAL_EDU_GRADES степень ДПО называется 'dpomaster',
  // 'dpo' — legacy-алиас из старых профилей. Наружу в API уходит само значение.
  dpo: 'ДПО',
  dpomaster: 'ДПО',
  // specialist: 'Специалитет',
  // postgraduate: 'Аспирантура',
  // residency: 'Ординатура',
}

export const getEduGradeLabel = (grade: string): string => EDU_GRADE_LABELS[grade] ?? grade

export const getCoursesByGrade = (grade: string): number[] => {
  switch (grade) {
    case 'bachelor':
    // case 'specialist':
      return [1, 2, 3, 4]
    case 'master':
    case 'dpo':
    case 'dpomaster':
    // case 'postgraduate':
    // case 'residency':
      return [1, 2]
    default:
      return []
  }
}

export const skillToSelected = (skill: UserSkill): SelectedSkill => ({
  id: skill.id,
  name: skill.name,
})

export const hasActiveSearchFilters = (filters: SearchFiltersState): boolean =>
  Boolean(
    filters.statusId ||
      filters.speciality?.trim() ||
      filters.workPlace?.trim() ||
      filters.faculty?.trim() ||
      filters.degree ||
      filters.course != null ||
      filters.hardSkills.length > 0 ||
      filters.softSkills.length > 0,
  )
