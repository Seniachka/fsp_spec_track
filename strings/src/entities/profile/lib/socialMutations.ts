import { createSocial, deleteSocial, updateSocial } from '../../../api/Me'
import type { Social } from '../../../api/types'
import { UserFacingError } from '../../../shared/lib/userError'
import type { SocialLink, SocialNetworkId } from '../model/types'
import { isNickOnlySocialNetwork } from '../model/types'
import { mapSocialToApi } from './apiMappers'
import { normalizeSocialHref } from './socialLinks'

const SOCIAL_HOST_RULES: Record<SocialNetworkId, string[]> = {
  telegram: ['t.me'],
  tg_channel: ['t.me'],
  github: ['github.com'],
  vk: ['vk.com'],
  linkedin: ['linkedin.com'],
  behance: ['behance.net'],
  // У MAX и Time нет публичной страницы профиля — хост не проверяем.
  // Time вдобавок ник-онли (NICK_ONLY_SOCIAL_NETWORKS): ссылку не строим вовсе.
  max: [],
  time: [],
}

const buildSocialHref = (networkId: SocialNetworkId, raw: string): string => {
  const value = raw.trim()
  if (!value) return value

  const clean = value.replace(/^@+/, '').replace(/^\/+|\/+$/g, '')

  // Ник, а не адрес: ссылку не достраиваем. Если вместо ника вставили ссылку
  // (в том числе старое значение вида https://c.claudev из базы), берём
  // последний сегмент пути — так time.app/c.claudev и c.claudev дают один ник.
  if (isNickOnlySocialNetwork(networkId)) {
    const nick = clean
      .replace(/^https?:\/\//i, '')
      .split(/[?#]/)[0]
      .split('/')
      .filter(Boolean)
      .pop()
    return nick || value
  }

  if (/^https?:\/\//i.test(value)) return value
  if (!clean) return value

  switch (networkId) {
    case 'telegram':
    case 'tg_channel':
      return `https://t.me/${clean}`
    case 'github':
      return `https://github.com/${clean}`
    case 'vk':
      return `https://vk.com/${clean}`
    case 'linkedin': {
      const normalized = clean.startsWith('in/') ? clean : `in/${clean}`
      return `https://linkedin.com/${normalized}`
    }
    case 'behance':
      return `https://behance.net/${clean}`
    default:
      return normalizeSocialHref(clean)
  }
}

/**
 * Ник без адреса: латиница, цифры, точка, дефис, подчёркивание (c.claudev).
 * Длину сверх этого режет бэкенд (maxSocialLinkLen).
 */
const NICK_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

const validateSocialHref = (networkId: SocialNetworkId, href: string): void => {
  // У ник-онли сетей значение — не адрес, и new URL('c.claudev') бросил бы
  // «Некорректный адрес»: проверяем сам ник, а не хост.
  if (isNickOnlySocialNetwork(networkId)) {
    if (!NICK_PATTERN.test(href)) {
      throw new UserFacingError('Введи ник в формате c.claudev')
    }
    return
  }

  let url: URL
  try {
    url = new URL(href)
  } catch {
    throw new UserFacingError('Некорректный адрес. Укажи ссылку или ник, например @username')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UserFacingError('Ссылка должна начинаться с http:// или https://')
  }

  const allowedHosts = SOCIAL_HOST_RULES[networkId]
  if (!allowedHosts.length) return

  const host = url.hostname.toLowerCase()
  const ok = allowedHosts.some((domain) => host === domain || host.endsWith(`.${domain}`))
  if (!ok) {
    // UserFacingError, как и соседние правила: иначе toUserError склеит
    // «Не удалось добавить соцсеть. Причина: …» — под полем это лишний хвост.
    throw new UserFacingError(
      `Нужна ссылка на ${allowedHosts.join(' / ')} или ник этого сервиса`,
    )
  }
}

const withNormalizedHref = (social: SocialLink): SocialLink => ({
  ...social,
  href: buildSocialHref(social.networkId, social.href),
})

/** API допускает только одну isPreferred — снимаем флаг с остальных перед установкой */
const clearOtherPreferred = async (socials: SocialLink[], exceptId?: number) => {
  const preferred = socials.filter((s) => s.isPriority && s.id !== exceptId)
  if (preferred.length === 0) return
  for (const s of preferred) {
    await updateSocial(s.id, mapSocialToApi({ ...s, isPriority: false }))
  }
}

export const createSocialLink = async (
  social: Omit<SocialLink, 'id'>,
  existing: SocialLink[],
): Promise<Social> => {
  const next = withNormalizedHref({ ...social, id: 0 })
  validateSocialHref(next.networkId, next.href)
  const isPreferred = existing.length === 0 || next.isPriority

  if (isPreferred) {
    await clearOtherPreferred(existing)
  }

  return createSocial(mapSocialToApi({ ...next, isPriority: isPreferred }))
}

export const updateSocialLink = async (
  social: SocialLink,
  existing: SocialLink[],
): Promise<Social> => {
  const next = withNormalizedHref(social)
  validateSocialHref(next.networkId, next.href)
  const isOnly = existing.length === 1
  const isPreferred = isOnly || next.isPriority

  if (isPreferred) {
    await clearOtherPreferred(existing, next.id)
  }

  return updateSocial(next.id, mapSocialToApi({ ...next, isPriority: isPreferred }))
}

/** Удаляет соцсеть; если она была приоритетной — назначает приоритет следующей. */
export const deleteSocialLink = async (
  socialId: number,
  existing: SocialLink[],
): Promise<void> => {
  const target = existing.find((s) => s.id === socialId)
  await deleteSocial(socialId)

  const remaining = existing.filter((s) => s.id !== socialId)
  if (!target?.isPriority || remaining.length === 0) return
  if (remaining.some((s) => s.isPriority)) return

  const successor = remaining[0]
  await updateSocial(successor.id, mapSocialToApi({ ...successor, isPriority: true }))
}
