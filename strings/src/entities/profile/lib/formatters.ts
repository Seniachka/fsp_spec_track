import { isCuEduPlace } from '../../education/lib/eduLine'
import type { EducationEntry, WorkEntry } from '../model/types'
import { WORK_GRADE_OPTIONS } from '../model/types'

const WORK_GRADE_LABEL: Record<string, string> = Object.fromEntries(
  WORK_GRADE_OPTIONS.map((opt) => [opt.value, opt.label]),
)

export const formatUniversityShort = (entry: EducationEntry): string =>
  entry.universityShort || entry.university

export const formatEducationTitle = (entry: EducationEntry): string => {
  const university = formatUniversityShort(entry)
  const specialty = entry.specialty
  if (university && specialty) return `${university} — ${specialty}`
  return university || specialty
}

/** «2» / «2 курс» → «2 курс» */
export const formatCourseLabel = (raw: string | undefined | null): string => {
  const value = (raw ?? '').trim()
  if (!value) return ''
  if (/курс/i.test(value)) return value
  if (/^\d+$/.test(value)) return `${value} курс`
  return value
}

/**
 * ЦУ + учится: «Бакалавриат · 2 курс» (курс из интеграции с ЦУ)
 * Иначе (другие вузы или уже выпуск): «Бакалавриат · 2029»
 * Курса может не быть (другие вузы) — тогда остаётся прежний вид.
 */
export const formatEducationSubtitle = (entry: EducationEntry): string => {
  const degree = entry.degree.trim()
  const course = entry.isStudyingNow ? formatCourseLabel(entry.level) : ''
  const isCuStudying = isCuEduPlace(entry) && entry.isStudyingNow

  if (isCuStudying) {
    return [degree, course].filter(Boolean).join(' · ')
  }

  const end = (entry.endYear || entry.graduationYear).trim()
  return [degree, course, end].filter(Boolean).join(' · ')
}

export const formatWorkPeriod = (entry: WorkEntry): string => {
  const start = entry.startYear
  if (!start) return ''
  if (entry.isWorkingNow || !entry.endYear) {
    return `${start} — настоящее время`
  }
  return `${start} — ${entry.endYear}`
}

/** «Должность — Middle» */
export const formatWorkPosition = (entry: WorkEntry): string => {
  const position = entry.position.trim()
  const grade = WORK_GRADE_LABEL[entry.grade] ?? ''
  if (position && grade) return `${position} — ${grade}`
  return position || grade
}

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

/** Парсит ISO `YYYY-MM-DD` или возвращает null */
export const parseIsoDate = (value: string): Date | null => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, month, day)
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null
  }
  return date
}

export const toIsoDate = (date: Date): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Отображение как на макете: «21 апреля» */
export const formatBirthdateDisplay = (value: string): string => {
  const date = parseIsoDate(value)
  if (!date) return value.trim()
  return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`
}
