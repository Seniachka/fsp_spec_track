import ArrowBackIcon from '../../../assets/components/arrowBack'
import { FiAlertTriangle } from 'react-icons/fi'
import { HeartIcon, LinkIcon, NotesIcon } from './userProfileIcons'

type UserProfileHeaderProps = {
  isSaved: boolean
  /** Есть сохранённая заметка про этого человека — иконка заливается фиолетовым */
  hasNote?: boolean
  favoriteBusy?: boolean
  notesLocked?: boolean
  onBack: () => void
  onFavorite: () => void
  onCopyLink: () => void
  onNotes: () => void
  onReport: () => void
}

export const UserProfileHeader = ({
  isSaved,
  hasNote = false,
  favoriteBusy,
  notesLocked = false,
  onBack,
  onFavorite,
  onCopyLink,
  onNotes,
  onReport,
}: UserProfileHeaderProps) => (
  <header className="user-profile__toolbar">
    <div className="user-profile__back-wrap">
      <button type="button" className="user-profile__back" onClick={onBack} aria-label="Назад">
        <ArrowBackIcon />
      </button>
    </div>
    <div className="user-profile__actions">
      <button
        type="button"
        className="user-profile__action-btn"
        onClick={onFavorite}
        disabled={favoriteBusy}
        aria-label={isSaved ? 'Убрать из избранного' : 'Добавить в избранное'}
        aria-pressed={isSaved}
      >
        <HeartIcon filled={isSaved} />
      </button>
      <button type="button" className="user-profile__action-btn" onClick={onCopyLink} aria-label="Скопировать ссылку">
        <LinkIcon />
      </button>
      <button
        type="button"
        className={`user-profile__action-btn${notesLocked ? ' user-profile__action-btn--locked' : ''}`}
        onClick={onNotes}
        aria-label={hasNote ? 'Изменить заметку' : 'Заметка'}
        aria-pressed={hasNote}
        aria-disabled={notesLocked}
      >
        <NotesIcon filled={hasNote} />
      </button>
      <button type="button" className="user-profile__action-btn" onClick={onReport} aria-label="Пожаловаться">
        <FiAlertTriangle size={24} strokeWidth={1.5} />
      </button>
    </div>
  </header>
)
