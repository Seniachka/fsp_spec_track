import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiChevronRight, FiMap, FiPlus } from 'react-icons/fi'
import { formatEventDate } from '../../../shared/lib/dateUtils'
import { announcementPath, eventPath } from '../../../shared/lib/appLinks'
import { useMinLoading } from '../../../shared/lib/useMinLoading'
import { CreateAnnouncementModal } from '../../../widgets/create-announcement-modal/CreateAnnouncementModal'
import { useEvents } from '../lib/useEvents'
import { useAnnouncements } from '../lib/useAnnouncements'
import './afisha-page.css'
import { UserAvatar } from '../../../shared/ui/user-avatar/UserAvatar'
import { Toast } from '../../../shared/ui/toast/Toast'
import { toUserError } from '../../../shared/lib/userError'

const AfishaEventsSkeleton = () => (
  <div className="afisha-page__scroll" aria-hidden>
    {Array.from({ length: 2 }, (_, i) => (
      <div key={i} className="afisha-page__event-card afisha-page__event-card--skeleton">
        <div className="afisha-page__skeleton-block afisha-page__skeleton-block--event-image" />
        <div className="afisha-page__event-card-body">
          <div className="afisha-page__skeleton-block afisha-page__skeleton-block--event-title" />
          <div className="afisha-page__skeleton-block afisha-page__skeleton-block--event-date" />
        </div>
      </div>
    ))}
  </div>
)

const AfishaAnnouncementsSkeleton = () => (
  <div className="afisha-page__scroll" aria-hidden>
    {Array.from({ length: 2 }, (_, i) => (
      <div
        key={i}
        className="afisha-page__announcement-card afisha-page__announcement-card--skeleton"
      >
        <div className="afisha-page__announcement-card-body">
          <div className="afisha-page__skeleton-block afisha-page__skeleton-block--ann-title" />
          <div className="afisha-page__skeleton-block afisha-page__skeleton-block--ann-desc" />
          <div className="afisha-page__skeleton-block afisha-page__skeleton-block--ann-desc-short" />
        </div>
        <div className="afisha-page__announcement-card-author">
          <div className="afisha-page__skeleton-block afisha-page__skeleton-block--ann-avatar" />
          <div className="afisha-page__skeleton-block afisha-page__skeleton-block--ann-name" />
        </div>
      </div>
    ))}
  </div>
)

export const AfishaPage = () => {
  const navigate = useNavigate()
  const { events, loading: eventsLoadingRaw, error: eventsError, refetch: refetchEvents } = useEvents()
  const {
    feed,
    loading: postsLoadingRaw,
    error: postsError,
    create,
    refetch: refetchPosts,
  } = useAnnouncements()
  const eventsLoading = useMinLoading(eventsLoadingRaw)
  const postsLoading = useMinLoading(postsLoadingRaw)

  const [showCreateAnnouncement, setShowCreateAnnouncement] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const displayEvents = events.slice(0, 2)
  const displayAnnouncements = feed.slice(0, 2)

  return (
    <main className="afisha-page">
      <div className="afisha-page__content">
        <div className="afisha-page__header">
          <h1 className="afisha-page__title">Афиша</h1>
          <button
            type="button"
            className="afisha-page__map-btn"
            aria-label="Карта кампуса"
            onClick={() => navigate('/afisha/map')}
          >
            <FiMap size={22} />
          </button>
        </div>

        <div className="afisha-page__list-block">
          <div className="page-list-block__scroll afisha-page__scroll-area">
          {(eventsError || postsError) && (
            <div style={{ padding: '0 4px 12px' }}>
              <p style={{ color: '#c00', fontSize: 14, margin: '0 0 8px' }}>
                {eventsError || postsError}
              </p>
              <button
                type="button"
                onClick={() => {
                  void refetchEvents()
                  void refetchPosts()
                }}
                style={{
                  border: 'none',
                  borderRadius: 12,
                  padding: '10px 16px',
                  background: '#775AFF',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Повторить
              </button>
            </div>
          )}

          <section className="afisha-page__section">
            <div className="afisha-page__section-header">
              <button
                type="button"
                className="afisha-page__section-title-btn"
                onClick={() => navigate('/afisha/events')}
              >
                Мероприятия <FiChevronRight />
              </button>
            </div>
            <div className="afisha-page__scroll-wrapper">
              {eventsLoading ? (
                <AfishaEventsSkeleton />
              ) : !eventsError && displayEvents.length === 0 ? (
                <div className="afisha-page__events-empty">
                  <p className="afisha-page__events-empty-title">Мероприятий пока нет</p>
                  <p className="afisha-page__events-empty-text">
                    Ждём анонсов от университета. Загляни позже — новые события появятся здесь.
                  </p>
                  <button
                    type="button"
                    className="afisha-page__events-empty-btn"
                    onClick={() => void refetchEvents()}
                  >
                    Проверить снова
                  </button>
                </div>
              ) : (
                <div className="afisha-page__scroll">
                  {displayEvents.map((event) => (
                    <div
                      key={event.id}
                      className="afisha-page__event-card"
                      onClick={() => navigate(eventPath(event.id))}
                    >
                      <div className="afisha-page__event-card-image">
                        {event.image ? (
                          <img src={event.image} alt={event.title} referrerPolicy="no-referrer" />
                        ) : (
                          <div className="afisha-page__event-card-image-placeholder" />
                        )}
                      </div>
                      <div className="afisha-page__event-card-body">
                        <h3 className="afisha-page__event-card-title">{event.title}</h3>
                        <p className="afisha-page__event-card-date">
                          {formatEventDate(event.dateStart, event.dateEnd)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {displayEvents.length > 0 && (
                    <button
                      type="button"
                      className="afisha-page__view-all"
                      onClick={() => navigate('/afisha/events')}
                    >
                      <div className="afisha-page__view-all-circle">
                        <FiChevronRight size={24} />
                      </div>
                      <span className="afisha-page__view-all-text">Смотреть все</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="afisha-page__section">
            <div className="afisha-page__section-header">
              <button
                type="button"
                className="afisha-page__section-title-btn"
                onClick={() => navigate('/afisha/announcements')}
              >
                Объявления <FiChevronRight />
              </button>
            </div>
            <div className="afisha-page__scroll-wrapper">
              {postsLoading ? (
                <AfishaAnnouncementsSkeleton />
              ) : !postsError && displayAnnouncements.length === 0 ? (
                <div className="afisha-page__events-empty">
                  <p className="afisha-page__events-empty-title">Объявлений пока нет</p>
                  <p className="afisha-page__events-empty-text">
                    Создай первое или загляни позже — новые появятся здесь.
                  </p>
                  <button
                    type="button"
                    className="afisha-page__events-empty-btn"
                    onClick={() => setShowCreateAnnouncement(true)}
                  >
                    Создать объявление
                  </button>
                </div>
              ) : (
                <div className="afisha-page__scroll">
                  {displayAnnouncements.map((ann) => (
                    <div
                      key={ann.id}
                      className="afisha-page__announcement-card"
                      onClick={() => navigate(announcementPath(ann.id))}
                    >
                      <div className="afisha-page__announcement-card-body">
                        <h4 className="afisha-page__announcement-card-title">{ann.title}</h4>
                        <p className="afisha-page__announcement-card-description">{ann.description}</p>
                      </div>
                      <div className="afisha-page__announcement-card-author">
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
                  {displayAnnouncements.length > 0 && (
                    <button
                      type="button"
                      className="afisha-page__view-all"
                      onClick={() => navigate('/afisha/announcements')}
                    >
                      <div className="afisha-page__view-all-circle">
                        <FiChevronRight size={24} />
                      </div>
                      <span className="afisha-page__view-all-text">Смотреть все</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              className="afisha-page__create-announcement"
              onClick={() => setShowCreateAnnouncement(true)}
            >
              <FiPlus size={20} /> Создать объявление
            </button>
          </section>
          </div>
        </div>
      </div>

      {showCreateAnnouncement && (
        <CreateAnnouncementModal
          onClose={() => setShowCreateAnnouncement(false)}
          onSuccess={async (draft) => {
            try {
              await create(draft.title, draft.description)
              setShowCreateAnnouncement(false)
            } catch (err) {
              setToast(toUserError(err, 'Не удалось создать объявление'))
              throw err
            }
          }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </main>
  )
}
