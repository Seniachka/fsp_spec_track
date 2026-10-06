import { useLocation } from 'react-router-dom'
import { AfishaPage } from './AfishaPage'
import { isTabUserProfilePath } from '../../../app/providers/TabNavigationContext'
import { SwipeKeepAliveLayout } from '../../../shared/ui/swipe-keep-alive/SwipeKeepAliveLayout'

/** Главная афиша остаётся под мероприятиями, объявлениями, картой и /afisha/u/:id. */
export const AfishaKeepAliveLayout = () => {
  const { pathname } = useLocation()
  const hasOverlay =
    pathname.startsWith('/afisha/announcements') ||
    pathname.startsWith('/afisha/events') ||
    pathname.startsWith('/afisha/map') ||
    (isTabUserProfilePath(pathname) && pathname.startsWith('/afisha/u/'))
  return <SwipeKeepAliveLayout base={<AfishaPage />} hasOverlay={hasOverlay} stack />
}
