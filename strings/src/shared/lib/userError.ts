import { ApiRequestError } from '../../api/client'
import type { SocialNetworkId } from '../../entities/profile/model/types'

type ErrorContext = {
  socialNetworkId?: SocialNetworkId | null
}

const SOCIAL_HINTS: Record<SocialNetworkId, string> = {
  telegram: 'Можно ссылку t.me/… или юзернейм / @ник',
  tg_channel: 'Можно ссылку t.me/… или имя канала / @канал',
  github: 'Можно ссылку github.com/… или username',
  vk: 'Можно ссылку vk.com/… или id / короткий адрес',
  linkedin: 'Можно ссылку linkedin.com/in/… или username',
  behance: 'Можно ссылку behance.net/… или username',
  max: 'Можно ссылку на профиль или ник',
  time: 'Введи ник в формате c.claudev',
}

/** «Не доехали до сервера»: нет сети, таймаут, DNS, отменённый запрос. */
const NETWORK_ERROR_MESSAGE = 'Проблема с сетью. Проверь интернет и попробуй позже.'
/** «Доехали, но сервер не смог» — принципиально другая причина, чем сеть. */
const SERVER_ERROR_MESSAGE = 'Что-то пошло не так на сервере. Попробуй чуть позже.'

/**
 * Транспортные сбои. Нативный клиент оборачивает их в
 * «Network request failed (native GET https://…): …», iOS отдаёт NSURLError,
 * Android — ConnectException/UnknownHostException.
 */
const NETWORK_ERROR_TEXT =
  /network|failed to fetch|load failed|timeout|timed out|could not connect|cannot connect|connection refused|econnrefused|unable to resolve host|hostname could not be found|network is unreachable|no route to host|appears to be offline|nsurlerror|net::err|connectexception|unknownhostexception/i

/**
 * Технический текст (URL, native-префикс клиента, коды NSURLError) пользователю
 * не показываем даже как причину — вместо него остаётся понятный fallback.
 * Код NSURLError ловим только в его диапазоне (-1001, -1009, -1200 и т.п.) и
 * только после пробела/скобки: иначе под «технический текст» попадали обычные
 * сообщения с датой («17-08-2026») и диапазоном («между 1900-2100»).
 */
const TECHNICAL_TEXT =
  /https?:\/\/|native (get|post|put|patch|delete)|nsurlerror|net::err|(^|[\s(])-1\d{3}\b/i

/**
 * Ошибка с уже готовым текстом для пользователя (клиентская валидация формы).
 * {@link toUserError} возвращает её message дословно — без обёртки
 * «Не удалось …. Причина: …», которую получают сырые backend/transport ошибки.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}

const normalize = (message: string): string => message.trim().toLowerCase()
const trimMessage = (message: string): string => message.trim().replace(/\s+/g, ' ')
const withReason = (fallback: string, reason: string): string => {
  const base = fallback.trim().replace(/[.!?]+$/, '')
  const why = reason.trim().replace(/^[.:\-\s]+/, '').replace(/[.]+$/, '')
  if (!why) return `${base}.`
  return `${base}. Причина: ${why}.`
}

const socialFormatMessage = (ctx?: ErrorContext): string => {
  const networkId = ctx?.socialNetworkId
  if (!networkId) return 'Неверный формат. Укажи ссылку или ник и попробуй снова.'
  return `Неверный формат. ${SOCIAL_HINTS[networkId]}.`
}

/**
 * Переводит сырые backend/transport ошибки в короткие понятные сообщения для пользователя.
 */
export const toUserError = (
  err: unknown,
  fallback = 'Что-то пошло не так. Попробуй ещё раз.',
  ctx?: ErrorContext,
): string => {
  // Текст уже написан для пользователя — показываем как есть.
  if (err instanceof UserFacingError) {
    return trimMessage(err.message || '') || fallback
  }

  if (err instanceof ApiRequestError) {
    const msg = trimMessage(err.message || '')
    const m = normalize(msg)

    if (m.includes('cu edu place cannot be deleted')) {
      return 'Учёбу в ЦУ удалить нельзя — она приходит из университета.'
    }
    if (m.includes('cu edu place university cannot be changed')) {
      return 'Вуз в карточке ЦУ изменить нельзя — она приходит из университета.'
    }
    if (m.includes('cu edu place is managed by the university sync')) {
      return 'Карточку учёбы в ЦУ добавляет сам университет — выбери другой вуз.'
    }

    if (m.includes('invalid credentials')) {
      return 'Неверный логин или пароль'
    }
    if (err.status === 401) return 'Сессия истекла. Войди в аккаунт ещё раз.'
    if (err.status === 403) return 'Недостаточно прав для этого действия.'
    if (err.status === 404) return 'Не удалось найти данные. Обнови экран и попробуй снова.'
    if (err.status >= 500) return SERVER_ERROR_MESSAGE

    if (m.includes('prohibited content') || m.includes('запрещ')) {
      return 'Текст нарушает правила сообщества. Убери оскорбления или запрещённые формулировки и попробуй снова.'
    }
    if (m.includes('must be at most') && m.includes('content')) {
      return 'Описание слишком длинное. Сократи до 300 символов.'
    }
    if (m.includes('social is required')) return 'Выбери социальную сеть.'
    if (m.includes('must be at most') && m.includes('link')) {
      return 'Ссылка слишком длинная. Сократи её и попробуй снова.'
    }
    if (m.includes('invalid') && m.includes('link')) return socialFormatMessage(ctx)
    if (m.includes('invalid url') || m.includes('invalid_uri')) return socialFormatMessage(ctx)

    if (m.includes('photo must be an image')) return 'Можно загрузить только изображение.'
    if (m.includes('statusid must be a positive integer')) return 'Выбери корректный статус.'
    if (m.includes('birthdate') && m.includes('invalid')) return 'Неверный формат даты рождения.'
    if (m.includes('required')) return 'Заполни обязательные поля и попробуй снова.'
    if (msg && !TECHNICAL_TEXT.test(msg)) return withReason(fallback, msg)
    return fallback
  }

  if (err instanceof Error) {
    const raw = trimMessage(err.message)
    const m = normalize(raw)
    // Отмена (свой таймаут, уход со страницы) для пользователя — та же «сеть подвела».
    if (err.name === 'AbortError' || NETWORK_ERROR_TEXT.test(raw)) return NETWORK_ERROR_MESSAGE
    if (m.includes('invalid') && m.includes('link')) return socialFormatMessage(ctx)
    if (raw && !TECHNICAL_TEXT.test(raw)) return withReason(fallback, raw)
  }

  return fallback
}

