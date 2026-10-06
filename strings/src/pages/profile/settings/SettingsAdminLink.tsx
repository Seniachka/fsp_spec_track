import { useNavigate } from 'react-router-dom'
import { useMe } from '../../../shared/lib/useMe'
import { useProfile } from '../../../shared/lib/useProfile'
import { canAccessSettingsAdminFor } from '../../../shared/lib/settingsAdminAccess'

/**
 * Кнопка перехода в админку в шапке настроек. Вынесена отдельным модулем, чтобы
 * список staff-UUID (settingsAdminAccess) грузился лениво и вместе с админкой
 * не попадал в сборку для App Store (см. settingsAdminPage.ts).
 *
 * Стили берутся из settings-page.css, который импортирует сама SettingsPage.
 */
export const SettingsAdminLink = () => {
  const navigate = useNavigate()
  const { user } = useMe()
  const { profile } = useProfile()

  if (!canAccessSettingsAdminFor(user?.id, profile.id)) return null

  return (
    <button
      type="button"
      className="settings-page__admin-link"
      onClick={() => navigate('/profile/settings/admin')}
    >
      settings
    </button>
  )
}
