/** UUID с доступом к админке в настройках. Env — через запятую (дополняет список). */
const DEFAULT_SETTINGS_ADMIN_USER_IDS = [
  '8220b33a-1503-4570-91bf-37173eddf047', // Богдан
  'e44d8b4f-1370-49ae-a457-4a5a46438aa7', // Арсений
  '8b16df24-c843-4618-b7b7-9ba1a43ebfed', // Александра Завьялова
  'a364ad25-0133-424a-ba0b-ab8e07dba760', // Полина Задорова
]

const fromEnv = String(import.meta.env.VITE_SETTINGS_ADMIN_USER_ID || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean)

export const SETTINGS_ADMIN_USER_IDS = new Set<string>([
  ...DEFAULT_SETTINGS_ADMIN_USER_IDS,
  ...fromEnv,
])

/** @deprecated use SETTINGS_ADMIN_USER_IDS */
export const SETTINGS_ADMIN_USER_ID =
  fromEnv[0] || DEFAULT_SETTINGS_ADMIN_USER_IDS[0]

export const canAccessSettingsAdmin = (userId: string | null | undefined): boolean =>
  Boolean(userId && SETTINGS_ADMIN_USER_IDS.has(userId))

/** useMe иногда пустой после dev-входа — берём id из профиля как fallback. */
export const canAccessSettingsAdminFor = (
  meUserId: string | null | undefined,
  profileUserId: string | null | undefined,
): boolean => canAccessSettingsAdmin(meUserId || profileUserId || undefined)
