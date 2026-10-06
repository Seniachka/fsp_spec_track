import { useRef, useState, useEffect } from 'react'
import { FiX, FiChevronRight, FiHelpCircle } from 'react-icons/fi'
import { useModal } from '../../app/providers/ModalContext'
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/ConfirmDialog'
import { useSheetDismiss } from '../../shared/lib/useSheetDismiss'
import {
  containsProhibitedContent,
  PROHIBITED_CONTENT_MESSAGE,
} from '../../shared/lib/contentPolicy'
import './create-announcement-modal.css'

interface CreateAnnouncementModalProps {
  onClose: () => void
  onSuccess: (announcement: { title: string; description: string }) => void | Promise<void>
}

export const CreateAnnouncementModal = ({ onClose, onSuccess }: CreateAnnouncementModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const { openModal, closeModal } = useModal()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [showRules, setShowRules] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saving, setSaving] = useState(false)
  const [policyError, setPolicyError] = useState<string | null>(null)

  const hasChangesRef = useRef(false)
  const showRulesRef = useRef(false)
  hasChangesRef.current = hasChanges
  showRulesRef.current = showRules

  const { closing, requestClose, tryClose, onAnimEnd } = useSheetDismiss(modalRef, headerRef, {
    onClosed: onClose,
    canClose: () => {
      if (showRulesRef.current) {
        setShowRules(false)
        return false
      }
      if (hasChangesRef.current) {
        setShowExitConfirm(true)
        return false
      }
      return true
    },
    ignoreSelector: '.create-announcement-modal__close',
  })

  useEffect(() => {
    openModal()
    return () => closeModal()
  }, [openModal, closeModal])

  useEffect(() => {
    setHasChanges(title.trim() !== '' || description.trim() !== '')
  }, [title, description])

  const canSubmit = title.trim() !== '' && description.trim() !== ''

  const handleSubmit = async () => {
    if (!canSubmit) return
    const nextTitle = title.trim().slice(0, 63)
    const nextDescription = description.trim().slice(0, 300)
    if (containsProhibitedContent(nextTitle) || containsProhibitedContent(nextDescription)) {
      setPolicyError(PROHIBITED_CONTENT_MESSAGE)
      return
    }
    setPolicyError(null)
    setSaving(true)
    try {
      await onSuccess({
        title: nextTitle,
        description: nextDescription,
      })
      onClose()
    } catch {
      // ошибку показывает родитель
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="create-announcement-modal-overlay" onClick={tryClose}>
      <div
        className={`create-announcement-modal ${closing ? 'sheet-modal--exit' : 'sheet-modal--enter'}`}
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={onAnimEnd}
      >
        <div className="create-announcement-modal__header" ref={headerRef}>
          <span className="create-announcement-modal__drag-handle" />
          <h2 className="create-announcement-modal__title">Новое объявление</h2>
          <button type="button" className="create-announcement-modal__close" onClick={tryClose}>
            <FiX size={24} strokeWidth={1.5} />
          </button>
        </div>

        <div className="create-announcement-modal__body">
          <input
            type="text"
            placeholder="Заголовок"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setPolicyError(null)
            }}
            className="create-announcement-modal__input"
            maxLength={63}
          />
          <textarea
            placeholder="Описание"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              setPolicyError(null)
            }}
            className="create-announcement-modal__textarea"
            maxLength={300}
            rows={3}
          />
          <div className="create-announcement-modal__counter">{description.length}/300</div>

          {policyError ? (
            <p className="create-announcement-modal__hint" role="alert">
              {policyError}
            </p>
          ) : null}

          <button
            type="button"
            className="create-announcement-modal__rules-btn"
            onClick={() => setShowRules(true)}
          >
            <FiHelpCircle size={20} strokeWidth={1.5} color="#775AFF" />
            <span>Правила публикации</span>
            <FiChevronRight size={20} color="#775AFF" />
          </button>
        </div>

        <div className="create-announcement-modal__actions">
          <button
            type="button"
            className="create-announcement-modal__btn create-announcement-modal__btn--primary"
            onClick={() => void handleSubmit()}
            disabled={saving || !canSubmit}
          >
            {saving ? 'Публикуем…' : 'Опубликовать'}
          </button>
        </div>
      </div>

      {showRules && (
        <div
          className="create-announcement-modal-overlay"
          onClick={(e) => {
            e.stopPropagation()
            setShowRules(false)
          }}
        >
          <div
            className="create-announcement-modal create-announcement-modal--compact"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="create-announcement-modal__header">
              <span className="create-announcement-modal__drag-handle" />
              <h2 className="create-announcement-modal__title">Правила публикации</h2>
              <button
                type="button"
                className="create-announcement-modal__close"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowRules(false)
                }}
              >
                <FiX size={24} strokeWidth={1.5} />
              </button>
            </div>
            <div className="create-announcement-modal__body">
              <p className="create-announcement-modal__rules-text">
                Публикуйте объявления уважительно и по делу: соблюдайте нормы общения, не оскорбляйте
                других, не размещайте спам, мошеннические предложения, запрещённый или чужой контент.
                Объявления, нарушающие правила сообщества, могут быть удалены модератором.
              </p>
            </div>
          </div>
        </div>
      )}

      {showExitConfirm && (
        <ConfirmDialog
          title="Точно хочешь выйти?"
          subtitle="Внесённая информация не сохранится"
          confirmLabel="Выйти"
          cancelLabel="Уже не хочу"
          onConfirm={() => {
            setShowExitConfirm(false)
            requestClose()
          }}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}
    </div>
  )
}
