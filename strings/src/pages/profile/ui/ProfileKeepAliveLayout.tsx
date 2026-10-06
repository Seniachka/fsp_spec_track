import { useLocation } from 'react-router-dom'
import { ProfilePage } from './ProfilePage'
import { isTabUserProfilePath } from '../../../app/providers/TabNavigationContext'
import { SwipeKeepAliveLayout } from '../../../shared/ui/swipe-keep-alive/SwipeKeepAliveLayout'

const isProfileOverlay = (pathname: string): boolean =>
  pathname.startsWith('/profile/edit') ||
  pathname.startsWith('/profile/settings') ||
  isTabUserProfilePath(pathname)

/** Держит свой профиль смонтированным под edit/settings/чужим профилем. */
export const ProfileKeepAliveLayout = () => {
  const { pathname } = useLocation()
  return (
    <SwipeKeepAliveLayout
      base={<ProfilePage />}
      hasOverlay={isProfileOverlay(pathname)}
      stack
    />
  )
}
