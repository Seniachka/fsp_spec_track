import { QRCodeSVG } from 'qrcode.react'
import styles from './QrModal.module.css'
import type { QrUser } from './QrModal'
import { encodeQrPayload, isUserId } from './qrPayload'
import { UserAvatar } from '../../shared/ui/user-avatar/UserAvatar'

interface QrBadgeProps {
  user?: QrUser
}

export const QrBadge = ({ user }: QrBadgeProps) => {
  if (!user) return null

  const canEncode = isUserId(user.id)
  const qrData = canEncode ? encodeQrPayload({ id: user.id, name: user.name }) : ''

  return (
    <div className={`${styles.badge} ${styles.badgeOwn}`}>
      <div className={styles.badgeSlot} aria-hidden />
      <div className={styles.badgeBody}>
        <div className={styles.avatarWrap}>
          <UserAvatar
            userId={user.id}
            // undefined, а не null: пустая строка здесь значит «профиль ещё не
            // догрузился», а null для UserAvatar — «API сказала, фото нет», и он
            // на нём стирает кэш аватарки (blob, IndexedDB, working URL).
            photoUrl={user.avatar || undefined}
            size="fill"
            className={styles.avatar}
            alt={user.name}
          />
        </div>
        {user.name && <div className={styles.userName}>{user.name}</div>}
        <div className={styles.qrCode}>
          {canEncode ? (
            <QRCodeSVG
              value={qrData}
              size={256}
              level="H"
              includeMargin={true}
              className={styles.qrSvg}
            />
          ) : (
            <p className={styles.qrPlaceholder}>Загружаем твой QR…</p>
          )}
        </div>
      </div>
    </div>
  )
}
