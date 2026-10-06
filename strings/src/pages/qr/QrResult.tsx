import { useState } from 'react'
import styles from './QrModal.module.css'
import { AvatarSticker } from '../../shared/ui/avatar-sticker/AvatarSticker'
import { UserAvatar } from '../../shared/ui/user-avatar/UserAvatar'
import { NOTE_MAX } from '../../shared/lib/noteLimits'

interface QrResultProps {
  isFriend: boolean
  friendName: string
  friendId?: string
  friendAvatar?: string | null
  onClose: () => void
  onSkip: () => void
  onGoToProfile: () => void
  onSaveNote?: (note: string) => void | Promise<void>
  saving?: boolean
  /** Заметка не сохранилась — остаёмся на экране и показываем текст ошибки */
  error?: string | null
}

export const QrResult = ({
  isFriend,
  friendName,
  friendId = '',
  friendAvatar,
  onSkip,
  onGoToProfile,
  onSaveNote,
  saving = false,
  error = null,
}: QrResultProps) => {
  const [note, setNote] = useState('')
  const firstName = friendName.split(' ')[0] || friendName
  const hasNote = note.trim().length > 0

  const handleSave = () => {
    void onSaveNote?.(note.slice(0, NOTE_MAX))
  }

  return (
    <div className={`${styles.badge} ${styles.badgeResult}`}>
      <div className={styles.badgeSlot} aria-hidden />
      <div className={styles.badgeBody}>
        <div className={styles.avatarWrap}>
          <UserAvatar
            userId={friendId}
            photoUrl={friendAvatar}
            size="fill"
            className={styles.avatar}
            alt={firstName}
          />
          <AvatarSticker kind="scan" corner="tl" />
        </div>
        <div className={styles.resultTitle}>
          {isFriend
            ? `${firstName} уже есть в твоих Нитях`
            : `${firstName} теперь в твоих Нитях`}
        </div>
        <div className={styles.resultSub}>
          {isFriend ? 'Кажется, где-то уже знакомились...' : 'Запиши важное о вашем знакомстве'}
        </div>

        {isFriend ? (
          <div className={styles.resultActions}>
            <button type="button" className={styles.resultBtn} onClick={onGoToProfile}>
              Перейти в профиль
            </button>
          </div>
        ) : (
          <div className={styles.resultActions}>
            <textarea
              className={styles.noteInput}
              placeholder="Заметку будешь видеть только ты"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              maxLength={NOTE_MAX}
              disabled={saving}
              rows={5}
            />
            {note.length > 0 && (
              <div className={styles.noteCounter}>
                {note.length}/{NOTE_MAX}
              </div>
            )}
            {error && (
              <div className={styles.noteError} role="alert">
                {error}
              </div>
            )}
            {hasNote ? (
              <button
                type="button"
                className={styles.resultBtn}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Сохраняем…' : 'Сохранить'}
              </button>
            ) : (
              <button
                type="button"
                className={styles.resultBtnSecondary}
                onClick={onSkip}
                disabled={saving}
              >
                Пропустить
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
