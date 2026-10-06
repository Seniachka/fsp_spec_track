import styles from './QrModal.module.css'
import { Lanyard } from './Lanyard'
import AvatarImage from '../../assets/avatar.png'
import { NOTE_MAX } from '../../shared/lib/noteLimits'

interface QrResultBadgeProps {
  isFriend: boolean
  friendName: string
  note?: string
  onNoteChange?: (note: string) => void
  onAction?: () => void
}

export const QrResultBadge = ({ isFriend, friendName, note, onNoteChange, onAction }: QrResultBadgeProps) => {
  const avatarSrc = AvatarImage

  return (
    <>
      <Lanyard />

      <div className={styles.badge}>
        <div className={styles.badgeBody}>
          <img
            src={avatarSrc}
            alt={friendName}
            className={styles.avatar}
            draggable={false}
          />

          {isFriend ? (
            <>
              <div className={styles.resultTitle}>Константина уже есть в твоих Нитях</div>
              <div className={styles.resultSub}>Кажется, где-то уже знакомились...</div>
            </>
          ) : (
            <>
              <div className={styles.resultTitle}>Константина теперь в твоих Нитях</div>
              <div className={styles.resultSub}>Запиши важное о вашем знакомстве</div>
              <div className={styles.noteHint}>Заметку будешь видеть только ты</div>
              <textarea
                className={styles.noteInput}
                placeholder="Ваша заметка..."
                value={note || ''}
                onChange={(e) => onNoteChange && onNoteChange(e.target.value)}
                maxLength={NOTE_MAX}
              />
              {note && note.length > 0 && (
                <div className={styles.noteCounter}>{note.length}/{NOTE_MAX}</div>
              )}
            </>
          )}
        </div>
        <button className={styles.resultBtn} onClick={onAction}>
          {isFriend ? 'Перейти в профиль' : 'Сохранить'}
        </button>
      </div>
    </>
  )
}