import { profileUrl } from '../../shared/lib/appLinks'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUserId = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value.trim())

export type QrPayload = {
  id: string
  name?: string
}

/**
 * Метка «эта ссылка из личного QR», а не просто расшаренная ссылка на профиль.
 * По ней (и только по ней) скан камерой телефона добавляет контакт — см.
 * parseQrLink. «Скопировать ссылку» в профиле метку не ставит: пересланная
 * ссылка обязана просто открывать профиль.
 */
const QR_FLAG_PARAM = 'qr'

/**
 * Кодирует личный QR как ссылку на профиль:
 * https://niti-uni.ru/profile/<id>?qr=1&n=<имя>.
 * Камера iPhone/Android открывает её как универсальную ссылку — приложение, если
 * оно установлено, иначе веб-гейт «открыть в приложении / скачать». Сканер внутри
 * приложения разбирает ту же ссылку (см. parseQrPayload).
 */
export const encodeQrPayload = (user: { id: string; name?: string }): string => {
  const url = new URL(profileUrl(user.id))
  url.searchParams.set(QR_FLAG_PARAM, '1')
  if (user.name) url.searchParams.set('n', user.name)
  return url.toString()
}

type ProfileLink = QrPayload & {
  /** В ссылке есть qr=1 — она из личного QR, а не из «поделиться профилем» */
  fromQr: boolean
}

/** Достаёт id пользователя из ссылки на профиль (https, niti:// или относительный путь). */
const parseProfileLink = (raw: string): ProfileLink | null => {
  let url: URL
  try {
    // niti://profile/u/<id> — в custom scheme «profile» уезжает в host, поэтому
    // склеиваем host и path обратно в один путь.
    url = new URL(raw.startsWith('/') ? `https://niti-uni.ru${raw}` : raw)
  } catch {
    return null
  }
  const pathname =
    url.protocol === 'niti:' ? `/${url.host}${url.pathname}` : url.pathname
  const match = /^\/profile\/(?:u\/)?([^/]+)\/?$/.exec(pathname)
  if (!match) return null
  const id = decodeURIComponent(match[1]).trim()
  if (!isUserId(id)) return null
  const name = url.searchParams.get('n')?.trim()
  return {
    id,
    ...(name ? { name } : {}),
    fromQr: url.searchParams.get(QR_FLAG_PARAM) === '1',
  }
}

const isLinkLike = (value: string): boolean => /^(https?:\/\/|niti:\/\/|\/)/i.test(value)

const toPayload = (link: ProfileLink): QrPayload => ({
  id: link.id,
  ...(link.name ? { name: link.name } : {}),
})

/** Разбирает отсканированную строку. null — невалидный QR */
export const parseQrPayload = (raw: string): QrPayload | null => {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (isUserId(trimmed)) {
    return { id: trimmed }
  }

  // Новый формат — ссылка на профиль. Сканер внутри приложения принимает её
  // и без qr=1: метка нужна только внешней камере (parseQrLink), а тут человек
  // осознанно навёл сканер «Нитей» на чужой код.
  if (isLinkLike(trimmed)) {
    const link = parseProfileLink(trimmed)
    return link ? toPayload(link) : null
  }

  // Старый формат — JSON {"id": ..., "name": ...}: такие QR уже напечатаны/приложены
  try {
    const data = JSON.parse(trimmed) as unknown
    if (data && typeof data === 'object' && isUserId((data as QrPayload).id)) {
      const payload = data as QrPayload
      return {
        id: payload.id.trim(),
        name: typeof payload.name === 'string' ? payload.name : undefined,
      }
    }
  } catch {
    // not json
  }

  return null
}

/**
 * Ссылка ИМЕННО из личного QR (?qr=1). Её открывает камера телефона мимо
 * сканера «Нитей», и по ней контакт должен добавиться так же, как при скане
 * внутри приложения. Обычная ссылка на профиль (без qr=1) сюда не попадает —
 * она просто открывает профиль.
 */
export const parseQrLink = (raw: string): QrPayload | null => {
  const trimmed = raw.trim()
  if (!trimmed || !isLinkLike(trimmed)) return null
  const link = parseProfileLink(trimmed)
  return link?.fromQr ? toPayload(link) : null
}
