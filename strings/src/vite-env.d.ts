/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_APP_PUBLIC_URL?: string
  readonly VITE_SETTINGS_ADMIN_USER_ID?: string
  readonly VITE_SETTINGS_ADMIN_PAGE?: string
  readonly VITE_BFF?: string
  readonly VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
