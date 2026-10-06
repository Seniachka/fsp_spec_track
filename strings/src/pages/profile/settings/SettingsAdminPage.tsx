import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { createAdminUser } from '../../../api/AdminAuth'
import ArrowBackIcon from '../../../assets/components/arrowBack'
import { useMe } from '../../../shared/lib/useMe'
import { useProfile } from '../../../shared/lib/useProfile'
import { canAccessSettingsAdminFor } from '../../../shared/lib/settingsAdminAccess'
import { Button } from '../../../shared/ui/button/Button'
import { FieldInput } from '../../../shared/ui/input/FieldInput'
import { Toast } from '../../../shared/ui/toast/Toast'
import { toUserError } from '../../../shared/lib/userError'
import { usePageSwipeRight } from '../../../shared/lib/usePageSwipeRight'
import './settings-page.css'

const emptyForm = () => ({
  login: '',
  password: '',
  firstName: '',
  lastName: '',
  birthDate: '',
})

export const SettingsAdminPage = () => {
  const { user, loading: meLoading, error } = useMe()
  const { profile, loading: profileLoading } = useProfile()
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const allowAccess = canAccessSettingsAdminFor(user?.id, profile.id)
  const loading = meLoading || profileLoading

  const { rootRef, rootClassName, navigateBack } = usePageSwipeRight({
    backTo: '/profile/settings',
    edgeSwipeEnabled: !submitting && allowAccess,
  })

  if (!loading && !allowAccess) {
    return <Navigate to="/profile/settings" replace />
  }

  const handleChange = (field: keyof ReturnType<typeof emptyForm>, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleCreate = async () => {
    const payload = {
      login: form.login.trim(),
      password: form.password,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      birthDate: form.birthDate.trim(),
    }

    if (!payload.login || !payload.password || !payload.firstName || !payload.lastName || !payload.birthDate) {
      setToast('Заполни все поля')
      return
    }
    if (payload.password.length < 8) {
      setToast('Пароль — минимум 8 символов')
      return
    }

    setSubmitting(true)
    try {
      const created = await createAdminUser(payload)
      setToast(`Аккаунт создан (id: ${created.id})`)
      setForm(emptyForm())
    } catch (err) {
      setToast(toUserError(err, 'Не удалось создать аккаунт'))
    } finally {
      setSubmitting(false)
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
          <h1 className="settings-page__title">Админка</h1>
        </header>

        <section className="settings-page__section settings-page__section--admin">
          {loading ? (
            <p className="settings-page__status">Проверка…</p>
          ) : error ? (
            <p className="settings-page__status settings-page__status--error">{error}</p>
          ) : !user ? (
            <p className="settings-page__status">Профиль не найден</p>
          ) : (
            <div className="settings-page__user">
              <p className="settings-page__user-name">
                {user.firstName} {user.lastName}
              </p>
              <p className="settings-page__user-meta">Роль: {user.role}</p>
              <p className="settings-page__user-meta">ID: {user.id}</p>
            </div>
          )}

          <div className="settings-page__admin-form">
            <h2 className="settings-page__admin-form-title">Новый тестовый аккаунт</h2>
            <p className="settings-page__admin-form-hint">
              Логин и пароль для входа без СМС. Пользователь проходит онбординг как обычный.
            </p>
            <FieldInput
              placeholder="Логин"
              value={form.login}
              onChange={(e) => handleChange('login', e.target.value)}
              autoComplete="username"
            />
            <FieldInput
              placeholder="Пароль (мин. 8 символов)"
              type="password"
              value={form.password}
              onChange={(e) => handleChange('password', e.target.value)}
              autoComplete="new-password"
            />
            <FieldInput
              placeholder="Имя"
              value={form.firstName}
              onChange={(e) => handleChange('firstName', e.target.value)}
              autoComplete="given-name"
            />
            <FieldInput
              placeholder="Фамилия"
              value={form.lastName}
              onChange={(e) => handleChange('lastName', e.target.value)}
              autoComplete="family-name"
            />
            <FieldInput
              placeholder="Дата рождения"
              type="date"
              value={form.birthDate}
              onChange={(e) => handleChange('birthDate', e.target.value)}
            />
            <Button onClick={() => void handleCreate()} disabled={submitting || loading}>
              {submitting ? 'Создание…' : 'Создать аккаунт'}
            </Button>
          </div>
        </section>
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </main>
  )
}
