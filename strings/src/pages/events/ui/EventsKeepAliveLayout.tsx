import { useLocation } from 'react-router-dom'
import { EventsPage } from './EventsPage'
import { SwipeKeepAliveLayout } from '../../../shared/ui/swipe-keep-alive/SwipeKeepAliveLayout'

const isEventsProfile = (pathname: string): boolean =>
  /^\/afisha\/events\/u\/[^/]+\/?$/.test(pathname)

/** Мероприятия остаются под профилем. */
export const EventsKeepAliveLayout = () => {
  const { pathname } = useLocation()
  return (
    <SwipeKeepAliveLayout
      base={<EventsPage />}
      hasOverlay={isEventsProfile(pathname)}
      stack
    />
  )
}
