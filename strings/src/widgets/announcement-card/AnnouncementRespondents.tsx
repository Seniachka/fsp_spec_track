import type { AnnouncementRespondent } from '../../pages/afisha/lib/mapAnnouncement'
import { UserAvatar } from '../../shared/ui/user-avatar/UserAvatar'
import SadSmileIcon from '../../assets/SadSmile.svg'
import './announcement-card.css'

type Props = {
  respondents?: AnnouncementRespondent[]
  className?: string
}

const Avatar = ({ respondent }: { respondent: AnnouncementRespondent }) => (
  <UserAvatar
    userId={respondent.id}
    photoUrl={respondent.avatar}
    size="xxs"
    className="announcement-respondents__avatar"
    alt=""
  />
)

/** Стопка аватарок откликнувшихся + подпись: 0 / 1 / 2 / 3+ */
export const AnnouncementRespondents = ({ respondents = [], className }: Props) => {
  const rootClass = `announcement-respondents${className ? ` ${className}` : ''}`

  if (respondents.length === 0) {
    return (
      <div className={rootClass}>
        <div className="announcement-respondents__empty">
          <span className="announcement-respondents__empty-icon" aria-hidden>
            <img src={SadSmileIcon} alt="" width={24} height={24} />
          </span>
          <span className="announcement-respondents__empty-text">Никто не откликнулся</span>
        </div>
      </div>
    )
  }

  if (respondents.length === 1) {
    return (
      <div className={rootClass}>
        <Avatar respondent={respondents[0]} />
        <span className="announcement-respondents__text">
          {respondents[0].name} откликнул{respondents[0].name.endsWith('а') ? 'ась' : 'ся'}
        </span>
      </div>
    )
  }

  if (respondents.length === 2) {
    return (
      <div className={rootClass}>
        <div className="announcement-respondents__avatars">
          <Avatar respondent={respondents[0]} />
          <Avatar respondent={respondents[1]} />
        </div>
        <span className="announcement-respondents__text">
          {respondents[0].name} и {respondents[1].name} откликнулись
        </span>
      </div>
    )
  }

  return (
    <div className={rootClass}>
      <div className="announcement-respondents__avatars">
        <Avatar respondent={respondents[0]} />
        <Avatar respondent={respondents[1]} />
        <Avatar respondent={respondents[2]} />
      </div>
      <span className="announcement-respondents__text">
        {respondents[0].name} и ещё {respondents.length - 1} откликнулись
      </span>
    </div>
  )
}
