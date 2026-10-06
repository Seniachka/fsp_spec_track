import { lazy } from 'react'

/**
 * Админка настроек («Новый тестовый аккаунт») нужна команде только в веб-версии
 * niti-uni.ru — там флаг включает deploy/Dockerfile. В сборку для App Store она
 * попадать не должна: скрытая функция под захардкоженным списком staff-UUID —
 * это прямое нарушение App Review 2.3.1.
 *
 * Флаг вычисляется на этапе сборки, поэтому без него ветки отмирают вместе с
 * динамическими import(), и ни страница, ни кнопка, ни список UUID, ни
 * createAdminUser в dist не попадают.
 */
export const SETTINGS_ADMIN_PAGE_ENABLED = import.meta.env.VITE_SETTINGS_ADMIN_PAGE === '1'

/**
 * Оба import() живут здесь, рядом с флагом, и это не случайность: Rolldown
 * подставляет значение env прямо в модуль и гасит мёртвую ветку вместе с
 * динамическим импортом, а вот значение константы из соседнего модуля до
 * тришейкинга не доходит — тогда чанки со страницей и кнопкой всё равно
 * оказывались бы в dist. Поэтому AppRouter и SettingsPage берут готовые
 * ленивые компоненты отсюда, а не собирают их у себя.
 *
 * null означает «в этой сборке админки нет» — вызывающий просто ничего не рисует.
 */
export const SettingsAdminPageLazy = SETTINGS_ADMIN_PAGE_ENABLED
  ? lazy(() =>
      import('../../pages/profile/settings/SettingsAdminPage').then((m) => ({
        default: m.SettingsAdminPage,
      })),
    )
  : null

export const SettingsAdminLinkLazy = SETTINGS_ADMIN_PAGE_ENABLED
  ? lazy(() =>
      import('../../pages/profile/settings/SettingsAdminLink').then((m) => ({
        default: m.SettingsAdminLink,
      })),
    )
  : null
