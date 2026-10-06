export type AuthStepResult =
  | {
      type: 'next'
      activePage: string
      loginAction: string
      phoneNumber?: string | null
      errorMessage?: string | null
    }
  | {
      type: 'redirect'
      callbackUrl: string
    }
  | {
      type: 'error'
      message: string
    }

const LOGIN_ACTION_KEY = 'urls.loginAction'
const ACTIVE_PAGE_KEY = 'activePage'
const PHONE_NUMBER_KEY = 'currentState.phoneNumber'
const ERROR_MESSAGE_KEY = 'systemMessage.content'
const ERROR_LEVEL_KEY = 'systemMessage.level'

const KEYCLOAK_ERROR_TRANSLATIONS: Record<string, string> = {
  phoneTokenCodeDoesNotMatch: 'Неверный код',
  phoneTokenCodeExpired: 'Код истёк — запроси новый',
  invalidUserMessage: 'Неверный логин или пароль',
  invalidPasswordMessage: 'Неверный пароль',
  accountTemporarilyDisabledMessage: 'Аккаунт временно заблокирован',
  userNotFoundMessage: 'Неверный логин или пароль',
  accountDisabledMessage: 'Аккаунт отключён',
  accountNotLinkedMessage: 'Аккаунт не привязан',
  phoneTokenSendTooOften: 'Подожди немного перед повторной отправкой',
  phoneTokenSendLimit: 'Слишком много попыток. Начни вход заново',
}

const NON_ERROR_LEVELS = new Set(['success', 'info'])

/**
 * Extracts a JavaScript string value from HTML like:
 * `window.authConfiguration.urls.loginAction = "https://...";`
 * Returns the last occurrence (later script overrides take precedence).
 */
export const extractJsStringValue = (html: string, key: string): string | null => {
  const pattern = new RegExp(`${escapeRegExp(key)}\\s*=\\s*(['"])(.*?)\\1`, 'g')
  let last: string | null = null
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) !== null) {
    last = match[2] ?? null
  }
  return last
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Yandex Smart Captcha interstitial served in front of Keycloak. */
export const isYandexCaptchaHtml = (html: string): boolean =>
  /checkcaptcha|smart-captcha|Подтвердите, что запросы отправляли вы/i.test(html)

const decodeJsString = (value: string): string =>
  value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()

const translateKeycloakMessage = (errorCode: string, errorLevel: string | null): string | null => {
  const code = decodeJsString(errorCode)
  const level = errorLevel ? decodeJsString(errorLevel).toLowerCase() : null
  if (level && NON_ERROR_LEVELS.has(level)) return null
  if (!code) return null
  return KEYCLOAK_ERROR_TRANSLATIONS[code] ?? (/^[a-zA-Z][a-zA-Z0-9]+$/.test(code) ? 'Неверный логин или пароль' : code)
}

/** `systemMessage = {"content":"...","level":"error"}` or similar object assignment. */
const extractSystemMessageObject = (html: string): { content: string | null; level: string | null } => {
  const patterns = [
    /systemMessage\s*=\s*(\{[\s\S]*?\})\s*;/i,
    /["']systemMessage["']\s*:\s*(\{[\s\S]*?\})/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(html)
    if (!match?.[1]) continue
    try {
      const parsed = JSON.parse(match[1].replace(/'/g, '"')) as {
        content?: unknown
        level?: unknown
        summary?: unknown
      }
      const content =
        typeof parsed.content === 'string'
          ? parsed.content
          : typeof parsed.summary === 'string'
            ? parsed.summary
            : null
      const level = typeof parsed.level === 'string' ? parsed.level : null
      if (content || level) return { content, level }
    } catch {
      // keep trying
    }
  }
  return { content: null, level: null }
}

const extractHtmlFeedback = (html: string): string | null => {
  const patterns = [
    /class=["'][^"']*kc-feedback-text[^"']*["'][^>]*>([\s\S]*?)<\//i,
    /class=["'][^"']*alert-error[^"']*["'][^>]*>([\s\S]*?)<\//i,
    /data-testid=["']login-error-message["'][^>]*>([\s\S]*?)<\//i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(html)
    if (!match?.[1]) continue
    const text = match[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) return text
  }
  return null
}

/**
 * Parses a Keycloak HTML page to extract the auth state from
 * `window.authConfiguration` JS assignments.
 */
export const parseAuthPage = (html: string): AuthStepResult => {
  const loginAction = extractJsStringValue(html, LOGIN_ACTION_KEY)?.replaceAll('&amp;', '&')
  const activePage = extractJsStringValue(html, ACTIVE_PAGE_KEY)
  const phoneNumber = extractJsStringValue(html, PHONE_NUMBER_KEY)

  let errorMessage = extractJsStringValue(html, ERROR_MESSAGE_KEY)
  let errorLevel = extractJsStringValue(html, ERROR_LEVEL_KEY)

  if (!errorMessage) {
    const fromObject = extractSystemMessageObject(html)
    errorMessage = fromObject.content
    errorLevel = errorLevel ?? fromObject.level
  }

  if (!loginAction || !activePage) {
    if (isYandexCaptchaHtml(html)) {
      return {
        type: 'error',
        message: 'ЦУ показал капчу. Подождите и попробуйте войти ещё раз.',
      }
    }
    return { type: 'error', message: 'Не удалось разобрать страницу авторизации' }
  }

  let translatedError = errorMessage ? translateKeycloakMessage(errorMessage, errorLevel) : null
  if (!translatedError) {
    const feedback = extractHtmlFeedback(html)
    if (feedback) translatedError = feedback
  }

  return {
    type: 'next',
    activePage,
    loginAction,
    phoneNumber,
    errorMessage: translatedError,
  }
}
