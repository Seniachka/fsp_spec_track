import { useLocation } from 'react-router-dom'
import { SearchPage } from './SearchPage'
import { isTabUserProfilePath } from '../../../app/providers/TabNavigationContext'
import { SwipeKeepAliveLayout } from '../../../shared/ui/swipe-keep-alive/SwipeKeepAliveLayout'

/** Поиск остаётся под профилем пользователя и фильтрами. */
export const SearchKeepAliveLayout = () => {
  const { pathname } = useLocation()
  const hasOverlay =
    isTabUserProfilePath(pathname) || pathname.startsWith('/search/filters')
  return <SwipeKeepAliveLayout base={<SearchPage />} hasOverlay={hasOverlay} stack />
}
