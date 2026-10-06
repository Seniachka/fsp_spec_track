/**
 * Категории профессиональных навыков — 10 штук.
 * id = id строки в таблице key_skill_categories на бэкенде (миграции 00046 и 00047);
 * локальный список нужен как фолбэк, пока GET /api/key-skill-categories не выкачен.
 * Правится руками вместе с миграцией — генератора и key_skills_plan.json больше нет.
 */
import type { SkillCategory } from './types'

export const KEY_SKILL_CATEGORIES: SkillCategory[] = [
  { id: 1, name: 'Product Management', sortOrder: 1 },
  { id: 2, name: 'Project Management и Business Analysis', sortOrder: 2 },
  { id: 3, name: 'UX/UI-дизайн и исследования', sortOrder: 3 },
  { id: 4, name: 'Разработка ПО', sortOrder: 4 },
  { id: 5, name: 'Аналитика данных и Data Engineering', sortOrder: 5 },
  { id: 6, name: 'Machine Learning и AI', sortOrder: 6 },
  { id: 7, name: 'QA и тестирование', sortOrder: 7 },
  { id: 8, name: 'DevOps, Cloud и SRE', sortOrder: 8 },
  { id: 9, name: 'Информационная безопасность и сети', sortOrder: 9 },
  { id: 10, name: 'Маркетинг', sortOrder: 10 },
]

export const getKeySkillCategoryById = (id: number): SkillCategory | undefined =>
  KEY_SKILL_CATEGORIES.find((category) => category.id === id)
