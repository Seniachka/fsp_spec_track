import type { Announcement } from './mapAnnouncement'

/**
 * Срок жизни пользовательской публикации — 7 дней.
 * Сервер срок не считает: и группировка АКТУАЛЬНЫЕ/АРХИВ на странице объявлений,
 * и раздел объявлений в профиле отсчитывают его от createdAt на клиенте.
 */
export const POST_TTL_DAYS = 7

const daysSince = (createdAt: string, now: Date): number =>
  (now.getTime() - new Date(createdAt).getTime()) / (1000 * 3600 * 24)

/** Сколько дней осталось до конца срока публикации (0 — срок вышел) */
export const getDaysLeft = (createdAt: string, now: Date = new Date()): number => {
  const diff = daysSince(createdAt, now)
  if (diff < 0) return POST_TTL_DAYS
  if (diff >= POST_TTL_DAYS) return 0
  return POST_TTL_DAYS - Math.floor(diff)
}

/** «1 день» / «3 дня» / «7 дней» */
export const getDaysText = (days: number): string => {
  if (days === 0) return '0 дней'
  if (days === 1) return '1 день'
  if (days >= 2 && days <= 4) return `${days} дня`
  return `${days} дней`
}

/** Актуальное = не в архиве и моложе POST_TTL_DAYS (битая дата = не актуальное) */
export const isActualAnnouncement = (ann: Announcement, now: Date = new Date()): boolean => {
  if (ann.isArchived) return false
  return daysSince(ann.createdAt, now) < POST_TTL_DAYS
}
