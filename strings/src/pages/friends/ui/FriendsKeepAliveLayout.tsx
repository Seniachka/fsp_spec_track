import { useLocation } from 'react-router-dom'
import { FriendsPage } from './FriendsPage'
import { isTabUserProfilePath } from '../../../app/providers/TabNavigationContext'
import { SwipeKeepAliveLayout } from '../../../shared/ui/swipe-keep-alive/SwipeKeepAliveLayout'

/** Нити остаются под профилем пользователя. */
export const FriendsKeepAliveLayout = () => {
  const { pathname } = useLocation()
  return (
    <SwipeKeepAliveLayout
      base={<FriendsPage />}
      hasOverlay={isTabUserProfilePath(pathname)}
      stack
    />
  )
}
