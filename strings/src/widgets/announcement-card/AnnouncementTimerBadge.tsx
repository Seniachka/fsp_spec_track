import './announcement-card.css'

type Props = {
  /** Текст стикера: «7 дней», «1 день», «истекло» */
  text: string
  /** Срок вышел — серый вариант вместо зелёного */
  expired?: boolean
  className?: string
}

/** Стикер срока публикации: пилюля, чуть вылезающая за верхний край карточки */
export const AnnouncementTimerBadge = ({ text, expired = false, className }: Props) => (
  <div
    className={`announcement-timer${expired ? ' announcement-timer--expired' : ''}${
      className ? ` ${className}` : ''
    }`}
  >
    <span className="announcement-timer__text">{text}</span>
  </div>
)
