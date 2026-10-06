const ONBOARDING_COMPLETED_KEY = 'onboarding_completed'

export const isOnboardingCompleted = (): boolean =>
  localStorage.getItem(ONBOARDING_COMPLETED_KEY) === '1'

export const setOnboardingCompleted = (): void => {
  localStorage.setItem(ONBOARDING_COMPLETED_KEY, '1')
}

export const clearOnboardingCompleted = (): void => {
  localStorage.removeItem(ONBOARDING_COMPLETED_KEY)
}
