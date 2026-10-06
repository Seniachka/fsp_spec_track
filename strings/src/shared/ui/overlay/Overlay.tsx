import type { ReactNode, PointerEvent } from 'react'
import './overlay.css'

type OverlayProps = {
  children: ReactNode
  onBackdropClick?: () => void
  centered?: boolean
  /** Поверх sheet-модалок (confirm и т.п.) */
  elevated?: boolean
}

/** После backdrop-dismiss глушим следующий click ~360ms (ghost-click в кнопки под диммером). */
const armClickShield = () => {
  const block = (ev: Event) => {
    ev.preventDefault()
    ev.stopPropagation()
  }
  document.addEventListener('click', block, true)
  window.setTimeout(() => {
    document.removeEventListener('click', block, true)
  }, 360)
}

export const Overlay = ({ children, onBackdropClick, centered, elevated }: OverlayProps) => {
  // pointerdown вместо click — чтобы не было «пробития» клика в модалку под confirm
  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      e.preventDefault()
      e.stopPropagation()
      armClickShield()
      onBackdropClick?.()
    }
  }

  return (
    <div
      className={`overlay${centered ? ' overlay--center' : ''}${elevated ? ' overlay--elevated' : ''}`}
      onPointerDown={handlePointerDown}
      role="presentation"
    >
      {children}
    </div>
  )
}
