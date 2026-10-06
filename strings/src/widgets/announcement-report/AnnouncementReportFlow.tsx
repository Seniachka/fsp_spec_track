import { useEffect, useRef, useState } from 'react'
import { FiX } from 'react-icons/fi'
import { useModal } from '../../app/providers/ModalContext'
import { blockUser, complainAboutPost } from '../../api'
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/ConfirmDialog'
import { useSheetDismiss } from '../../shared/lib/useSheetDismiss'
import { Toast } from '../../shared/ui/toast/Toast'
import { toUserError } from '../../shared/lib/userError'
import './announcement-report.css'

const REPORT_REASONS = [
  'Спам или мошенничество',
  'Оскорбления или травля',
  'Нарушение правил',
  'Раскрытие чужих данных',
  'Другое',
] as const

type Props = {
  postId: string
  authorId: string
  onClose: () => void
  onReported: () => void
  onHideAuthor: () => void
}

type Phase = 'menu' | 'report' | 'success'

export const AnnouncementReportFlow = ({
  postId,
  authorId,
  onClose,
  onReported,
  onHideAuthor,
}: Props) => {
  const { openModal, closeModal } = useModal()
  const [phase, setPhase] = useState<Phase>('menu')
  const [selected, setSelected] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [hideConfirm, setHideConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [hideBusy, setHideBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  const { closing, requestClose, tryClose, onAnimEnd } = useSheetDismiss(sheetRef, headerRef, {
    onClosed: onClose,
    ignoreSelector: '.ann-report__close',
    swipeThreshold: 60,
  })

  useEffect(() => {
    openModal()
    return () => closeModal()
  }, [openModal, closeModal])

  const handleSubmitReport = async () => {
    if (!selected || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await complainAboutPost(postId, { reason: selected, text: comment })
      setPhase('success')
      onReported()
    } catch (err) {
      setError(toUserError(err, 'Не удалось отправить жалобу'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleHideAuthor = async () => {
    if (hideBusy) return
    setHideBusy(true)
    setError(null)
    try {
      await blockUser(authorId)
      setHideConfirm(false)
      onHideAuthor()
      requestClose()
    } catch (err) {
      setError(toUserError(err, 'Не удалось скрыть автора'))
      setHideConfirm(false)
    } finally {
      setHideBusy(false)
    }
  }

  const sheetClass =
    phase === 'menu'
      ? 'ann-report ann-report--compact'
      : phase === 'success'
        ? 'ann-report ann-report--success'
        : 'ann-report'

  return (
    <>
      <div className="ann-report-overlay" onClick={tryClose}>
        <div
          ref={sheetRef}
          className={`${sheetClass} ${closing ? 'sheet-modal--exit' : 'sheet-modal--enter'}`}
          onClick={(e) => e.stopPropagation()}
          onAnimationEnd={onAnimEnd}
        >
          <div className="ann-report__handle-wrap" ref={headerRef}>
            <span className="ann-report__handle" />
            {phase !== 'menu' && (
              <button type="button" className="ann-report__close" onClick={tryClose} aria-label="Закрыть">
                <FiX size={22} />
              </button>
            )}
          </div>

          {phase === 'menu' && (
            <div className="ann-report__menu">
              <button
                type="button"
                className="ann-report__btn ann-report__btn--danger"
                onClick={() => setPhase('report')}
              >
                Пожаловаться
              </button>
              <button
                type="button"
                className="ann-report__btn ann-report__btn--secondary"
                onClick={() => setHideConfirm(true)}
              >
                Скрыть объявления автора
              </button>
            </div>
          )}

          {phase === 'report' && (
            <div className="ann-report__form">
              <h2 className="ann-report__title">Пожаловаться</h2>
              <p className="ann-report__subtitle">Выберите, почему хотите оставить жалобу</p>
              <ul className="ann-report__reasons">
                {REPORT_REASONS.map((reason) => {
                  const checked = selected === reason
                  return (
                    <li key={reason}>
                      <button
                        type="button"
                        className="ann-report__reason"
                        onClick={() => setSelected((prev) => (prev === reason ? null : reason))}
                        aria-pressed={checked}
                      >
                        <span
                          className={`ann-report__check${checked ? ' ann-report__check--on' : ''}`}
                          aria-hidden
                        >
                          {checked ? '✓' : null}
                        </span>
                        <span>{reason}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="ann-report__label">КОММЕНТАРИЙ (НЕОБЯЗАТЕЛЬНО)</p>
              <input
                className="ann-report__input"
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 500))}
                placeholder="Коротко опишите проблему"
              />
              <div className="ann-report__footer">
                <button
                  type="button"
                  className="ann-report__btn ann-report__btn--primary"
                  disabled={!selected || submitting}
                  onClick={() => void handleSubmitReport()}
                >
                  {submitting ? 'Отправляем…' : 'Отправить жалобу'}
                </button>
              </div>
            </div>
          )}

          {phase === 'success' && (
            <div className="ann-report__success">
              <div className="ann-report__success-icon" aria-hidden>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="#775AFF" strokeWidth="2" />
                  <path d="M12 7v7" stroke="#775AFF" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="17" r="1.2" fill="#775AFF" />
                </svg>
              </div>
              <h2 className="ann-report__success-title">Жалоба отправлена</h2>
              <p className="ann-report__success-text">
                Мы проверим объявление и примем меры при&nbsp;нарушении
              </p>
              <button type="button" className="ann-report__btn ann-report__btn--primary" onClick={requestClose}>
                Буду ждать
              </button>
            </div>
          )}
        </div>
      </div>

      {hideConfirm && (
        <ConfirmDialog
          title="Скрыть объявления автора?"
          subtitle="Ты больше не будешь видеть его посты в приложении"
          confirmLabel={hideBusy ? 'Скрываем…' : 'Скрыть'}
          cancelLabel="Отменить"
          onConfirm={() => void handleHideAuthor()}
          onCancel={() => {
            if (!hideBusy) setHideConfirm(false)
          }}
        />
      )}
      {error && <Toast message={error} onClose={() => setError(null)} />}
    </>
  )
}
