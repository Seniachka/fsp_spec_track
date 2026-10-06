import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { FiArrowLeft } from 'react-icons/fi'
import { getEvent, listMyEventResponses } from '../../../api/Events'
import { formatEventDate } from '../../../shared/lib/dateUtils'
import { eventPath } from '../../../shared/lib/appLinks'
import { usePageSwipeRight } from '../../../shared/lib/usePageSwipeRight'
import { EventModal } from '../../../widgets/event-modal/EventModal'
import { Toast } from '../../../shared/ui/toast/Toast'
import { toUserError } from '../../../shared/lib/userError'
import { useMinLoading } from '../../../shared/lib/useMinLoading'
import { useEvents } from '../../afisha/lib/useEvents'
import {
  isEventNotPast,
  mapApiEventToUi,
  startOfToday,
  type Event,
} from '../../afisha/lib/mapEvent'
import './events-page.css'

type Tab = 'all' | 'attending'

const EventsSkeleton = () => (
  <div className="events-page__grid events-page__grid--skeleton" aria-hidden>
    {Array.from({ length: 4 }, (_, i) => (
      <div key={i} className="events-page__grid-card events-page__grid-card--skeleton">
        <div className="events-page__skeleton-block events-page__skeleton-block--image" />
        <div className="events-page__skeleton-block events-page__skeleton-block--title" />
        <div className="events-page__skeleton-block events-page__skeleton-block--date" />
      </div>
    ))}
  </div>
)

const groupEventsByDate = (events: Event[]) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const groups: { title: string; items: Event[] }[] = []
  const todayItems: Event[] = []
  const tomorrowItems: Event[] = []
  const laterItems: Event[] = []

  events.forEach((event) => {
    const start = new Date(event.dateStart)
    start.setHours(0, 0, 0, 0)
    const end = event.dateEnd ? new Date(event.dateEnd) : null
    if (end && !Number.isNaN(end.getTime())) end.setHours(0, 0, 0, 0)
    // Многодневное мероприятие идёт прямо сейчас — это «СЕГОДНЯ», а не «ПОЗЖЕ»
    const endTime = end && !Number.isNaN(end.getTime()) ? end.getTime() : start.getTime()

    if (start.getTime() <= today.getTime() && endTime >= today.getTime()) {
      todayItems.push(event)
    } else if (start.getTime() === tomorrow.getTime()) {
      tomorrowItems.push(event)
    } else {
      laterItems.push(event)
    }
  })

  if (todayItems.length) groups.push({ title: 'СЕГОДНЯ', items: todayItems })
  if (tomorrowItems.length) groups.push({ title: 'ЗАВТРА', items: tomorrowItems })
  if (laterItems.length) groups.push({ title: 'ПОЗЖЕ', items: laterItems })

  return groups
}

export const EventsPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { eventId } = useParams<{ eventId?: string }>()
  const { events, loading, error, refetch, toggleAttendance } = useEvents()
  const showSkeleton = useMinLoading(loading)
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [fetchedEvent, setFetchedEvent] = useState<Event | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const isCoveredByProfile = /^\/afisha\/events\/u\//.test(location.pathname)

  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime(),
      ),
    [events],
  )

  const filteredEvents = useMemo(() => {
    if (activeTab === 'attending') {
      return sortedEvents.filter((e) => e.isAttending)
    }
    return sortedEvents
  }, [activeTab, sortedEvents])

  const groupedEvents = useMemo(() => {
    if (activeTab === 'attending') {
      return groupEventsByDate(filteredEvents)
    }
    return null
  }, [activeTab, filteredEvents])

  const listMatch = useMemo(
    () => (eventId ? events.find((e) => e.id === eventId) ?? null : null),
    [eventId, events],
  )

  const selectedEvent = eventId ? listMatch ?? fetchedEvent : null

  const { rootRef, rootClassName, navigateBack } = usePageSwipeRight({
    backTo: '/afisha',
    edgeSwipeEnabled: !isCoveredByProfile && !selectedEvent,
  })

  useEffect(() => {
    if (!eventId) {
      setFetchedEvent(null)
      return
    }
    if (listMatch) {
      setFetchedEvent(null)
      return
    }
    if (loading) return

    let cancelled = false
    void (async () => {
      try {
        const [apiEvent, attending] = await Promise.all([
          getEvent(eventId),
          listMyEventResponses().catch(() => []),
        ])
        if (cancelled) return
        const attendingIds = new Set(attending.map((e) => e.id))
        const mapped = mapApiEventToUi(apiEvent, attendingIds)
        // Битая дата или мероприятие уже прошло — в списке его тоже нет,
        // показываем просто страницу мероприятий
        if (!isEventNotPast(mapped, startOfToday())) {
          setFetchedEvent(null)
          navigate('/afisha/events', { replace: true })
          return
        }
        setFetchedEvent(mapped)
      } catch {
        if (cancelled) return
        // Удалено / срок истёк / битая ссылка — просто открываем страницу мероприятий
        setFetchedEvent(null)
        navigate('/afisha/events', { replace: true })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [eventId, listMatch, loading, navigate])

  const openEvent = (event: Event) => {
    navigate(eventPath(event.id))
  }

  const closeEvent = () => {
    navigate('/afisha/events', { replace: true })
  }

  const handleToggleAttendance = async (id: string) => {
    try {
      const fallback = selectedEvent?.id === id ? selectedEvent.isAttending : undefined
      const result = await toggleAttendance(id, fallback)
      if (!result.ok) return
      setFetchedEvent((prev) =>
        prev && prev.id === id ? { ...prev, isAttending: result.isAttending } : prev,
      )
    } catch (err) {
      setToast(toUserError(err, 'Не удалось обновить статус'))
    }
  }

  return (
    <main ref={rootRef} className={`events-page ${rootClassName}`}>
      <div className="events-page__content">
        <div className="events-page__header">
          <button type="button" className="events-page__back" onClick={() => navigateBack()}>
            <FiArrowLeft size={28} />
          </button>
          <h1 className="events-page__title">Мероприятия</h1>
        </div>

        <div className="events-page__list-block">
          <div className="events-page__tabs">
            <button
              type="button"
              className={`events-page__tab ${activeTab === 'all' ? 'events-page__tab--active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              Все
            </button>
            <div className="events-page__tab-line" />
            <button
              type="button"
              className={`events-page__tab ${activeTab === 'attending' ? 'events-page__tab--active' : ''}`}
              onClick={() => setActiveTab('attending')}
            >
              Я иду
            </button>
          </div>

          {error && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ color: '#c00', fontSize: 14, margin: '0 0 8px' }}>{error}</p>
              <button
                type="button"
                onClick={() => void refetch()}
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
          {showSkeleton ? (
            <EventsSkeleton />
          ) : (
          /* key: пересоздаём DOM-узел скроллера при смене вкладки и при входе/выходе
             из пустого состояния. Обход бага отрисовки iOS 26 (WebKit #297779):
             in-place замена детей живого композитного скроллера оставляет сталые
             тайлы и hit-test-регионы — кнопка пустого состояния рисовалась наполовину,
             тап по ней срабатывал не по всей площади (репро: Все → Я иду). Свежий
             узел = свежий слой, красится целиком. Не убирать key при рефакторинге. */
          <div
            className="events-page__grid"
            key={`${activeTab}:${!error && filteredEvents.length === 0 ? 'empty' : 'list'}`}
          >
            {!error && filteredEvents.length === 0 ? (
              <div className="events-page__empty">
                {activeTab === 'attending' ? (
                  <>
                    <h3 className="events-page__empty-title">Пока никуда не идёшь</h3>
                    <p className="events-page__empty-text">
                      Отметь интересные мероприятия во вкладке «Все» — они появятся здесь.
                    </p>
                    <button
                      type="button"
                      className="events-page__empty-btn"
                      onClick={() => setActiveTab('all')}
                    >
                      Смотреть все
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className="events-page__empty-title">Мероприятий пока нет</h3>
                    <p className="events-page__empty-text">
                      Ждём анонсов от университета. Это не ошибка — просто сейчас нечего показать.
                      Загляни позже или нажми кнопку ниже, чтобы проверить снова.
                    </p>
                    <button
                      type="button"
                      className="events-page__empty-btn"
                      onClick={() => void refetch()}
                    >
                      Проверить снова
                    </button>
                  </>
                )}
              </div>
            ) : activeTab === 'all' ? (
              filteredEvents.map((event) => (
                <div
                  key={event.id}
                  className="events-page__grid-card"
                  onClick={() => openEvent(event)}
                >
                  <div className="events-page__grid-card-image">
                    {event.image ? (
                      <img src={event.image} alt={event.title} referrerPolicy="no-referrer" />
                    ) : (
                      <div className="events-page__grid-card-image-placeholder" />
                    )}
                  </div>
                  <h4 className="events-page__grid-card-title">{event.title}</h4>
                  <p className="events-page__grid-card-date">
                    {formatEventDate(event.dateStart, event.dateEnd)}
                  </p>
                </div>
              ))
            ) : (
              groupedEvents?.map((group) => (
                <div key={group.title} className="events-page__group">
                  <h3 className="events-page__group-title">{group.title}</h3>
                  <div
                    className="events-page__grid"
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}
                  >
                    {group.items.map((event) => (
                      <div
                        key={event.id}
                        className="events-page__grid-card"
                        onClick={() => openEvent(event)}
                      >
                        <div className="events-page__grid-card-image">
                          {event.image ? (
                            <img src={event.image} alt={event.title} referrerPolicy="no-referrer" />
                          ) : (
                            <div className="events-page__grid-card-image-placeholder" />
                          )}
                        </div>
                        <h4 className="events-page__grid-card-title">{event.title}</h4>
                        <p className="events-page__grid-card-date">
                          {formatEventDate(event.dateStart, event.dateEnd)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
          )}
        </div>
      </div>

      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={closeEvent}
          onToggleAttendance={handleToggleAttendance}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </main>
  )
}
