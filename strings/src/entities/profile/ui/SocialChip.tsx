import type { CSSProperties, MouseEvent } from 'react'
import type { SocialLink } from '../model/types'
import { isNickOnlySocialNetwork } from '../model/types'
import { normalizeSocialHref } from '../lib/socialLinks'
import { SocialNetworkIcon } from '../../../shared/ui/social-network-icon/SocialNetworkIcon'

type SocialChipProps = {
  social: SocialLink
  className: string
  /** Класс обёртки иконки — у профиля и модалки они разные */
  iconWrapClassName: string
  iconClassName?: string
  style?: CSSProperties
  /** Клик хоста: в модалке нужен stopPropagation, чтобы не закрыть её */
  onClick?: (event: MouseEvent<HTMLElement>) => void
}

const showToast = (message: string) => {
  window.dispatchEvent(new CustomEvent('faculty:toast', { detail: message }))
}

/**
 * Чип соцсети в профиле. У сетей с публичной страницей это ссылка во внешний
 * браузер; у ник-онли сетей (Time) адреса нет, и ссылка вида https://<ник> вела
 * бы на несуществующий домен — вместо перехода копируем ник в буфер.
 */
export const SocialChip = ({
  social,
  className,
  iconWrapClassName,
  iconClassName,
  style,
  onClick,
}: SocialChipProps) => {
  const content = (
    <>
      <span className={iconWrapClassName}>
        <SocialNetworkIcon networkId={social.networkId} className={iconClassName} />
      </span>
      <span>{social.label}</span>
    </>
  )

  if (isNickOnlySocialNetwork(social.networkId)) {
    const copyNick = async (event: MouseEvent<HTMLElement>) => {
      onClick?.(event)
      try {
        await navigator.clipboard.writeText(social.href)
        showToast(`Ник ${social.label} скопирован`)
      } catch {
        showToast('Не удалось скопировать ник')
      }
    }

    return (
      <button
        type="button"
        className={className}
        style={style}
        onClick={(event) => void copyNick(event)}
      >
        {content}
      </button>
    )
  }

  return (
    <a
      href={normalizeSocialHref(social.href)}
      className={className}
      style={style}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
    >
      {content}
    </a>
  )
}
