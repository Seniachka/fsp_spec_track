import type { MouseEvent, ReactNode } from 'react'
import CheckIcon from '../../../assets/components/check'
import { Overlay } from '../../../shared/ui/overlay/Overlay'
import { Button } from '../../../shared/ui/button/Button'
import type { LegalDocId } from '../../legal/model/legalDocuments'
import './formalities-sheet.css'

type FormalitiesSheetProps = {
  acceptedTerms: boolean
  acceptedPrivacy: boolean
  onAcceptedTermsChange: (value: boolean) => void
  onAcceptedPrivacyChange: (value: boolean) => void
  onOpenDocument: (id: LegalDocId) => void
  onContinue: () => void
  onClose: () => void
}

const ConsentLink = ({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}) => (
  <a
    href="#"
    className="formalities-sheet__link"
    onClick={(e: MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault()
      e.stopPropagation()
      onClick()
    }}
  >
    {children}
  </a>
)

export const FormalitiesSheet = ({
  acceptedTerms,
  acceptedPrivacy,
  onAcceptedTermsChange,
  onAcceptedPrivacyChange,
  onOpenDocument,
  onContinue,
  onClose,
}: FormalitiesSheetProps) => {
  const canContinue = acceptedTerms && acceptedPrivacy

  return (
    <Overlay onBackdropClick={onClose}>
      <div
        className="formalities-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-labelledby="formalities-sheet-title"
      >
        <span className="formalities-sheet__handle" />
        <button type="button" className="formalities-sheet__close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>

        <h2 id="formalities-sheet-title" className="formalities-sheet__title">
          Формальности
        </h2>
        <p className="formalities-sheet__subtitle">Ознакомься с документами и дай согласие</p>

        <div className="formalities-sheet__list">
          <div className="formalities-sheet__row">
            <button
              type="button"
              className={`formalities-sheet__checkbox${acceptedTerms ? ' formalities-sheet__checkbox--checked' : ''}`}
              aria-pressed={acceptedTerms}
              aria-label="Принимаю Пользовательское соглашение и Правила сообщества"
              onClick={() => onAcceptedTermsChange(!acceptedTerms)}
            >
              {acceptedTerms ? <CheckIcon className="formalities-sheet__check-icon" aria-hidden /> : null}
            </button>
            <p className="formalities-sheet__text">
              Принимаю <ConsentLink onClick={() => onOpenDocument('terms')}>Пользовательское соглашение</ConsentLink> и{' '}
              <ConsentLink onClick={() => onOpenDocument('terms')}>Правила сообщества</ConsentLink>
            </p>
          </div>

          <div className="formalities-sheet__row">
            <button
              type="button"
              className={`formalities-sheet__checkbox${acceptedPrivacy ? ' formalities-sheet__checkbox--checked' : ''}`}
              aria-pressed={acceptedPrivacy}
              aria-label="Даю согласие на обработку персональных данных"
              onClick={() => onAcceptedPrivacyChange(!acceptedPrivacy)}
            >
              {acceptedPrivacy ? <CheckIcon className="formalities-sheet__check-icon" aria-hidden /> : null}
            </button>
            <p className="formalities-sheet__text">
              Даю{' '}
              <ConsentLink onClick={() => onOpenDocument('consent')}>
                согласие на обработку персональных данных
              </ConsentLink>
              , подтверждаю, что мне исполнилось 16 лет, и ознакомился(-ась) с{' '}
              <ConsentLink onClick={() => onOpenDocument('privacy')}>Политикой конфиденциальности</ConsentLink>
            </p>
          </div>
        </div>

        <Button className="formalities-sheet__btn" disabled={!canContinue} onClick={onContinue}>
          Принять и продолжить
        </Button>
      </div>
    </Overlay>
  )
}
