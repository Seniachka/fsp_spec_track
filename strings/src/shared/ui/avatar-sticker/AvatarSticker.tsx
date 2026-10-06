import type { AvatarStickerKind } from '../../lib/avatarSticker'
import './avatar-sticker.css'

type Props = {
  kind: AvatarStickerKind
  /** По умолчанию правый нижний; для QR-результата — левый верхний */
  corner?: 'br' | 'tl'
}

const HeartIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path
      d="M8 13.35S2.5 10.1 2.5 6.4A2.9 2.9 0 0 1 8 4.55 2.9 2.9 0 0 1 13.5 6.4C13.5 10.1 8 13.35 8 13.35Z"
      stroke="#fff"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
)

const NoteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path
      d="M4 2.5h6.5L13 5v8.5H4V2.5Z"
      stroke="#fff"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path d="M10.5 2.5V5H13" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M6 8h4M6 10.5h3" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)

const FriendsIcon = () => (
  <svg width="24" height="24" viewBox="11.75 12.75 22.5 22.5" fill="none" aria-hidden>
    <ellipse cx="29.1412" cy="16.1393" rx="2.52015" ry="2.4293" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <ellipse cx="15.0211" cy="24.0006" rx="2.52015" ry="2.4293" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <ellipse cx="29.1491" cy="31.857" rx="2.52015" ry="2.4293" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M26.8174 15.2278C25.2636 14.8345 23.6369 14.8301 22.0811 15.2151" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M31.123 17.624C32.2453 18.7111 33.0654 20.0716 33.5027 21.5716" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15.3633 26.3965C15.7919 27.8987 16.6041 29.2636 17.72 30.3568" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15.3633 21.6049C15.7919 20.1026 16.6041 18.7378 17.72 17.6445" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M31.1299 30.3723C32.2521 29.2852 33.0721 27.9248 33.5094 26.4248" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M26.8243 32.7684C25.2705 33.1618 23.6438 33.1661 22.0879 32.7811" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const AvatarSticker = ({ kind, corner = 'br' }: Props) => (
  <span
    className={`avatar-sticker avatar-sticker--${kind} avatar-sticker--${corner}`}
    aria-hidden
  >
    {kind === 'favorite' && <HeartIcon />}
    {kind === 'note' && <NoteIcon />}
    {kind === 'scan' && <FriendsIcon />}
  </span>
)
