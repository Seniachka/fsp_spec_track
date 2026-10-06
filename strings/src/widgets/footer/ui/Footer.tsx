import { FiSearch, FiUser } from 'react-icons/fi'
import { useQr } from '../../../app/providers/QrContext'
import {
  useTabNavigation,
  type MainTab,
} from '../../../app/providers/TabNavigationContext'
import afishaIconUrl from '../../../assets/Afisha.svg?url'
import friendsIconUrl from '../../../assets/FriendsIconFooter.svg?url'
import './footer.css'

const footerItems: Array<
  | { icon: string; label: string; tab: MainTab; isCustom: true }
  | { icon: typeof FiSearch | typeof FiUser; label: string; tab: MainTab }
  | { label: string; action: 'qr' }
> = [
  { icon: afishaIconUrl, label: 'Афиша', tab: 'afisha', isCustom: true },
  { icon: FiSearch, label: 'Поиск', tab: 'search' },
  { label: 'QR-коды', action: 'qr' },
  {
    icon: friendsIconUrl,
    label: 'Друзья',
    tab: 'friends',
    isCustom: true,
  },
  { icon: FiUser, label: 'Профиль', tab: 'profile' },
]

type FooterItem = (typeof footerItems)[number]

export const Footer = () => {
  const { openQrModal } = useQr()
  const { activeTab, selectTab } = useTabNavigation()

  const handleClick = (item: FooterItem) => {
    if ('action' in item && item.action === 'qr') {
      openQrModal()
      return
    }
    if ('tab' in item) {
      selectTab(item.tab)
    }
  }

  const isActive = (item: FooterItem) => {
    if ('action' in item && item.action === 'qr') return false
    if (!('tab' in item)) return false
    return activeTab === item.tab
  }

  return (
    <>
      <div className="footer-blur" aria-hidden="true" />
      <footer className="footer">
        {footerItems.map((item) => {
          const active = isActive(item)
          const isQr = 'action' in item && item.action === 'qr'

          return (
            <button
              className={[
                'footer__item',
                isQr ? 'footer__item--qr' : '',
                active ? 'footer__item--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={item.label}
              type="button"
              aria-label={item.label}
              onClick={() => handleClick(item)}
            >
              {isQr ? (
                <span className="footer__qr" aria-hidden="true">
                  <span className="footer__qr-glyph" />
                </span>
              ) : (
                <FooterIcon item={item} isActive={active} />
              )}
              <span className="footer__label">{item.label}</span>
            </button>
          )
        })}
      </footer>
    </>
  )
}

type FooterIconProps = {
  item: FooterItem
  isActive: boolean
}

const FooterIcon = ({ item, isActive }: FooterIconProps) => {
  if ('isCustom' in item && item.isCustom && typeof item.icon === 'string') {
    return (
      <div
        className="footer__icon-mask"
        style={{
          maskImage: `url("${item.icon}")`,
          WebkitMaskImage: `url("${item.icon}")`,
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          backgroundColor: isActive ? '#7057F8' : '#98A2B3',
        }}
      />
    )
  }

  if ('icon' in item && typeof item.icon === 'function') {
    const Icon = item.icon
    return <Icon className="footer__icon" aria-hidden="true" />
  }

  return null
}
