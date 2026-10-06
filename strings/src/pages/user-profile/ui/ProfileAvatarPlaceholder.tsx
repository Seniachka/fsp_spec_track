import { UserAvatar } from '../../../shared/ui/user-avatar/UserAvatar'

type ProfileAvatarPlaceholderProps = {
  userId: string
}

/** @deprecated Используйте UserAvatar — оставлено как тонкая обёртка для профиля. */
export const ProfileAvatarPlaceholder = ({ userId }: ProfileAvatarPlaceholderProps) => (
  <UserAvatar userId={userId} size="fill" className="profile-page__avatar-image" />
)
