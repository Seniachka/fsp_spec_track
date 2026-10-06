import { Suspense } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { ProfileKeepAliveLayout } from '../../../pages/profile/ui/ProfileKeepAliveLayout'
import { ProfileEditPage } from '../../../pages/profile/edit/ProfileEditPage'
import { FriendsKeepAliveLayout } from '../../../pages/friends/ui/FriendsKeepAliveLayout'
import { SettingsKeepAliveLayout } from '../../../pages/profile/settings/SettingsKeepAliveLayout'
import { BlockedUsersPage } from '../../../pages/profile/settings/BlockedUsersPage'
import { FaqPage } from '../../../pages/profile/settings/FaqPage'
import { SearchKeepAliveLayout } from '../../../pages/search/ui/SearchKeepAliveLayout'
import { FiltersKeepAliveLayout } from '../../../pages/search/filters/FiltersKeepAliveLayout'
import { SkillsSelectionPage } from '../../../pages/search/filters/SkillsSelectionPage'
import { WelcomePage } from '../../../pages/welcome/ui/WelcomePage'
import { OnboardingAuthPage } from '../../../pages/onboarding/ui/OnboardingAuthPage'
import { OnboardingFlowPage } from '../../../pages/onboarding/ui/OnboardingFlowPage'
import { LegalDocumentPage } from '../../../pages/legal/ui/LegalDocumentPage'
import { SupportPage } from '../../../pages/support/ui/SupportPage'
import { AfishaKeepAliveLayout } from '../../../pages/afisha/ui/AfishaKeepAliveLayout'
import { AnnouncementsKeepAliveLayout } from '../../../pages/announcements/ui/AnnouncementsKeepAliveLayout'
import { EventsKeepAliveLayout } from '../../../pages/events/ui/EventsKeepAliveLayout'
import { CampusMapPage } from '../../../pages/campus-map/ui/CampusMapPage'
import { UserProfilePage } from '../../../pages/user-profile/ui/UserProfilePage'
import { App } from '../../App'
import { RequireAuth } from './RequireAuth'
import { RequireOnboardingComplete } from './RequireOnboardingComplete'
import { LegacyOtherProfileRedirect } from './LegacyOtherProfileRedirect'
import { DeepLinkListener } from './DeepLinkListener'
import { DownloadAppPage } from '../../../pages/download/ui/DownloadAppPage'
import { SettingsAdminPageLazy } from '../../../shared/lib/settingsAdminPage'

/** Админка — только в веб-сборке: без флага здесь null и маршрута нет вовсе. */
const settingsAdminRoutes = SettingsAdminPageLazy
  ? [
      {
        path: 'admin',
        element: (
          <Suspense fallback={null}>
            <SettingsAdminPageLazy />
          </Suspense>
        ),
      },
    ]
  : []

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <>
        {/* Слушатель appUrlOpen живёт внутри роутера — ему нужен navigate. */}
        <DeepLinkListener />
        <App />
      </>
    ),
    children: [
      { index: true, element: <WelcomePage /> },
      { path: '/onboarding/auth', element: <OnboardingAuthPage /> },
      { path: '/legal/:docId', element: <LegalDocumentPage /> },
      { path: '/support', element: <SupportPage /> },
      { path: '/download', element: <DownloadAppPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/onboarding', element: <OnboardingFlowPage /> },
          {
            element: <RequireOnboardingComplete />,
            children: [
              {
                path: '/profile',
                element: <ProfileKeepAliveLayout />,
                children: [
                  { path: 'edit', element: <ProfileEditPage /> },
                  {
                    path: 'settings',
                    element: <SettingsKeepAliveLayout />,
                    children: [
                      ...settingsAdminRoutes,
                      { path: 'blocked', element: <BlockedUsersPage /> },
                      { path: 'faq', element: <FaqPage /> },
                      { path: 'legal/:docId', element: <LegalDocumentPage /> },
                    ],
                  },
                  { path: 'u/:userId', element: <UserProfilePage /> },
                ],
              },
              { path: '/profile/:userId', element: <LegacyOtherProfileRedirect /> },
              {
                path: '/friends',
                element: <FriendsKeepAliveLayout />,
                children: [{ path: 'u/:userId', element: <UserProfilePage /> }],
              },
              {
                path: '/search',
                element: <SearchKeepAliveLayout />,
                children: [
                  { path: 'u/:userId', element: <UserProfilePage /> },
                  {
                    path: 'filters',
                    element: <FiltersKeepAliveLayout />,
                    children: [
                      {
                        path: 'hard-skills',
                        element: <SkillsSelectionPage skillType="hard" />,
                      },
                      {
                        path: 'soft-skills',
                        element: <SkillsSelectionPage skillType="soft" />,
                      },
                    ],
                  },
                ],
              },
              {
                path: '/afisha',
                element: <AfishaKeepAliveLayout />,
                children: [
                  { path: 'u/:userId', element: <UserProfilePage /> },
                  {
                    path: 'announcements',
                    element: <AnnouncementsKeepAliveLayout />,
                    children: [
                      { path: 'u/:userId', element: <UserProfilePage /> },
                      { path: ':announcementId', element: null },
                    ],
                  },
                  {
                    path: 'events',
                    element: <EventsKeepAliveLayout />,
                    children: [
                      { path: 'u/:userId', element: <UserProfilePage /> },
                      { path: ':eventId', element: null },
                    ],
                  },
                  { path: 'map', element: <CampusMapPage /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export const AppRouter = () => <RouterProvider router={router} />
