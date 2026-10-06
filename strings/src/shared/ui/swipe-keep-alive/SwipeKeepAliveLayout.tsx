import type { ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import './swipe-keep-alive.css'

type SwipeKeepAliveLayoutProps = {
  base: ReactNode
  /** Есть поверх базовой страницы оверлей (Outlet) */
  hasOverlay: boolean
  /**
   * Стабильный стек: база всегда absolute.
   * Нужен для вложенных свайп-экранов (settings→faq), иначе база прыгает и жест «едет не туда».
   */
  stack?: boolean
}

/** База остаётся смонтированной; дочерний route — свайп-оверлей сверху. */
export const SwipeKeepAliveLayout = ({
  base,
  hasOverlay,
  stack = false,
}: SwipeKeepAliveLayoutProps) => (
  <div className={`swipe-keep-alive${stack ? ' swipe-keep-alive--stack' : ''}`}>
    <div
      className={`swipe-keep-alive__base${hasOverlay ? ' swipe-keep-alive__base--covered' : ''}`}
      aria-hidden={hasOverlay}
    >
      {base}
    </div>
    <div className="swipe-keep-alive__overlay" hidden={!hasOverlay}>
      {hasOverlay ? <Outlet /> : null}
    </div>
  </div>
)
