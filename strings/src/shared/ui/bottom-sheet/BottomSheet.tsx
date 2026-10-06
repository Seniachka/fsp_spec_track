import { useEffect, useRef, type ReactNode } from 'react'
import { FiX } from 'react-icons/fi'
import { Overlay } from '../overlay/Overlay'
import { useSheetDismiss } from '../../lib/useSheetDismiss'
import { useModal } from '../../../app/providers/ModalContext'
import './bottom-sheet.css'

type BottomSheetProps = {
  /** Заголовок в шапке (можно не передавать) */
  title?: string
  subtitle?: string
  onClose: () => void
  /**
   * Если вернуть false — закрытие отменяется (например, dirty-confirm).
   * По умолчанию закрываем всегда.
   */
  canClose?: () => boolean
  children: ReactNode
  showBack?: boolean
  onBack?: () => void
  /** Крестик справа — по умолчанию включён */
  showClose?: boolean
}

export const BottomSheet = ({
  title,
  subtitle,
  onClose,
  canClose,
  children,
  showBack,
  onBack,
  showClose = true,
}: BottomSheetProps) => {
  const sheetRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const { openModal, closeModal } = useModal()
  const canCloseRef = useRef(canClose)
  canCloseRef.current = canClose

  const { closing, tryClose, onAnimEnd } = useSheetDismiss(sheetRef, headerRef, {
    onClosed: onClose,
    canClose: () => (canCloseRef.current ? canCloseRef.current() : true),
    ignoreSelector: '.bottom-sheet__close, .bottom-sheet__back',
  })

  useEffect(() => {
    openModal()
    return () => closeModal()
  }, [openModal, closeModal])

  const hasTitleBlock = Boolean(title || subtitle)

  return (
    <Overlay onBackdropClick={tryClose}>
      <div
        ref={sheetRef}
        className={`bottom-sheet ${closing ? 'sheet-modal--exit' : 'sheet-modal--enter'}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={onAnimEnd}
      >
        <div className="bottom-sheet__header" ref={headerRef}>
          <span className="bottom-sheet__drag-handle" aria-hidden />
          {showBack ? (
            <button
              type="button"
              className="bottom-sheet__back"
              onClick={onBack}
              aria-label="Назад"
            >
              ←
            </button>
          ) : null}
          {hasTitleBlock ? (
            <div className="bottom-sheet__heading">
              {title ? <h2 className="bottom-sheet__title">{title}</h2> : null}
              {subtitle ? <p className="bottom-sheet__subtitle">{subtitle}</p> : null}
            </div>
          ) : (
            <span className="bottom-sheet__heading-spacer" />
          )}
          {showClose ? (
            <button
              type="button"
              className="bottom-sheet__close"
              onClick={tryClose}
              aria-label="Закрыть"
            >
              <FiX size={22} strokeWidth={1.5} />
            </button>
          ) : null}
        </div>
        <div className="bottom-sheet__body">{children}</div>
      </div>
    </Overlay>
  )
}
