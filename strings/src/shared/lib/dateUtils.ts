import { format, parseISO } from 'date-fns'

/** null на пустой/битой дате: format() из date-fns кидает RangeError и роняет всю Афишу */
const formatDateTime = (value: string | null | undefined): string | null => {
  if (!value?.trim()) return null
  const parsed = parseISO(value)
  if (Number.isNaN(parsed.getTime())) return null
  return format(parsed, 'dd.MM.yyyy HH:mm')
}

/** Дата/время начала — дата/время конца */
export const formatEventDate = (start: string, end?: string): string => {
  const startStr = formatDateTime(start)
  const endStr = formatDateTime(end)

  if (!startStr) return endStr ?? ''
  if (!endStr || endStr === startStr) return startStr

  return `${startStr} — ${endStr}`
}
