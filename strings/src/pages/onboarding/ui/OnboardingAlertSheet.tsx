import { Overlay } from '../../../shared/ui/overlay/Overlay'
import { Button } from '../../../shared/ui/button/Button'
import './onboarding.css'

type OnboardingAlertSheetProps = {
  title: string
  subtitle: string
  onClose: () => void
  confirmLabel?: string
}

export const OnboardingAlertSheet = ({
  title,
  subtitle,
  onClose,
  confirmLabel = 'Хорошо',
}: OnboardingAlertSheetProps) => (
  <Overlay onBackdropClick={onClose}>
    <div className="onboarding-alert" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
      <span className="onboarding-alert__handle" />
      <button type="button" className="onboarding-alert__close" onClick={onClose} aria-label="Закрыть">
        ×
      </button>
      <h2 className="onboarding-alert__title">{title}</h2>
      <p className="onboarding-alert__subtitle">{subtitle}</p>
      <Button className="onboarding-alert__btn" onClick={onClose}>
        {confirmLabel}
      </Button>
    </div>
  </Overlay>
)
