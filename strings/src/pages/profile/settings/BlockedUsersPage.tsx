import { useCallback, useEffect, useState } from 'react'
import { ApiRequestError, listBlockedUsers, unblockUser, type UserProfile } from '../../../api'
import ArrowBackIcon from '../../../assets/components/arrowBack'
import {
  hidePostAuthor,
  notifyHiddenAuthorsChanged,
  unhidePostAuthor,
} from '../../../shared/lib/hiddenPostAuthors'
import { Toast } from '../../../shared/ui/toast/Toast'
import { toUserError } from '../../../shared/lib/userError'
import { usePageSwipeRight } from '../../../shared/lib/usePageSwipeRight'
import './settings-page.css'
import './blocked-users-page.css'

export const BlockedUsersPage = () => {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const { rootRef, rootClassName, navigateBack } = usePageSwipeRight({
    backTo: '/profile/settings',
    edgeSwipeEnabled: busyId == null,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listBlockedUsers({ limit: 100, offset: 0 })
      setUsers(list)
      // Синхронизируем локальный фильтр ленты с сервером
      for (const user of list) {
        hidePostAuthor(user.id)
      }
      notifyHiddenAuthorsChanged()
    } catch (err) {
      setToast(toUserError(err, 'Не удалось загрузить список'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleUnblock = async (userId: string) => {
    if (busyId) return
    setBusyId(userId)
    try {
      await unblockUser(userId)
      unhidePostAuthor(userId)
      notifyHiddenAuthorsChanged()
      setUsers((prev) => prev.filter((u) => u.id !== userId))
      setToast('Пользователь разблокирован')
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        unhidePostAuthor(userId)
        notifyHiddenAuthorsChanged()
        setUsers((prev) => prev.filter((u) => u.id !== userId))
        setToast('Пользователь разблокирован')
      } else {
        setToast(toUserError(err, 'Не удалось разблокировать'))
      }
    } finally {
      setBusyId(null)
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
          <h1 className="settings-page__title">Заблокированные</h1>
        </header>

        {loading ? (
          <p className="blocked-users__status">Загрузка…</p>
        ) : users.length === 0 ? (
          <p className="blocked-users__status">Список пуст</p>
        ) : (
          <ul className="blocked-users__list">
            {users.map((user) => {
              const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Без имени'
              return (
                <li key={user.id} className="blocked-users__row">
                  <div className="blocked-users__info">
                    <span className="blocked-users__name">{name}</span>
                    {user.speciality ? (
                      <span className="blocked-users__meta">{user.speciality}</span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="blocked-users__unblock"
                    disabled={busyId === user.id}
                    onClick={() => void handleUnblock(user.id)}
                  >
                    {busyId === user.id ? '…' : 'Разблокировать'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </main>
  )
}
