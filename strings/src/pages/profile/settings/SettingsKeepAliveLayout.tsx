import { useLocation } from 'react-router-dom'
import { SettingsPage } from './SettingsPage'
import { SwipeKeepAliveLayout } from '../../../shared/ui/swipe-keep-alive/SwipeKeepAliveLayout'

const isSettingsNestedOverlay = (pathname: string): boolean => {
  if (!pathname.startsWith('/profile/settings/')) return false
  return (
    pathname.startsWith('/profile/settings/admin') ||
    pathname.startsWith('/profile/settings/blocked') ||
    pathname.startsWith('/profile/settings/faq') ||
    pathname.startsWith('/profile/settings/legal')
  )
}

/** Держит Settings смонтированным под faq/blocked/admin/legal. */
export const SettingsKeepAliveLayout = () => {
  const { pathname } = useLocation()
  return (
    <SwipeKeepAliveLayout
      base={<SettingsPage />}
      hasOverlay={isSettingsNestedOverlay(pathname)}
      stack
    />
  )
}
