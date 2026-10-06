import type { ApiEvent, UserProfile } from '../../../api/types'

/** UI-модель мероприятия */
export type Event = {
  id: string
  title: string
  description: string
  dateStart: string
  dateEnd: string
  location: string
  registrationLink: string
  format: 'online' | 'offline' | 'hybrid'
  tags: string[]
  image: string
  attendees: number
  isAttending?: boolean
  category: string
}

const CATEGORY_LABELS: Record<string, string> = {
  networking: 'Нетворкинг',
  professional: 'Профессиональное',
  partner: 'Партнёрское',
  online: 'Онлайн',
  offline: 'Офлайн',
}

const categoryToFormat = (category: string): Event['format'] => {
  if (category === 'online') return 'online'
  if (category === 'offline') return 'offline'
  return 'offline'
}

const DEFAULT_EVENT_PLACE = 'Москва, ул. Гашека, д. 7, стр. 1'

export const mapApiEventToUi = (event: ApiEvent, attendingIds?: Set<string>): Event => {
  const startsAt = event.startsAt
  const endsAt = event.endsAt || startsAt
  const category = event.category || ''
  const label = CATEGORY_LABELS[category] || category

  return {
    id: event.id,
    title: event.title,
    description: event.content,
    dateStart: startsAt,
    dateEnd: endsAt,
    location: event.place?.trim() || DEFAULT_EVENT_PLACE,
    registrationLink: event.registrationLink || '',
    format: categoryToFormat(category),
    tags: label ? [label] : [],
    image: event.photoUrl || '',
    attendees: 0,
    isAttending: attendingIds ? attendingIds.has(event.id) : false,
    category,
  }
}

/**
 * Мероприятие ещё не прошло. Без даты окончания срок жизни — день начала.
 * Битая дата = «прошло»: показывать такую карточку нечем.
 */
export const isEventNotPast = (event: Event, startOfToday: Date): boolean => {
  const start = new Date(event.dateStart)
  if (Number.isNaN(start.getTime())) return false

  if (event.dateEnd && event.dateEnd !== event.dateStart) {
    const end = new Date(event.dateEnd)
    return !Number.isNaN(end.getTime()) && end >= startOfToday
  }

  return start >= startOfToday
}

/** Начало сегодняшнего дня — граница «прошло / не прошло» */
export const startOfToday = (): Date => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export const mapAuthorName = (author: UserProfile | null | undefined): string => {
  if (!author) return 'Участник'
  return [author.firstName, author.lastName].filter(Boolean).join(' ') || 'Участник'
}

/** Только имя (без фамилии) — для объявлений */
export const mapAuthorFirstName = (author: UserProfile | null | undefined): string => {
  const first = author?.firstName?.trim()
  if (first) return first
  return mapAuthorName(author)
}
