import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { isAuthenticated } from '../../../api/client'
import { saveReturnPath } from '../../../shared/lib/appLinks'

export const RequireAuth = () => {
  const location = useLocation()

  if (!isAuthenticated()) {
    saveReturnPath(`${location.pathname}${location.search}${location.hash}`)
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
