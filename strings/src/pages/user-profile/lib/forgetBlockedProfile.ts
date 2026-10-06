import { removeCachedOtherProfile } from '../../../entities/profile/api/otherProfileStorage'

/**
 * Блокировка обязана убрать заблокированного из локальных кэшей: пока его запись
 * лежит в кэше чужих профилей, профиль открывается из него и вообще не ходит в
 * сеть — заблокированный виден как ни в чём не бывало.
 */
export const forgetBlockedProfile = (userId: string): void => {
  removeCachedOtherProfile(userId)
}
