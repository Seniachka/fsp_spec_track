import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRouter } from './app/providers/router/AppRouter'
import { ErrorBoundary } from './app/providers/ErrorBoundary'
import { AppUpdateGate } from './app/providers/AppUpdateGate'
import { QrProvider } from './app/providers/QrContext'
import { ProfileProvider } from './shared/lib/useProfile'
import { ModalProvider } from './app/providers/ModalContext'
import { setupNativeKeyboard } from './shared/lib/nativeKeyboard'
import './app/styles/global.css'

// До первого рендера: настройки нативной клавиатуры не зависят от роутинга.
setupNativeKeyboard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Выше всех провайдеров: падение любого из них тоже должно ловиться. */}
    <ErrorBoundary>
      <AppUpdateGate>
        <QrProvider>
          <ProfileProvider>
            <ModalProvider>
              <AppRouter />
            </ModalProvider>
          </ProfileProvider>
        </QrProvider>
      </AppUpdateGate>
    </ErrorBoundary>
  </StrictMode>,
)
