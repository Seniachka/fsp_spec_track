import styles from './QrModal.module.css'
import { AvatarSticker } from '../../shared/ui/avatar-sticker/AvatarSticker'
import { UserAvatar } from '../../shared/ui/user-avatar/UserAvatar'

interface QrSavedProps {
  onClose: () => void
  friendId?: string
  friendAvatar?: string | null
  friendName?: string
}

export const QrSaved = ({ onClose, friendId = '', friendAvatar, friendName }: QrSavedProps) => {
  const alt = friendName?.trim() || 'avatar'

  return (
    <div className={styles.badge}>
      <div className={styles.badgeSlot} aria-hidden />
      <div className={styles.badgeBody}>
        <div className={styles.avatarWrap}>
          <UserAvatar
            userId={friendId}
            photoUrl={friendAvatar}
            size="fill"
            className={styles.avatar}
            alt={alt}
          />
          <AvatarSticker kind="scan" corner="tl" />
        </div>
        <div className={styles.savedTitle}>Сохранили заметку</div>
        <div className={styles.savedSub}>
          Теперь не забудешь этого человека и как вы познакомились
        </div>
      </div>
      <button type="button" className={styles.resultBtn} onClick={onClose}>
        Отлично
      </button>
    </div>
  )
}
