import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { FiArrowLeft, FiPlus } from 'react-icons/fi'
import { getPost } from '../../../api/Announcements'
import { AnnouncementModal } from '../../../widgets/announcement-modal/AnnouncementModal'
import { CreateAnnouncementModal } from '../../../widgets/create-announcement-modal/CreateAnnouncementModal'
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/ConfirmDialog'
import { announcementPath } from '../../../shared/lib/appLinks'
import { useMinLoading } from '../../../shared/lib/useMinLoading'
import { usePageSwipeRight } from '../../../shared/lib/usePageSwipeRight'
import { useAnnouncements } from '../../afisha/lib/useAnnouncements'
import { mapApiPostToUi, type Announcement } from '../../afisha/lib/mapAnnouncement'
import {
  getDaysLeft,
  getDaysText,
  isActualAnnouncement,
} from '../../afisha/lib/announcementTtl'
import { AnnouncementRespondents } from '../../../widgets/announcement-card/AnnouncementRespondents'
import { AnnouncementTimerBadge } from '../../../widgets/announcement-card/AnnouncementTimerBadge'
import './announcements-page.css'
import { UserAvatar } from '../../../shared/ui/user-avatar/UserAvatar'
import { Toast } from '../../../shared/ui/toast/Toast'
import { toUserError } from '../../../shared/lib/userError'

type Tab = 'feed' | 'created' | 'responses'

/** Раздел объявлений в профиле открывает страницу сразу на нужной вкладке */
type AnnouncementsLocationState = { announcementsTab?: Tab } | null

const isTab = (value: unknown): value is Tab =>
  value === 'feed' || value === 'created' || value === 'responses'

const AnnouncementsSkeleton = () => (
  <div className="announcements-page__skeleton" aria-hidden>
    {Array.from({ length: 3 }, (_, i) => (
      <div key={i} className="announcements-page__card announcements-page__card--skeleton">
        <div className="announcements-page__skeleton-block announcements-page__skeleton-block--title" />
        <div className="announcements-page__skeleton-block announcements-page__skeleton-block--desc" />
        <div className="announcements-page__skeleton-block announcements-page__skeleton-block--desc-short" />
        <div className="announcements-page__card-author">
          <div className="announcements-page__skeleton-block announcements-page__skeleton-block--avatar" />
          <div className="announcements-page__skeleton-block announcements-page__skeleton-block--name" />
        </div>
      </div>
    ))}
  </div>
)

export const AnnouncementsPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { announcementId } = useParams<{ announcementId?: string }>()
  const {
    feed,
    mine,
    responded,
    meId,
    loading,
    error,
    refetch,
    create,
    edit,
    remove,
    respond,
    withdraw,
    republish,
  } = useAnnouncements()
  const showSkeleton = useMinLoading(loading)

  const [activeTab, setActiveTab] = useState<Tab>('feed')
  /**
   * Переход «В раздел» из профиля просит открыть конкретную вкладку.
   * Страница живёт под keep-alive и может быть уже смонтирована, поэтому
   * ориентируемся на location.key, а не на mount. Одна запись истории
   * применяется один раз: переключив вкладку руками, пользователь её не теряет.
   */
  const [appliedTabKey, setAppliedTabKey] = useState<string | null>(null)
  const [fetchedAnnouncement, setFetchedAnnouncement] = useState<Announcement | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState<{
    open: boolean
    title: string
    subtitle: string
    confirmLabel: string
    cancelLabel: string
    onConfirm: () => void
  }>({
    open: false,
    title: '',
    subtitle: '',
    confirmLabel: '',
    cancelLabel: '',
    onConfirm: () => {},
  })

  const requestedTab = (location.state as AnnouncementsLocationState)?.announcementsTab
  if (isTab(requestedTab) && appliedTabKey !== location.key) {
    setAppliedTabKey(location.key)
    setActiveTab(requestedTab)
  }

  const isCoveredByProfile = /^\/afisha\/announcements\/u\//.test(location.pathname)

  const allKnown = useMemo(() => {
    const map = new Map<string, Announcement>()
    for (const item of [...feed, ...mine, ...responded]) {
      map.set(item.id, item)
    }
    return map
  }, [feed, mine, responded])

  const listMatch = announcementId ? allKnown.get(announcementId) ?? null : null
  const selectedAnnouncement = announcementId ? listMatch ?? fetchedAnnouncement : null

  const { rootRef, rootClassName, navigateBack } = usePageSwipeRight({
    backTo: '/afisha',
    edgeSwipeEnabled:
      !isCoveredByProfile &&
      !selectedAnnouncement &&
      !showCreateModal &&
      !showConfirm.open,
  })

  useEffect(() => {
    if (!announcementId) {
      setFetchedAnnouncement(null)
      return
    }
    if (listMatch) {
      setFetchedAnnouncement(null)
      return
    }
    if (loading) return

    let cancelled = false
    void (async () => {
      try {
        const post = await getPost(announcementId)
        if (cancelled) return
        const mapped = mapApiPostToUi(post, {
          meId,
          respondedIds: new Set(responded.map((a) => a.id)),
        })
        // Срок публикации истёк — чужое объявление больше не показываем.
        // Своё владелец должен видеть: из АРХИВА его можно опубликовать заново.
        if (mapped.isArchived && !mapped.isOwn) {
          setFetchedAnnouncement(null)
          navigate('/afisha/announcements', { replace: true })
          return
        }
        setFetchedAnnouncement(mapped)
      } catch {
        if (cancelled) return
        // Удалено / срок истёк / битая ссылка — просто открываем страницу объявлений
        setFetchedAnnouncement(null)
        navigate('/afisha/announcements', { replace: true })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [announcementId, listMatch, loading, meId, responded, navigate])

  const openAnnouncement = (ann: Announcement) => {
    navigate(announcementPath(ann.id))
  }

  const closeAnnouncement = () => {
    navigate('/afisha/announcements', { replace: true })
  }

  const currentDate = new Date()

  const actualOwn = useMemo(
    () => mine.filter((a) => isActualAnnouncement(a, currentDate)),
    [mine, currentDate],
  )

  const archivedOwn = useMemo(
    () => mine.filter((a) => !isActualAnnouncement(a, currentDate)),
    [mine, currentDate],
  )

  const openConfirm = (
    title: string,
    subtitle: string,
    confirmLabel: string,
    cancelLabel: string,
    onConfirm: () => void,
  ) => {
    setShowConfirm({ open: true, title, subtitle, confirmLabel, cancelLabel, onConfirm })
  }

  return (
    <main ref={rootRef} className={`announcements-page ${rootClassName}`}>
      <div className="announcements-page__content">
        <div className="announcements-page__header">
          <button type="button" className="announcements-page__back" onClick={() => navigateBack()}>
            <FiArrowLeft size={28} />
          </button>
          <h1 className="announcements-page__title">Объявления</h1>
        </div>

        <div className="announcements-page__list-block">
          <div className="announcements-page__tabs">
            <button
              type="button"
              className={`announcements-page__tab ${activeTab === 'feed' ? 'announcements-page__tab--active' : ''}`}
              onClick={() => setActiveTab('feed')}
            >
              Лента
            </button>
            <button
              type="button"
              className={`announcements-page__tab ${activeTab === 'created' ? 'announcements-page__tab--active' : ''}`}
              onClick={() => setActiveTab('created')}
            >
              Мои
            </button>
            <button
              type="button"
              className={`announcements-page__tab ${activeTab === 'responses' ? 'announcements-page__tab--active' : ''}`}
              onClick={() => setActiveTab('responses')}
            >
              Отклики
            </button>
          </div>

          {error && (
            <div style={{ padding: '8px 0 12px' }}>
              <p style={{ color: '#c00', fontSize: 14, margin: '0 0 8px' }}>{error}</p>
              <button
                type="button"
                className="announcements-page__empty-btn"
                onClick={() => void refetch()}
              >
                Повторить
              </button>
            </div>
          )}

          {showSkeleton ? (
            <div className="announcements-page__list">
              <AnnouncementsSkeleton />
            </div>
          ) : (
          <div className="announcements-page__list">
            {!error && activeTab === 'feed' && feed.length === 0 && (
              <div className="announcements-page__empty">
                <h3 className="announcements-page__empty-title">Объявлений пока нет</h3>
                <p className="announcements-page__empty-text">
                  Лента пустая — создай первое объявление или загляни позже, когда появятся новые.
                </p>
                <button
                  type="button"
                  className="announcements-page__empty-btn"
                  onClick={() => setShowCreateModal(true)}
                >
                  Создать объявление
                </button>
              </div>
            )}

            {!error &&
              activeTab === 'created' &&
              actualOwn.length === 0 &&
              archivedOwn.length === 0 && (
                <div className="announcements-page__empty">
                  <h3 className="announcements-page__empty-title">Ты ещё ничего не публиковал</h3>
                  <p className="announcements-page__empty-text">
                    Создай объявление — оно появится здесь, а отклики будут приходить прямо в карточку.
                  </p>
                  <button
                    type="button"
                    className="announcements-page__empty-btn"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Создать объявление
                  </button>
                </div>
              )}

            {!error && activeTab === 'responses' && responded.length === 0 && (
              <div className="announcements-page__empty">
                <h3 className="announcements-page__empty-title">Пока нет откликов</h3>
                <p className="announcements-page__empty-text">
                  Откликнись на объявления во вкладке «Лента» — они появятся здесь.
                </p>
                <button
                  type="button"
                  className="announcements-page__empty-btn"
                  onClick={() => setActiveTab('feed')}
                >
                  Смотреть ленту
                </button>
              </div>
            )}

            {activeTab === 'feed' &&
              feed.map((ann) => (
                <div
                  key={ann.id}
                  className="announcements-page__card"
                  onClick={() => openAnnouncement(ann)}
                >
                  <div className="announcements-page__card-title">{ann.title}</div>
                  <div className="announcements-page__card-description">{ann.description}</div>
                  <div className="announcements-page__card-author">
                    <UserAvatar
                      userId={ann.author.id}
                      photoUrl={ann.author.avatar}
                      size="xxs"
                      alt={ann.author.name}
                    />
                    <span>{ann.author.name}</span>
                  </div>
                </div>
              ))}

            {activeTab === 'created' && (
              <>
                {actualOwn.length > 0 && (
                  <div className="announcements-page__group">
                    <div className="announcements-page__group-title">АКТУАЛЬНЫЕ</div>
                    {actualOwn.map((ann) => {
                      const daysLeft = getDaysLeft(ann.createdAt, currentDate)
                      return (
                        <div
                          key={ann.id}
                          className="announcements-page__card announcements-page__card--own"
                          onClick={() => openAnnouncement(ann)}
                        >
                          <AnnouncementTimerBadge text={getDaysText(daysLeft)} />
                          <div className="announcements-page__card-title">{ann.title}</div>
                          <div className="announcements-page__card-description">{ann.description}</div>
                          <div className="announcements-page__card-actions">
                            <AnnouncementRespondents respondents={ann.respondents} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {archivedOwn.length > 0 && (
                  <div className="announcements-page__group">
                    <div className="announcements-page__group-title">АРХИВ</div>
                    {archivedOwn.map((ann) => (
                      <div
                        key={ann.id}
                        className="announcements-page__card announcements-page__card--own"
                        onClick={() => openAnnouncement(ann)}
                      >
                        <AnnouncementTimerBadge text="истекло" expired />
                        <div className="announcements-page__card-title">{ann.title}</div>
                        <div className="announcements-page__card-description">{ann.description}</div>
                        <div className="announcements-page__card-actions">
                          <AnnouncementRespondents respondents={ann.respondents} />
                        </div>
                        <div className="announcements-page__card-own-actions">
                          <button
                            type="button"
                            className="announcements-page__card-btn announcements-page__card-btn--secondary"
                            onClick={(e) => {
                              e.stopPropagation()
                              void republish(ann).catch((err) => {
                                setToast(toUserError(err, 'Не удалось опубликовать заново'))
                              })
                            }}
                          >
                            Опубликовать заново
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'responses' &&
              responded.map((ann) => (
                <div
                  key={ann.id}
                  className="announcements-page__card"
                  style={{ background: '#F6F6F6' }}
                  onClick={() => openAnnouncement(ann)}
                >
                  <div className="announcements-page__card-title">{ann.title}</div>
                  <div className="announcements-page__card-description">{ann.description}</div>
                  <div className="announcements-page__card-author">
                    <UserAvatar
                      userId={ann.author.id}
                      photoUrl={ann.author.avatar}
                      size="xxs"
                      alt={ann.author.name}
                    />
                    <span>{ann.author.name}</span>
                  </div>
                  <div className="announcements-page__card-own-actions">
                    <button
                      type="button"
                      className="announcements-page__card-btn announcements-page__card-btn--secondary"
                      onClick={(e) => {
                        e.stopPropagation()
                        openConfirm(
                          'Точно хочешь отозвать отклик?',
                          'Автор объявления не увидит твой отклик в списке активных',
                          'Отозвать',
                          'Уже не хочу',
                          () => {
                            void withdraw(ann.id).catch((err) => {
                              setToast(toUserError(err, 'Не удалось отозвать отклик'))
                            })
                          },
                        )
                      }}
                    >
                      Отозвать отклик
                    </button>
                  </div>
                </div>
              ))}
          </div>
          )}

          <div className="announcements-page__create-bar">
            <button
              type="button"
              className="announcements-page__create-btn"
              onClick={() => setShowCreateModal(true)}
            >
              <FiPlus size={20} /> Создать объявление
            </button>
          </div>
        </div>
      </div>

      {selectedAnnouncement && (
        <AnnouncementModal
          announcement={selectedAnnouncement}
          isOwn={Boolean(selectedAnnouncement.isOwn)}
          onClose={closeAnnouncement}
          onRespond={() =>
            // Пробрасываем ошибку в модалку: без этого «Отклик отправлен» покажется зря
            respond(selectedAnnouncement.id).catch((err) => {
              setToast(toUserError(err, 'Не удалось отправить отклик'))
              throw err
            })
          }
          onWithdraw={() => {
            void withdraw(selectedAnnouncement.id).catch((err) => {
              setToast(toUserError(err, 'Не удалось отозвать отклик'))
            })
            closeAnnouncement()
          }}
          onDelete={() => {
            void remove(selectedAnnouncement.id)
              .then(() => closeAnnouncement())
              .catch((err) => setToast(toUserError(err, 'Не удалось выполнить действие')))
          }}
          onEdit={(updated) => {
            void edit(updated, updated.title, updated.description)
              .then(() => closeAnnouncement())
              .catch((err) => setToast(toUserError(err, 'Не удалось выполнить действие')))
          }}
        />
      )}

      {showCreateModal && (
        <CreateAnnouncementModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={async (draft) => {
            try {
              await create(draft.title, draft.description)
              setShowCreateModal(false)
            } catch (err) {
              setToast(toUserError(err, 'Не удалось создать объявление'))
              throw err
            }
          }}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {showConfirm.open && (
        <ConfirmDialog
          title={showConfirm.title}
          subtitle={showConfirm.subtitle}
          confirmLabel={showConfirm.confirmLabel}
          cancelLabel={showConfirm.cancelLabel}
          onConfirm={() => {
            showConfirm.onConfirm()
            setShowConfirm({ ...showConfirm, open: false })
          }}
          onCancel={() => setShowConfirm({ ...showConfirm, open: false })}
        />
      )}
    </main>
  )
}
