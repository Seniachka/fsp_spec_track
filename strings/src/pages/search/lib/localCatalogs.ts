import { KEY_SKILLS_CATALOG } from '../../../entities/skill/model/keySkillsCatalog'
import { SOFT_SKILLS_CATALOG } from '../../../entities/skill/model/softSkillsCatalog'
import { UNIVERSITIES } from '../../../entities/university/model/universities'
import { STATUS_OPTIONS } from '../../../entities/profile/model/types'
import type { EduGrade, StatusOption, University, UserSkill } from '../../../api/types'

/** Локальные справочники из entities — без запросов на бэк */
export const LOCAL_STATUSES: StatusOption[] = STATUS_OPTIONS.map((s) => ({
  id: s.id,
  content: s.label,
}))

export const LOCAL_KEY_SKILLS: UserSkill[] = KEY_SKILLS_CATALOG.map((s) => ({
  id: s.id,
  name: s.name,
}))

export const LOCAL_SOFT_SKILLS: UserSkill[] = SOFT_SKILLS_CATALOG.map((s) => ({
  id: s.id,
  name: s.name,
}))

export const LOCAL_UNIVERSITIES: University[] = UNIVERSITIES.map((u) => ({
  id: u.id,
  name: u.name,
  shortName: u.shortName,
}))

/** Степени обучения — значения как в edu_grade БД (+ алиасы UI) */
export const LOCAL_EDU_GRADES: EduGrade[] = [
  'bachelor',
  'master',
  'dpomaster',
]

export const INITIAL_VISIBLE = 5
