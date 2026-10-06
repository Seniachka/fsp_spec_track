import { useRef, useEffect, useCallback, useState } from 'react'
import { FiCalendar, FiMapPin, FiLink, FiX } from 'react-icons/fi'
import type { Event } from '../../pages/afisha/lib/mapEvent'
import { formatEventDate } from '../../shared/lib/dateUtils'
import { eventUrl } from '../../shared/lib/appLinks'
import { useModal } from '../../app/providers/ModalContext'
import { useSheetDismiss } from '../../shared/lib/useSheetDismiss'
import './event-modal.css'

interface EventModalProps {
  event: Event
  onClose: () => void
  onToggleAttendance: (eventId: string) => void | Promise<void>
}

export const EventModal = ({ event, onClose, onToggleAttendance }: EventModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const { openModal, closeModal } = useModal()
  const [attendanceBusy, setAttendanceBusy] = useState(false)

  const { closing, tryClose, onAnimEnd } = useSheetDismiss(modalRef, headerRef, {
    onClosed: onClose,
    ignoreSelector: '.event-modal__close',
  })

  useEffect(() => {
    openModal()
    return () => closeModal()
  }, [openModal, closeModal])

  const handleShare = useCallback(async () => {
    const url = eventUrl(event.id)
    const shareData = {
      title: event.title,
      text: `Приглашаю на мероприятие: ${event.title}`,
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
  }, [event.id, event.title])

  const handleToggle = async () => {
    if (attendanceBusy) return
    setAttendanceBusy(true)
    try {
      await onToggleAttendance(event.id)
    } finally {
      setAttendanceBusy(false)
    }
  }

  return (
    <div className="event-modal-overlay" onClick={tryClose}>
      <div
        className={`event-modal ${closing ? 'sheet-modal--exit' : 'sheet-modal--enter'}`}
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={onAnimEnd}
      >
        <div className="event-modal__header" ref={headerRef}>
          <span className="event-modal__drag-handle" />
          <button type="button" className="event-modal__close" onClick={tryClose}>
            <FiX size={24} strokeWidth={1.5} />
          </button>
        </div>

        <div className="event-modal__body">
          <div className="event-modal__image">
            {event.image ? (
              <img src={event.image} alt={event.title} referrerPolicy="no-referrer" />
            ) : (
              <div className="event-modal__image-placeholder" aria-hidden />
            )}
          </div>

          <div className="event-modal__tags">
            {event.isAttending && (
              <span className="event-modal__tag event-modal__tag--attending">Я иду</span>
            )}
            <span className="event-modal__tag">
              {event.format === 'online' ? 'Онлайн' : event.format === 'offline' ? 'Офлайн' : 'Гибрид'}
            </span>
          </div>

          <h2 className="event-modal__title">{event.title}</h2>

          <div className="event-modal__info-row">
            <FiCalendar strokeWidth={1.5} />
            <span>{formatEventDate(event.dateStart, event.dateEnd)}</span>
          </div>
          <div className="event-modal__info-row">
            <FiMapPin strokeWidth={1.5} />
            <span>{event.location || 'Москва, ул. Гашека, д. 7, стр. 1'}</span>
          </div>
          <div className="event-modal__info-row">
            <FiLink strokeWidth={1.5} />
            {event.registrationLink ? (
              <a href={event.registrationLink} target="_blank" rel="noopener noreferrer">
                Регистрация
              </a>
            ) : (
              <span>Регистрация</span>
            )}
          </div>

          {event.description?.trim() ? (
            <p className="event-modal__description">{event.description}</p>
          ) : null}
        </div>

        <div className="event-modal__actions">
          {!event.isAttending && (
            <button
              type="button"
              className="event-modal__btn event-modal__btn--primary"
              onClick={() => void handleToggle()}
              disabled={attendanceBusy}
            >
              Я иду
            </button>
          )}
          {event.isAttending && (
            <button
              type="button"
              className="event-modal__btn event-modal__btn--secondary"
              onClick={() => void handleToggle()}
              disabled={attendanceBusy}
            >
              Не пойду
            </button>
          )}
          <button type="button" className="event-modal__btn event-modal__btn--secondary" onClick={() => void handleShare()}>
            Поделиться
          </button>
        </div>
      </div>
    </div>
  )
}
