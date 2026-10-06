import { useLocation } from 'react-router-dom'
import { AnnouncementsPage } from './AnnouncementsPage'
import { SwipeKeepAliveLayout } from '../../../shared/ui/swipe-keep-alive/SwipeKeepAliveLayout'

const isAnnouncementsProfile = (pathname: string): boolean =>
  /^\/afisha\/announcements\/u\/[^/]+\/?$/.test(pathname)

/** Объявления остаются под профилем автора. */
export const AnnouncementsKeepAliveLayout = () => {
  const { pathname } = useLocation()
  return (
    <SwipeKeepAliveLayout
      base={<AnnouncementsPage />}
      hasOverlay={isAnnouncementsProfile(pathname)}
      stack
    />
  )
}
