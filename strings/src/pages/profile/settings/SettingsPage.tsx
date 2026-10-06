import { Suspense, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { clearAuth, deleteMe } from '../../../api'
import { getAdminSession } from '../../../api/client'
import { adminLogout } from '../../../api/AdminAuth'
import {
  SettingsBlockedIcon,
  SettingsChevronIcon,
  SettingsConsentIcon,
  SettingsDeleteIcon,
  SettingsFaqIcon,
  SettingsLogoutIcon,
  SettingsPrivacyIcon,
  SettingsSupportIcon,
  SettingsTermsIcon,
} from '../../../assets/components/settingsIcons'
import ArrowBackIcon from '../../../assets/components/arrowBack'
import type { LegalDocId } from '../../legal/model/legalDocuments'
import { clearOnboardingCompleted } from '../../onboarding/model/onboardingStorage'
import { clearFriendsListCache } from '../../friends/lib/friendsListStorage'
import { clearStoredAvatars } from '../../../shared/lib/avatarDataStore'
import { clearUserScopedStores } from '../../../shared/lib/userScopedStorage'
import { resetFriendsCacheSession } from '../../friends/lib/friendsCacheSync'
import { useProfile } from '../../../shared/lib/useProfile'
import { SettingsAdminLinkLazy } from '../../../shared/lib/settingsAdminPage'
import { usePageSwipeRight } from '../../../shared/lib/usePageSwipeRight'
import { BottomSheet } from '../../../shared/ui/bottom-sheet/BottomSheet'
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/ConfirmDialog'
import { Overlay } from '../../../shared/ui/overlay/Overlay'
import { Toast } from '../../../shared/ui/toast/Toast'
import { toUserError } from '../../../shared/lib/userError'
import './settings-page.css'

const SUPPORT_EMAIL = 'niti-uni@yandex.ru'

const DELETE_TERMS = [
  'Твой профиль не будет виден другим пользователям.',
  'Тебя нельзя будет найти через поиск.',
  'Твой QR-код станет неактивным.',
  'Ты не сможешь добавлять друзей через QR или поиск.',
  'Ты не сможешь публиковать объявления и откликаться на них.',
  'Ты не сможешь войти в приложение, пока не отменишь удаление.',
  'Твои контакты сохранятся на срок хранения данных.',
]

type SettingsRowProps = {
  icon: ReactNode
  label: string
  hint?: string
  danger?: boolean
  onClick: () => void
}

const SettingsRow = ({ icon, label, hint, danger = false, onClick }: SettingsRowProps) => (
  <button
    type="button"
    className={`settings-page__row${danger ? ' settings-page__row--danger' : ''}`}
    onClick={onClick}
  >
    <span className="settings-page__row-icon" aria-hidden>
      {icon}
    </span>
    <span className="settings-page__row-body">
      <span className="settings-page__row-label">{label}</span>
      {hint ? <span className="settings-page__row-hint">{hint}</span> : null}
    </span>
    <span className="settings-page__row-chevron" aria-hidden>
      <SettingsChevronIcon />
    </span>
  </button>
)

export const SettingsPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { clearCachedProfile } = useProfile()
  // const [darkTheme, setDarkTheme] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [deleteTermsOpen, setDeleteTermsOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)

  const blockingOverlay =
    supportOpen || deleteTermsOpen || deleteConfirmOpen || logoutConfirmOpen || deleteBusy

  const isCoveredByNested =
    location.pathname.startsWith('/profile/settings/') &&
    location.pathname !== '/profile/settings' &&
    location.pathname !== '/profile/settings/'

  const { rootRef, rootClassName, navigateBack } = usePageSwipeRight({
    edgeSwipeEnabled: !blockingOverlay && !isCoveredByNested,
  })

  const openLegal = (id: LegalDocId) => {
    navigate(`/profile/settings/legal/${id}`)
  }

  const copySupportEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL)
      setToast('Почта скопирована')
    } catch {
      setToast('Не удалось скопировать')
    }
  }

  const closeDeleteFlow = () => {
    setDeleteConfirmOpen(false)
    setDeleteTermsOpen(false)
  }

  const leaveLocalSession = async () => {
    if (getAdminSession()) {
      await adminLogout()
    }
    clearAuth()
    clearCachedProfile()
    clearFriendsListCache()
    clearStoredAvatars()
    resetFriendsCacheSession()
    // Сканы QR, qr-заметки, кэш чужих профилей и прочие пер-аккаунтные сторы:
    // без этого стикеры сканов «переезжают» в следующий аккаунт на этом устройстве.
    clearUserScopedStores()
    clearOnboardingCompleted()
    navigate('/', { replace: true })
  }

  const handleLogout = () => {
    setLogoutConfirmOpen(true)
  }

  const handleDeleteAccount = async () => {
    if (deleteBusy) return
    setDeleteBusy(true)
    try {
      await deleteMe()
      closeDeleteFlow()
      leaveLocalSession()
    } catch (err) {
      setToast(toUserError(err, 'Не удалось удалить аккаунт'))
      setDeleteBusy(false)
    }
  }

  return (
    <main ref={rootRef} className={`settings-page ${rootClassName}`}>
      <div className="settings-page__scroll">
        <header className="settings-page__header">
          <button
            type="button"
            className="settings-page__back"
            onClick={() => navigateBack()}
            aria-label="Назад"
          >
            <ArrowBackIcon />
          </button>
          <h1 className="settings-page__title">Настройки</h1>
          {/* Кнопка в админку — только в веб-сборке (см. settingsAdminPage.ts). */}
          {SettingsAdminLinkLazy ? (
            <Suspense fallback={null}>
              <SettingsAdminLinkLazy />
            </Suspense>
          ) : null}
        </header>

        {/* {import.meta.env.DEV ? (
          <section className="settings-page__block">
            <div className="settings-page__row settings-page__row--static">
              <span className="settings-page__row-body">
                <span className="settings-page__row-label">Тёмная тема</span>
              </span>
              <button
                type="button"
                className={`settings-page__switch${darkTheme ? ' settings-page__switch--on' : ''}`}
                role="switch"
                aria-checked={darkTheme}
                aria-label="Тёмная тема"
                onClick={() => setDarkTheme((prev) => !prev)}
              >
                <span className="settings-page__switch-thumb" />
              </button>
            </div>
          </section>
        ) : null} */}

        <section className="settings-page__block">
          <h2 className="settings-page__group-title">Помощь</h2>
          <SettingsRow
            icon={<SettingsSupportIcon />}
            label="Написать в поддержку"
            onClick={() => setSupportOpen(true)}
          />
          <SettingsRow
            icon={<SettingsFaqIcon />}
            label="Часто задаваемые вопросы"
            onClick={() => navigate('/profile/settings/faq')}
          />
        </section>

        <section className="settings-page__block">
          <h2 className="settings-page__group-title">Документы и правила</h2>
          <SettingsRow
            icon={<SettingsTermsIcon />}
            label="Пользовательское соглашение и правила сообщества"
            onClick={() => openLegal('terms')}
          />
          <SettingsRow
            icon={<SettingsPrivacyIcon />}
            label="Политика конфиденциальности и обработки персональных данных"
            onClick={() => openLegal('privacy')}
          />
          <SettingsRow
            icon={<SettingsConsentIcon />}
            label="Согласие на обработку персональных данных"
            onClick={() => openLegal('consent')}
          />
        </section>

        <section className="settings-page__block">
          <h2 className="settings-page__group-title">Управление аккаунтом</h2>
          <SettingsRow
            icon={<SettingsLogoutIcon />}
            label="Выйти из аккаунта"
            hint="Завершить сессию на этом устройстве"
            onClick={handleLogout}
          />
          <SettingsRow
            icon={<SettingsDeleteIcon />}
            label="Удалить аккаунт"
            hint="Безвозвратное удаление через 30 дней"
            danger
            onClick={() => setDeleteTermsOpen(true)}
          />
          <SettingsRow
            icon={<SettingsBlockedIcon />}
            label="Заблокированные"
            hint="Разблокировать пользователей из списка"
            onClick={() => navigate('/profile/settings/blocked')}
          />
        </section>

        <p className="settings-page__version">Версия {import.meta.env.VERSION || '—'}</p>
      </div>

      {supportOpen && (
        <BottomSheet title="Написать в поддержку" onClose={() => setSupportOpen(false)}>
          <p className="settings-page__sheet-text">
            Наша поддержка осуществляется добровольцами. Если твоей проблемы нет в FAQ, напиши нам на
            почту ниже. Мы ответим в течение 48 часов в рабочее время. Спасибо за понимание!
          </p>
          <button type="button" className="settings-page__email" onClick={() => void copySupportEmail()}>
            {SUPPORT_EMAIL}
          </button>
        </BottomSheet>
      )}

      {deleteTermsOpen && (
        <BottomSheet title="Удалить аккаунт" onClose={closeDeleteFlow}>
          <h3 className="settings-page__sheet-subtitle">Условия удаления</h3>
          <ol className="settings-page__terms-list">
            {DELETE_TERMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <p className="settings-page__sheet-note">
            Профиль сразу скрывается от всех. Через 30 дней аккаунт и все данные — фото, объявления,
            нити и заметки — будут удалены безвозвратно. Если передумаешь, войди снова в течение 30
            дней и подтверди отмену удаления.
          </p>
          <button
            type="button"
            className="settings-page__delete-btn"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            Удалить аккаунт
          </button>
        </BottomSheet>
      )}

      {logoutConfirmOpen && (
        <ConfirmDialog
          title="Точно хочешь выйти?"
          subtitle={
            getAdminSession()
              ? 'Придётся снова войти логином и паролем, чтобы пользоваться приложением'
              : 'Придётся снова войти через ЦУ, чтобы пользоваться приложением'
          }
          confirmLabel="Выйти"
          cancelLabel="Уже не хочу"
          onConfirm={() => void leaveLocalSession()}
          onCancel={() => setLogoutConfirmOpen(false)}
        />
      )}

      {deleteConfirmOpen &&
        createPortal(
          <Overlay centered onBackdropClick={() => setDeleteConfirmOpen(false)}>
            <div className="settings-page__confirm" onClick={(e) => e.stopPropagation()}>
              <h3 className="settings-page__confirm-title">Удалить аккаунт?</h3>
              <p className="settings-page__confirm-text">
                Профиль сразу скроется от всех, а через 30 дней аккаунт и данные будут удалены
                безвозвратно. Отменить удаление можно только повторным входом в течение 30 дней.
              </p>
              <button
                type="button"
                className="settings-page__confirm-danger"
                disabled={deleteBusy}
                onClick={() => void handleDeleteAccount()}
              >
                {deleteBusy ? 'Удаляем…' : 'Точно удалить'}
              </button>
              <button
                type="button"
                className="settings-page__confirm-cancel"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Не надо
              </button>
            </div>
          </Overlay>,
          document.body,
        )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </main>
  )
}
