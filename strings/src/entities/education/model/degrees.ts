import type { EducationGrade } from '../../profile/model/types'

/**
 * Степени образования для формы «Место учёбы».
 * В ЦУ на выбор только бакалавриат, магистратура и ДПО; в остальных вузах
 * встречаются специалитет, аспирантура и ординатура — без них сохранённая
 * степень показывалась бы пустым полем.
 */
export const CU_DEGREE_OPTIONS: string[] = ['Бакалавриат', 'Магистратура', 'ДПО']

export const ALL_DEGREE_OPTIONS: string[] = [
  'Бакалавриат',
  'Специалитет',
  'Магистратура',
  'Аспирантура',
  'Ординатура',
  'ДПО',
]

/** Подпись степени → grade для API (обратная сторона GRADE_TO_DEGREE) */
export const DEGREE_LABEL_TO_GRADE: Record<string, EducationGrade> = {
  Бакалавриат: 'bachelor',
  Специалитет: 'specialist',
  Магистратура: 'master',
  Аспирантура: 'postgraduate',
  Ординатура: 'residency',
  ДПО: 'dpomaster',
}

/**
 * Нормализация grade перед отправкой в API. Отправлять можно только значения из
 * enum edu_grade в Postgres: bachelor | master | dpomaster | specialist |
 * postgraduate | residency (strings-backend, миграции 00001_init_schema.sql:13
 * и 00042_edu_grade_residency.sql).
 *
 * 'dpo' — legacy-алиас старых профилей: в БД степень ДПО называется 'dpomaster'.
 * Ординатура ('residency') с 00042 есть в enum'е и уходит на бэк как есть —
 * подмены на аспирантуру, из-за которой сохранённая степень возвращалась чужой
 * подписью, больше нет.
 */
export const toApiEduGrade = (grade: EducationGrade): Exclude<EducationGrade, 'dpo'> => {
  if (grade === 'dpo') return 'dpomaster'
  return grade
}

/**
 * Список степеней для выпадашки: короткий для ЦУ, полный для остальных вузов.
 * Уже сохранённую степень добавляем, даже если её нет в списке, иначе
 * SelectDropdown не найдёт подпись и покажет пустое поле.
 */
export const getDegreeOptions = (isCu: boolean, currentDegree?: string): string[] => {
  const options = isCu ? CU_DEGREE_OPTIONS : ALL_DEGREE_OPTIONS
  const degree = currentDegree?.trim()
  if (!degree || options.includes(degree)) return options
  return [...options, degree]
}
