import { useState } from 'react'
import { Overlay } from '../../shared/ui/overlay/Overlay'
import { UserAvatar } from '../../shared/ui/user-avatar/UserAvatar'
import { Button } from '../../shared/ui/button/Button'
import { updateContact } from '../../api/Contacts'
import { emitContactsChanged } from '../../shared/lib/contactsEvents'
import { patchFriendNoteInCache } from '../friends/lib/friendsCacheSync'
import { toUserError } from '../../shared/lib/userError'
import { NOTE_MAX } from '../../shared/lib/noteLimits'
import { Toast } from '../../shared/ui/toast/Toast'
import { useTabNavigation } from '../../app/providers/TabNavigationContext'
import './incoming-scan-prompt.css'

type IncomingScanPromptProps = {
  userId: string
  name: string
  avatarUrl?: string | null
  onClose: () => void
}

export const IncomingScanPrompt = ({ userId, name, avatarUrl, onClose }: IncomingScanPromptProps) => {
  const { openUserProfile } = useTabNavigation()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const short = name.split(' ')[0] || 'Новый контакт'

  const saveNote = async () => {
    const trimmed = note.trim()
    if (!trimmed) {
      onClose()
      return
    }
    setSaving(true)
    try {
      await updateContact(userId, { note: trimmed.slice(0, NOTE_MAX) })
      patchFriendNoteInCache(userId, trimmed.slice(0, NOTE_MAX))
      emitContactsChanged()
      onClose()
    } catch (err) {
      setToast(toUserError(err, 'Не удалось сохранить заметку'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Overlay centered elevated onBackdropClick={onClose}>
        <div className="incoming-scan" onClick={(e) => e.stopPropagation()}>
          <div className="incoming-scan__avatar-wrap">
            <UserAvatar
              userId={userId}
              // Отдаём как есть: null для UserAvatar — «API сказала, фото нет», и он
              // на нём стирает кэш аватарки (blob, IndexedDB, working URL). undefined —
              // «ещё не знаем»; схлопывать его в null нельзя, кэш чистился зря и
              // аватарка качалась заново.
              photoUrl={avatarUrl}
              size="sm"
              alt={name}
            />
          </div>
          <h3 className="incoming-scan__title">{short} теперь в твоих Нитях</h3>
          <p className="incoming-scan__subtitle">Запиши важное о вашем знакомстве</p>
          <textarea
            className="incoming-scan__textarea"
            placeholder="Например: познакомились на митапе"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
            rows={4}
            maxLength={NOTE_MAX}
            disabled={saving}
          />
          <div className="incoming-scan__actions">
            <Button onClick={() => void saveNote()} disabled={saving}>
              {saving ? 'Сохраняем…' : note.trim() ? 'Сохранить' : 'Пропустить'}
            </Button>
            <button
              type="button"
              className="incoming-scan__link-btn"
              onClick={() => {
                onClose()
                openUserProfile(userId)
              }}
            >
              Перейти в профиль
            </button>
          </div>
        </div>
      </Overlay>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  )
}
