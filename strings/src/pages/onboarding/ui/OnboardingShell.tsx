import type { ReactNode } from 'react'
import ArrowBackIcon from '../../../assets/components/arrowBack'
import './onboarding.css'

type OnboardingShellProps = {
  title: string
  subtitle?: string
  progress: number
  onBack?: () => void
  children: ReactNode
  footer?: ReactNode
  headerExtra?: ReactNode
}

export const OnboardingShell = ({
  title,
  subtitle,
  progress,
  onBack,
  children,
  footer,
  headerExtra,
}: OnboardingShellProps) => (
  <main className="onboarding-page">
    <header className="onboarding-page__header">
      {onBack && (
        <button type="button" className="onboarding-page__back" onClick={onBack} aria-label="Назад">
          <ArrowBackIcon />
        </button>
      )}
      <h1 className="onboarding-page__title">{title}</h1>
      {subtitle && <p className="onboarding-page__subtitle">{subtitle}</p>}
      {headerExtra}
    </header>

    <div className="onboarding-page__card">
      <div
        className="onboarding-page__progress"
        role="progressbar"
        aria-valuenow={Math.min(100, Math.max(0, progress))}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="onboarding-page__progress-fill"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      <div className="onboarding-page__body">{children}</div>
      {footer && <div className="onboarding-page__footer">{footer}</div>}
    </div>
  </main>
)
