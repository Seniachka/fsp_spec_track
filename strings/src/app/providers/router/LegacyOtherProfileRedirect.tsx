import { Navigate, useParams } from 'react-router-dom'
import { readLastMainTab, tabUserProfilePath, type MainTab } from '../TabNavigationContext'

/** Старые ссылки /profile/:userId → профиль внутри последнего (или search) таба. */
export const LegacyOtherProfileRedirect = () => {
  const { userId } = useParams()
  if (!userId) return <Navigate to="/search" replace />

  // /profile/u без id — не ссылка на чужой профиль; раньше редиректили на /profile/u и ловили цикл.
  if (userId === 'u') return <Navigate to="/profile" replace />

  const reserved = new Set(['edit', 'settings'])
  if (reserved.has(userId)) {
    return <Navigate to={`/profile/${userId}`} replace />
  }

  const last = readLastMainTab()
  const tab: MainTab = last === 'profile' ? 'search' : last
  return <Navigate to={tabUserProfilePath(tab, userId)} replace />
}
