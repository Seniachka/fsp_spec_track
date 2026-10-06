import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Overlay } from '../overlay/Overlay'
import './confirm-dialog.css'

type ConfirmDialogProps = {
  title: string
  subtitle?: string
  confirmLabel: string
  cancelLabel: string
  /** danger — красная (выход), brand — фиолетовая (основное действие) */
  confirmTone?: 'danger' | 'brand'
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog = ({
  title,
  subtitle,
  confirmLabel,
  cancelLabel,
  confirmTone = 'danger',
  confirmDisabled,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setArmed(true), 5)
    return () => window.clearTimeout(t)
  }, [])

  return (
  createPortal(
    <Overlay centered elevated onBackdropClick={confirmDisabled ? undefined : onCancel}>
      <div className="confirm-dialog" onPointerDown={(e) => e.stopPropagation()}>
        <h3 className="confirm-dialog__title">{title}</h3>
        {subtitle && <p className="confirm-dialog__subtitle">{subtitle}</p>}
        <button
          type="button"
          className={`confirm-dialog__btn confirm-dialog__btn--${confirmTone}`}
          disabled={confirmDisabled || !armed}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          className="confirm-dialog__btn confirm-dialog__btn--secondary"
          disabled={confirmDisabled || !armed}
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
      </div>
    </Overlay>,
    document.body,
  )
  )
}
