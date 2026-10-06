import type { SocialLink } from '../model/types'

export const normalizeSocialHref = (href: string): string =>
  href.startsWith('http') ? href : `https://${href}`

export const getPrioritySocialId = (socials: SocialLink[]): number | null =>
  socials.find((s) => s.isPriority)?.id ?? null
