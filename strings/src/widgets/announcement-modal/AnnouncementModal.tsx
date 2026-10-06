import { useRef, useState, useEffect } from 'react'
import { FiX, FiArrowLeft, FiAlertTriangle } from 'react-icons/fi'
import type { Announcement, AnnouncementRespondent } from '../../pages/afisha/lib/mapAnnouncement'
import { mapUserToRespondent } from '../../pages/afisha/lib/mapAnnouncement'
import { listPostResponders } from '../../api/Announcements'
import { prefetchOtherProfiles } from '../../entities/profile/lib/prefetchOtherProfiles'
import { warmUserPhotos } from '../../shared/lib/preloadImages'
import { listStudentSocials } from '../../api/Students'
import { mapSocialToUi } from '../../entities/profile/lib/apiMappers'
import { getPrioritySocialId } from '../../entities/profile/lib/socialLinks'
import type { SocialLink } from '../../entities/profile/model/types'
import { SocialChip } from '../../entities/profile/ui/SocialChip'
import { useModal } from '../../app/providers/ModalContext'
import { useTabNavigation } from '../../app/providers/TabNavigationContext'
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/ConfirmDialog'
import DeleteAnnouncementIcon from '../../assets/DeleteAnnouncement.svg'
import ResponseSentIcon from '../../assets/ResponseSent.svg'
import SadSmileIcon from '../../assets/SadSmile.svg'
import { UserAvatar } from '../../shared/ui/user-avatar/UserAvatar'
import { AnnouncementReportFlow } from '../announcement-report/AnnouncementReportFlow'
import { hidePostAuthor, notifyHiddenAuthorsChanged } from '../../shared/lib/hiddenPostAuthors'
import { announcementUrl } from '../../shared/lib/appLinks'
import { useSheetDismiss } from '../../shared/lib/useSheetDismiss'
import {
  containsProhibitedContent,
  PROHIBITED_CONTENT_MESSAGE,
} from '../../shared/lib/contentPolicy'
import './announcement-modal.css'

const DESC_MAX = 300

const SuccessModal = ({
  authorId,
  onClose,
}: {
  authorId: string
  onClose: () => void
}) => {
  const [closing, setClosing] = useState(false)
  const [socials, setSocials] = useState<SocialLink[]>([])
  const [socialsLoading, setSocialsLoading] = useState(Boolean(authorId))
  const closedRef = useRef(false)

  useEffect(() => {
    if (!authorId) {
      setSocialsLoading(false)
      return
    }
    let cancelled = false
    setSocialsLoading(true)
    void listStudentSocials(authorId)
      .then((raw) => {
        if (cancelled) return
        setSocials(
          raw
            .map(mapSocialToUi)
            .filter((s): s is SocialLink => Boolean(s?.href?.trim())),
        )
      })
      .catch(() => {
        if (!cancelled) setSocials([])
      })
      .finally(() => {
        if (!cancelled) setSocialsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authorId])

  const finish = () => {
    if (closedRef.current) return
    closedRef.current = true
    onClose()
  }

  const requestClose = () => setClosing(true)

  useEffect(() => {
    if (!closing) return
    const t = window.setTimeout(finish, 360)
    return () => window.clearTimeout(t)
  }, [closing])

  const priorityId = getPrioritySocialId(socials)

  return (
    <div className="announcement-modal-overlay" onClick={requestClose}>
      <div
        className={`announcement-modal announcement-modal--compact ${closing ? 'sheet-modal--exit' : 'sheet-modal--enter'}`}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={() => {
          if (closing) finish()
        }}
      >
        <div className="announcement-modal__header">
          <span className="announcement-modal__drag-handle" />
          <button type="button" className="announcement-modal__close" onClick={requestClose}>
            <FiX size={24} strokeWidth={1.5} />
          </button>
        </div>
        <div className="announcement-modal__body announcement-modal__body--success">
          <div className="announcement-modal__success">
            <img src={ResponseSentIcon} alt="" className="announcement-modal__success-icon" />
            <h2 className="announcement-modal__success-title">Отклик отправлен</h2>
            <p className="announcement-modal__success-text">
              Автор получит твою заявку. При желании можешь связаться с ним напрямую.
            </p>
            {!socialsLoading && socials.length > 0 && (
              <div className="announcement-modal__success-socials">
                {socials.map((social) => {
                  const isPrimal = social.id === priorityId
                  return (
                    <SocialChip
                      key={social.id}
                      social={social}
                      className={`announcement-modal__success-social${isPrimal ? ' announcement-modal__success-social--primal' : ''}`}
                      iconWrapClassName="announcement-modal__success-social-icon"
                      onClick={(e) => e.stopPropagation()}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface AnnouncementModalProps {
  announcement: Announcement
  isOwn: boolean
  onClose: () => void
  /** Промис должен реджектиться при ошибке — иначе покажем «Отклик отправлен» зря */
  onRespond?: () => void | Promise<void>
  onWithdraw?: () => void
  onDelete?: () => void
  onEdit?: (updated: Announcement) => void
}

export const AnnouncementModal = ({
  announcement,
  isOwn,
  onClose,
  onRespond,
  onWithdraw,
  onDelete,
  onEdit,
}: AnnouncementModalProps) => {
  const { openUserProfile } = useTabNavigation()
  const modalRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const { openModal, closeModal } = useModal()

  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(announcement.title)
  const [editDescription, setEditDescription] = useState(announcement.description)
  const [hasChanges, setHasChanges] = useState(false)
  const [showEditConfirm, setShowEditConfirm] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [showReportFlow, setShowReportFlow] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false)
  const [isResponded, setIsResponded] = useState(announcement.isResponded || false)
  const [respondBusy, setRespondBusy] = useState(false)
  const [respondents, setRespondents] = useState<AnnouncementRespondent[]>(
    announcement.respondents ?? [],
  )

  const isEditingRef = useRef(isEditing)
  const hasChangesRef = useRef(hasChanges)
  isEditingRef.current = isEditing
  hasChangesRef.current = hasChanges

  const { closing, requestClose, tryClose, onAnimEnd } = useSheetDismiss(modalRef, headerRef, {
    onClosed: onClose,
    canClose: () => {
      if (isEditingRef.current && hasChangesRef.current) {
        setShowEditConfirm(true)
        return false
      }
      return true
    },
    ignoreSelector:
      '.announcement-modal__close, .announcement-modal__delete, .announcement-modal__report, .announcement-modal__back',
  })

  useEffect(() => {
    openModal()
    return () => closeModal()
  }, [openModal, closeModal])

  useEffect(() => {
    setHasChanges(
      editTitle !== announcement.title || editDescription !== announcement.description,
    )
  }, [editTitle, editDescription, announcement])

  useEffect(() => {
    if (!isOwn) return
    if ((announcement.respondents?.length ?? 0) > 0) {
      setRespondents(announcement.respondents ?? [])
      return
    }
    let cancelled = false
    void listPostResponders(announcement.id)
      .then((users) => {
        if (cancelled) return
        setRespondents(users.map(mapUserToRespondent))
        void warmUserPhotos(users)
        void prefetchOtherProfiles(
          users.map((user) => ({
            user,
            isSaved: false,
            isContact: false,
            note: '',
          })),
          { concurrency: 4, skipIfCached: true },
        )
      })
      .catch(() => {
        if (!cancelled) setRespondents([])
      })
    return () => {
      cancelled = true
    }
  }, [isOwn, announcement.id, announcement.respondents])

  /** «Отклик отправлен» — только после ответа сервера, иначе статус не меняем */
  const handleRespond = async () => {
    if (respondBusy) return
    setRespondBusy(true)
    try {
      if (onRespond) await onRespond()
      setIsResponded(true)
      setShowSuccessModal(true)
    } catch {
      // текст ошибки показывает страница (тост) — кнопка остаётся «Откликнуться»
    } finally {
      setRespondBusy(false)
    }
  }

  const canSaveEdit = editTitle.trim() !== '' && editDescription.trim() !== ''

  const handleSaveEdit = () => {
    if (!canSaveEdit) return
    const nextTitle = editTitle.trim().slice(0, 63)
    const nextDescription = editDescription.trim().slice(0, DESC_MAX)
    if (containsProhibitedContent(nextTitle) || containsProhibitedContent(nextDescription)) {
      window.dispatchEvent(new CustomEvent('faculty:toast', { detail: PROHIBITED_CONTENT_MESSAGE }))
      return
    }
    if (onEdit) {
      onEdit({
        ...announcement,
        title: nextTitle,
        description: nextDescription,
      })
    }
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    if (hasChanges) {
      setShowEditConfirm(true)
    } else {
      setIsEditing(false)
      setEditTitle(announcement.title)
      setEditDescription(announcement.description)
    }
  }

  const handleDelete = () => {
    setShowDeleteConfirm(true)
  }

  const confirmDelete = () => {
    setShowDeleteConfirm(false)
    if (onDelete) onDelete()
  }

  const handleWithdrawResponse = () => {
    setShowWithdrawConfirm(true)
  }

  const confirmWithdraw = () => {
    setShowWithdrawConfirm(false)
    setIsResponded(false)
    if (onWithdraw) onWithdraw()
  }

  const handleShare = async () => {
    const url = announcementUrl(announcement.id)
    const shareData = {
      title: announcement.title,
      text: announcement.description,
      url,
    }
    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch {
        /* ignore */
      }
    } else {
      await navigator.clipboard.writeText(url)
      window.dispatchEvent(new CustomEvent('faculty:toast', { detail: 'Ссылка скопирована' }))
    }
  }

  const goToProfile = (userId: string) => {
    if (!userId) return
    /**
     * Таб не хардкодим: модалка открывается и со страницы объявлений (там
     * activeTab и так 'afisha' — поведение прежнее), и из раздела объявлений в
     * профиле. С хардкодом переход уносил в Афишу, а «Назад» из открытого
     * профиля возвращал на /afisha вместо профиля, откуда пришли.
     */
    openUserProfile(userId)
  }


  return (
    <>
      <div className="announcement-modal-overlay" onClick={tryClose}>
        <div
          className={`announcement-modal ${closing ? 'sheet-modal--exit' : 'sheet-modal--enter'}`}
          ref={modalRef}
          onClick={(e) => e.stopPropagation()}
          onAnimationEnd={onAnimEnd}
        >
          <div className="announcement-modal__header" ref={headerRef}>
            <span className="announcement-modal__drag-handle" />
            {isOwn && !isEditing && (
              <button
                type="button"
                className="announcement-modal__delete"
                onClick={handleDelete}
                aria-label="Удалить"
              >
                <img src={DeleteAnnouncementIcon} alt="" width={24} height={24} />
              </button>
            )}
            {!isOwn && !isEditing && (
              <button
                type="button"
                className="announcement-modal__report"
                onClick={() => setShowReportFlow(true)}
                aria-label="Пожаловаться"
              >
                <FiAlertTriangle size={24} strokeWidth={1.5} />
              </button>
            )}
            {isEditing && (
              <button type="button" className="announcement-modal__back" onClick={handleCancelEdit}>
                <FiArrowLeft size={24} strokeWidth={1.5} />
              </button>
            )}
            <h2 className="announcement-modal__title">
              {isEditing ? 'Редактирование' : 'Объявление'}
            </h2>
            <button type="button" className="announcement-modal__close" onClick={tryClose}>
              <FiX size={24} strokeWidth={1.5} />
            </button>
          </div>

          <div className="announcement-modal__body">
            {isEditing ? (
              <>
                <input
                  type="text"
                  className="announcement-modal__input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Заголовок"
                  maxLength={63}
                />
                <textarea
                  className="announcement-modal__textarea"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Описание"
                  maxLength={DESC_MAX}
                  rows={5}
                />
                <div className="announcement-modal__counter">
                  {editDescription.length}/{DESC_MAX}
                </div>
              </>
            ) : (
              <>
                <h3 className="announcement-modal__body-title">{announcement.title}</h3>
                {announcement.description ? (
                  <p className="announcement-modal__description">{announcement.description}</p>
                ) : null}

                {!isOwn && (
                  <button
                    type="button"
                    className="announcement-modal__author"
                    onClick={() => goToProfile(announcement.author.id)}
                  >
                    <UserAvatar
                      userId={announcement.author.id}
                      photoUrl={announcement.author.avatar}
                      size="xs"
                      alt=""
                    />
                    <span>{announcement.author.name}</span>
                  </button>
                )}

                {isOwn && (
                  <div className="announcement-modal__responses">
                    <div className="announcement-modal__responses-title">ОТКЛИКИ</div>
                    <div className="announcement-modal__responses-list">
                      {respondents.length === 0 ? (
                        <div className="announcement-modal__responses-empty">
                          <span className="announcement-modal__responses-empty-icon" aria-hidden>
                            <img src={SadSmileIcon} alt="" width={30} height={30} />
                          </span>
                          <span className="announcement-modal__responses-empty-text">
                            Никто не откликнулся
                          </span>
                        </div>
                      ) : (
                        respondents.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            className="announcement-modal__response-item"
                            onClick={() => goToProfile(r.id)}
                          >
                            <UserAvatar userId={r.id} photoUrl={r.avatar} size="xs" alt="" />
                            <span>{r.name}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {!isOwn && isResponded && (
                  <div className="announcement-modal__responded-badge">
                    <span className="announcement-modal__responded-icon">✓</span>
                    <span className="announcement-modal__responded-text">Отклик отправлен</span>
                  </div>
                )}
              </>
            )}
          </div>

          <div
            className={`announcement-modal__actions${!isEditing ? ' announcement-modal__actions--view' : ''}`}
          >
            {isEditing ? (
              <button
                type="button"
                className="announcement-modal__btn announcement-modal__btn--primary"
                onClick={handleSaveEdit}
                disabled={!canSaveEdit}
              >
                Сохранить
              </button>
            ) : isOwn ? (
              <>
                <button
                  type="button"
                  className="announcement-modal__btn announcement-modal__btn--primary"
                  onClick={() => setIsEditing(true)}
                >
                  Редактировать
                </button>
                <button
                  type="button"
                  className="announcement-modal__btn announcement-modal__btn--secondary"
                  onClick={() => void handleShare()}
                >
                  Поделиться
                </button>
              </>
            ) : isResponded ? (
              <>
                <button
                  type="button"
                  className="announcement-modal__btn announcement-modal__btn--danger"
                  onClick={handleWithdrawResponse}
                >
                  Отозвать отклик
                </button>
                <button
                  type="button"
                  className="announcement-modal__btn announcement-modal__btn--secondary"
                  onClick={() => void handleShare()}
                >
                  Поделиться
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="announcement-modal__btn announcement-modal__btn--primary"
                  onClick={() => void handleRespond()}
                  disabled={respondBusy}
                >
                  Откликнуться
                </button>
                <button
                  type="button"
                  className="announcement-modal__btn announcement-modal__btn--secondary"
                  onClick={() => void handleShare()}
                >
                  Поделиться
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showEditConfirm && (
        <ConfirmDialog
          title="Точно хочешь выйти?"
          subtitle="Внесённые изменения не сохранятся"
          confirmLabel="Выйти"
          cancelLabel="Уже не хочу"
          onConfirm={() => {
            setShowEditConfirm(false)
            setIsEditing(false)
            setEditTitle(announcement.title)
            setEditDescription(announcement.description)
            requestClose()
          }}
          onCancel={() => setShowEditConfirm(false)}
        />
      )}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Точно хочешь удалить объявление?"
          subtitle="Его нельзя будет восстановить"
          confirmLabel="Удалить"
          cancelLabel="Уже не хочу"
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {showWithdrawConfirm && (
        <ConfirmDialog
          title="Точно хочешь отозвать отклик?"
          subtitle="Автор объявления не увидит твой отклик в списке активных"
          confirmLabel="Отозвать"
          cancelLabel="Уже не хочу"
          onConfirm={confirmWithdraw}
          onCancel={() => setShowWithdrawConfirm(false)}
        />
      )}
      {showReportFlow && (
        <AnnouncementReportFlow
          postId={announcement.id}
          authorId={announcement.author.id}
          onClose={() => setShowReportFlow(false)}
          onReported={() => {}}
          onHideAuthor={() => {
            hidePostAuthor(announcement.author.id)
            notifyHiddenAuthorsChanged()
            requestClose()
          }}
        />
      )}
      {showSuccessModal && (
        <SuccessModal
          authorId={announcement.author.id}
          onClose={() => {
            setShowSuccessModal(false)
          }}
        />
      )}
    </>
  )
}
