import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ApiRequestError,
  addSavedUser,
  blockUser,
  complainAboutStudent,
  createContact,
  deleteSavedUser,
  updateContact,
} from '../../../api'
import { rememberContactAddedAt } from '../../../shared/lib/contactAddedAt'
import { absorbServerContact } from '../../../shared/lib/contactMeta'
import { emitContactsChanged } from '../../../shared/lib/contactsEvents'
import { profileUrl } from '../../../shared/lib/appLinks'
import {
  forgetContactInFriendsCache,
  forgetSavedFromFriendsCache,
  patchFriendNoteInCache,
  rememberContactInFriendsCache,
  rememberSavedInFriendsCache,
} from '../../friends/lib/friendsCacheSync'
import { useModal } from '../../../app/providers/ModalContext'
import { useTabNavigation } from '../../../app/providers/TabNavigationContext'
import { isScannedContact } from '../../../shared/lib/scannedContacts'
import {
  hidePostAuthor,
  notifyHiddenAuthorsChanged,
} from '../../../shared/lib/hiddenPostAuthors'
import {
  formatBirthdateDisplay,
  formatEducationSubtitle,
  formatEducationTitle,
  formatWorkPeriod,
} from '../../../entities/profile/lib/formatters'
import { sortEducationEntries } from '../../../entities/profile/lib/apiMappers'
import { getPrioritySocialId } from '../../../entities/profile/lib/socialLinks'
import { SkillTag } from '../../../shared/ui/skill-tag/SkillTag'
import { SocialChip } from '../../../entities/profile/ui/SocialChip'
import { StatusBadge } from '../../../shared/ui/status-badge/StatusBadge'
import { Toast } from '../../../shared/ui/toast/Toast'
import { toUserError } from '../../../shared/lib/userError'
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/ConfirmDialog'
import { forgetBlockedProfile } from '../lib/forgetBlockedProfile'
import { useOtherProfile } from '../lib/useOtherProfile'
import { EmptyProfileContent } from './EmptyProfileContent'
import { NoteBottomSheet } from './NoteBottomSheet'
import { UserAvatar } from '../../../shared/ui/user-avatar/UserAvatar'
import { ReportBlockSheet } from './ReportBlockSheet'
import { ReportBottomSheet } from './ReportBottomSheet'
import { ReportSuccessSheet } from './ReportSuccessSheet'
import { ProfileAnnouncementsSection } from '../../../widgets/profile-announcements/ProfileAnnouncementsSection'
import { UserProfileHeader } from './UserProfileHeader'
import { ContactBadgeIcon } from './userProfileIcons'
import { usePageSwipeRight } from '../../../shared/lib/usePageSwipeRight'
import './user-profile-page.css'
import '../../profile/ui/profile-page.css'
import '../../../shared/ui/profile-card/profile-card.css'

type Sheet =
  | null
  | 'notes'
  | 'more'
  | 'report'
  | 'report-success'

const displayNameParts = (firstName: string, lastName: string) => {
  const first = firstName.trim()
  const last = lastName.trim()
  if (!first && !last) return null
  return { first, last }
}

export const UserProfilePage = () => {
  const { userId } = useParams<{ userId: string }>()
  const { exitUserProfile } = useTabNavigation()
  const { isAnyModalOpen } = useModal()
  const {
    user,
    education,
    work,
    hardSkills,
    softSkills,
    socials,
    isSaved,
    setIsSaved,
    isContact,
    setIsContact,
    note,
    setNote,
    loading,
    error,
    isEmpty,
  } = useOtherProfile(userId)

  const [activeTab, setActiveTab] = useState<'studies' | 'career'>('studies')
  const [activeSkillsTab, setActiveSkillsTab] = useState<'hard' | 'soft'>('hard')
  const [isStudiesExpanded, setIsStudiesExpanded] = useState(false)
  const [isCareerExpanded, setIsCareerExpanded] = useState(false)

  const [toast, setToast] = useState<string | null>(null)
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)
  const [blockBusy, setBlockBusy] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [blockConfirm, setBlockConfirm] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')

  /**
   * isAnyModalOpen — про шторки, которые страница не держит в своём state:
   * объявление, открытое из раздела внизу профиля, живёт в самом виджете.
   * Без этой проверки краевой свайп уносил бы страницу вместе с открытой
   * модалкой и выкидывал из профиля (модалка ловит тач на оверлее, а слушатели
   * жеста висят на window).
   */
  const canSwipeBack = sheet == null && !blockConfirm && !blockBusy && !isAnyModalOpen

  const { rootRef, rootClassName, runExitThen } = usePageSwipeRight({
    edgeSwipeEnabled: canSwipeBack,
    onEdgeSwipeBack: () => exitUserProfile(),
  })

  const goBack = () => {
    runExitThen(() => exitUserProfile())
  }

  const nameParts = user ? displayNameParts(user.firstName, user.lastName) : null
  const firstName = user?.firstName?.trim() || 'Пользователь'
  const prioritySocialId = getPrioritySocialId(socials)
  const sortedEducation = sortEducationEntries(education)
  const displayEducation = isStudiesExpanded ? sortedEducation : sortedEducation.slice(0, 2)
  const displayWork = isCareerExpanded ? work : work.slice(0, 2)
  const hasMoreStudies = sortedEducation.length > 2
  const hasMoreCareer = work.length > 2
  const skills = activeSkillsTab === 'hard' ? hardSkills : softSkills
  const contentEmpty =
    isEmpty &&
    sortedEducation.length === 0 &&
    work.length === 0 &&
    hardSkills.length === 0 &&
    softSkills.length === 0 &&
    socials.length === 0

  const handleFavorite = async () => {
    if (!userId || favoriteBusy) return
    setFavoriteBusy(true)
    try {
      if (isSaved) {
        await deleteSavedUser(userId)
        forgetSavedFromFriendsCache(userId)
        setIsSaved(false)
        setToast('Убрано из Избранного')
      } else {
        const saved = await addSavedUser(userId)
        await rememberSavedInFriendsCache(saved)
        setIsSaved(true)
        setToast(`${firstName} теперь в Избранном`)
      }
      // Стикеры на аватарках (поиск) живут в useAvatarStickers — просим перечитать
      emitContactsChanged()
    } catch (err) {
      setToast(toUserError(err, 'Не удалось обновить избранное'))
    } finally {
      setFavoriteBusy(false)
    }
  }

  const handleCopyLink = async () => {
    if (!userId) return
    const url = profileUrl(userId)
    try {
      await navigator.clipboard.writeText(url)
      setToast('Ссылка на профиль скопирована')
    } catch {
      setToast('Не удалось скопировать ссылку')
    }
  }

  // Контакт на сервере = встретились (неважно, кто кого сканировал); локальная
  // метка — фолбэк до первого синка и для старого бэка без source. Раньше гейт
  // висел только на локальной метке, и после «Выйти» заметка запиралась.
  const canWriteNote = Boolean(userId && (isContact || isScannedContact(userId)))

  const openNotes = () => {
    if (!userId) return
    if (!canWriteNote) {
      setToast('Сначала встретьтесь с этим человеком')
      return
    }
    setNoteDraft(note)
    setSheet('notes')
  }

  const handleSaveNote = async (nextNote: string) => {
    if (!userId || !canWriteNote) return

    const trimmed = nextNote.trim()

    try {
      if (!isContact) {
        try {
          const contact = await createContact({ contactId: userId, note: trimmed || null })
          // Сначала серверные source/createdAt, потом локальная дата: она не
          // перезаписывает уже записанную и остаётся фолбэком старому бэку.
          absorbServerContact(contact)
          rememberContactAddedAt(userId)
          await rememberContactInFriendsCache(contact)
          setIsContact(true)
          setNote(contact.note?.trim() ?? trimmed)
        } catch (err) {
          if (!(err instanceof ApiRequestError && err.status === 409)) {
            throw err
          }
          const contact = await updateContact(userId, { note: trimmed || null })
          // Контакт уже был на сервере: без absorb серверные source/createdAt
          // приехали бы только со следующим синком, как в соседних ветках.
          absorbServerContact(contact)
          await rememberContactInFriendsCache(contact)
          setIsContact(true)
          setNote(contact.note?.trim() ?? trimmed)
        }
      } else {
        const contact = await updateContact(userId, { note: trimmed || null })
        // В этой ветке кэш Нитей патчится точечно (только заметка) — метку и дату
        // с сервера впитываем здесь, иначе они бы приехали лишь со следующим синком.
        absorbServerContact(contact)
        patchFriendNoteInCache(userId, contact.note?.trim() ?? trimmed)
        setNote(contact.note?.trim() ?? trimmed)
      }

      // Заметка меняет стикер на аватарке — перечитываем контакты
      emitContactsChanged()
      setSheet(null)
      setToast('Заметка сохранена')
    } catch (err) {
      setToast(toUserError(err, 'Не удалось сохранить заметку'))
    }
  }

  const handleReportSubmit = async (payload: { reason: string; text: string }) => {
    if (!userId || reportBusy) return
    setReportBusy(true)
    try {
      await complainAboutStudent(userId, payload)
      setSheet('report-success')
    } catch (err) {
      setToast(toUserError(err, 'Не удалось отправить жалобу'))
    } finally {
      setReportBusy(false)
    }
  }

  const handleBlockConfirm = async () => {
    if (!userId || blockBusy) return
    setBlockBusy(true)
    try {
      await blockUser(userId)
      hidePostAuthor(userId)
      notifyHiddenAuthorsChanged()
      // Бэк на блокировке рвёт связи (контакт + избранное), локальные кэши об этом
      // не знают: выкидываем профиль из кэша чужих профилей и из кэша Нитей
      // (список перерисуется сразу — на это событие подписан useFriends),
      // иначе заблокированный висит в Нитях и открывается из кэша.
      forgetBlockedProfile(userId)
      forgetContactInFriendsCache(userId)
      emitContactsChanged()
      setIsContact(false)
      setIsSaved(false)
      setBlockConfirm(false)
      setSheet(null)
      setToast('Пользователь заблокирован')
      goBack()
    } catch (err) {
      setToast(toUserError(err, 'Не удалось заблокировать'))
    } finally {
      setBlockBusy(false)
    }
  }

  return (
    <main ref={rootRef} className={`user-profile ${rootClassName}`}>
      <UserProfileHeader
        isSaved={isSaved}
        hasNote={Boolean(note.trim())}
        favoriteBusy={favoriteBusy}
        notesLocked={!canWriteNote}
        onBack={goBack}
        onFavorite={() => void handleFavorite()}
        onCopyLink={() => void handleCopyLink()}
        onNotes={openNotes}
        onReport={() => setSheet('more')}
      />

      <div className="user-profile__content">
        {!loading && error && (
          <p className="user-profile__status" role="alert">
            {error}
          </p>
        )}

        {!loading && !error && user && (
          <>
            <div className="profile-page__header-content">
              <div className="profile-page__avatar-wrap">
                <div className="profile-page__avatar">
                  <UserAvatar
                    userId={user.id}
                    photoUrl={user.photoUrl}
                    size="fill"
                    className="profile-page__avatar-image"
                    alt=""
                  />
                </div>
                {isContact && (
                  <span className="user-profile__contact-badge" aria-label="В контактах">
                    <ContactBadgeIcon />
                  </span>
                )}
                {user.status && (
                  <StatusBadge
                    className="profile-page__avatar-btn"
                    label={user.status}
                    as="span"
                  />
                )}
              </div>

              {nameParts ? (
                <h1 className="profile-page__name">
                  {nameParts.first}
                  {nameParts.first && nameParts.last ? <br /> : null}
                  {nameParts.last}
                </h1>
              ) : (
                <h1 className="profile-page__name">Без имени</h1>
              )}

              {user.speciality ? (
                <p className="profile-page__position">{user.speciality}</p>
              ) : null}
            </div>

            <div className="profile-page_information-block">
              {contentEmpty ? (
                <EmptyProfileContent />
              ) : (
                <>
                  {socials.length > 0 && (
                    <div className="profile-page__contacts">
                      {socials.map((social, index) => {
                        const isPrimal = social.id === prioritySocialId
                        return (
                          <SocialChip
                            key={social.id}
                            social={social}
                            className={`profile-page__contacts-btn${isPrimal ? ' profile-page__contacts-btn--primal' : ''}`}
                            iconWrapClassName="profile-page__contacts-btn-icon"
                            iconClassName="mt-0.5"
                            style={{ animationDelay: `${220 + index * 45}ms` }}
                          />
                        )
                      })}
                    </div>
                  )}

                  <div className="profile-page__tabs">
                    <button
                      type="button"
                      className={`profile-page__skills-tab ${activeTab === 'studies' ? 'profile-page__skills-tab--active' : ''}`}
                      onClick={() => setActiveTab('studies')}
                    >
                      Учёба
                    </button>
                    <div className="profile-page__tab-line" />
                    <button
                      type="button"
                      className={`profile-page__skills-tab ${activeTab === 'career' ? 'profile-page__skills-tab--active' : ''}`}
                      onClick={() => setActiveTab('career')}
                    >
                      Карьера
                    </button>
                  </div>

                  <div key={activeTab} className="profile-page__tab-content">
                    {activeTab === 'studies' && (
                      <>
                        {displayEducation.length > 0 ? (
                          <div className="profile-card-list">
                            {displayEducation.map((edu, index) => (
                              <article
                                key={edu.id}
                                className="profile-card profile-page__list-item"
                                style={{ animationDelay: `${index * 55}ms` }}
                              >
                                <div className="profile-card__body">
                                  <p className="profile-card__title">
                                    {formatEducationTitle(edu)}
                                  </p>
                                  <p className="profile-card__subtitle">
                                    {formatEducationSubtitle(edu)}
                                  </p>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="profile-page__empty">Нет данных об учёбе</p>
                        )}
                        {hasMoreStudies && (
                          <button
                            type="button"
                            className="profile-page__expand-btn"
                            onClick={() => setIsStudiesExpanded(!isStudiesExpanded)}
                          >
                            {isStudiesExpanded ? 'Свернуть' : `Ещё ${sortedEducation.length - 2} ▼`}
                          </button>
                        )}
                      </>
                    )}

                    {activeTab === 'career' && (
                      <>
                        {displayWork.length > 0 ? (
                          <div className="profile-card-list">
                            {displayWork.map((job, index) => (
                              <article
                                key={job.id}
                                className="profile-card profile-page__list-item"
                                style={{ animationDelay: `${index * 55}ms` }}
                              >
                                <div className="profile-card__body">
                                  {job.company && (
                                    <p className="profile-card__title">{job.company}</p>
                                  )}
                                  {job.position && (
                                    <p className="profile-card__position">{job.position}</p>
                                  )}
                                  {formatWorkPeriod(job) && (
                                    <p className="profile-card__subtitle">
                                      {formatWorkPeriod(job)}
                                    </p>
                                  )}
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="profile-page__empty">Нет данных о карьере</p>
                        )}
                        {hasMoreCareer && (
                          <button
                            type="button"
                            className="profile-page__expand-btn"
                            onClick={() => setIsCareerExpanded(!isCareerExpanded)}
                          >
                            {isCareerExpanded ? 'Свернуть' : `Ещё ${work.length - 2} ▼`}
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  <div className="profile-page__skills-tabs">
                    <button
                      type="button"
                      className={`profile-page__skills-tab ${activeSkillsTab === 'hard' ? 'profile-page__skills-tab--active' : ''}`}
                      onClick={() => setActiveSkillsTab('hard')}
                    >
                      Скиллы
                    </button>
                    <div className="profile-page__skills-tab-line" />
                    <button
                      type="button"
                      className={`profile-page__skills-tab ${activeSkillsTab === 'soft' ? 'profile-page__skills-tab--active' : ''}`}
                      onClick={() => setActiveSkillsTab('soft')}
                    >
                      Интересы
                    </button>
                  </div>

                  <div key={activeSkillsTab} className="profile-page__skills-tab-content">
                    {skills.length > 0 ? (
                      <div className="profile-page__skills">
                        {skills.map((skill, index) => (
                          <span
                            key={skill.id}
                            className="profile-page__skill-enter"
                            style={{ animationDelay: `${index * 40}ms` }}
                          >
                            <SkillTag skill={skill} />
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="profile-page__empty">
                        {activeSkillsTab === 'hard' ? 'Нет скиллов' : 'Нет интересов'}
                      </p>
                    )}

                    <section className="profile-page__about">
                      <h3 className="profile-page__section-title profile-page__section-title--about">
                        Обо мне
                      </h3>
                      {user.bio ? (
                        <p>{user.bio}</p>
                      ) : (
                        <p className="profile-page__empty">Нет описания</p>
                      )}
                      {user.birthdate && (
                        <div className="profile-page__birthday-tag">
                          <span className="profile-page__birthday-label">🎂</span>
                          <span className="profile-page__birthday-date">
                            {formatBirthdateDisplay(user.birthdate)}
                          </span>
                        </div>
                      )}
                    </section>
                  </div>
                </>
              )}

              {/* Вне ветки contentEmpty: у пустого профиля объявления всё равно
                  могут быть, и раздел — единственное, что там стоит показать.
                  Своих объявлений раздел сам не покажет, если их нет. */}
              <ProfileAnnouncementsSection userId={userId} />
            </div>
          </>
        )}
      </div>

      {sheet === 'notes' && userId && (
        <NoteBottomSheet
          initialNote={noteDraft}
          onClose={() => setSheet(null)}
          onSave={handleSaveNote}
        />
      )}

      {sheet === 'more' && (
        <ReportBlockSheet
          onClose={() => setSheet(null)}
          onReport={() => setSheet('report')}
          onBlock={() => {
            setSheet(null)
            setBlockConfirm(true)
          }}
        />
      )}

      {sheet === 'report' && (
        <ReportBottomSheet
          onClose={() => setSheet(null)}
          onSubmit={handleReportSubmit}
          submitting={reportBusy}
        />
      )}

      {sheet === 'report-success' && <ReportSuccessSheet onClose={() => setSheet(null)} />}

      {blockConfirm && (
        <ConfirmDialog
          title="Заблокировать пользователя?"
          subtitle="Ты больше не будешь видеть его в приложении"
          confirmLabel={blockBusy ? 'Блокируем…' : 'Заблокировать'}
          cancelLabel="Отменить"
          onConfirm={() => void handleBlockConfirm()}
          onCancel={() => {
            if (!blockBusy) setBlockConfirm(false)
          }}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </main>
  )
}
