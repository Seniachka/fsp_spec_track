import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { getStatusVisual, type StatusVisual } from '../../../entities/profile/model/statusMeta'
import './status-badge.css'

type StatusBadgeProps = {
  statusId?: number | null
  label?: string | null
  visual?: StatusVisual | null
  selected?: boolean
  as?: 'button' | 'span'
  className?: string
  children?: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>

export const StatusBadge = ({
  statusId,
  label,
  visual: visualProp,
  selected = false,
  as = 'span',
  className = '',
  children,
  type = 'button',
  ...buttonProps
}: StatusBadgeProps) => {
  const visual = visualProp ?? getStatusVisual({ statusId, label })
  if (!visual) return null

  const text = visual.label.toLowerCase()
  const classNames =
    `status-badge${selected ? ' status-badge--selected' : ''} ${className}`.trim()

  const content = (
    <>
      <span className="status-badge__icon" aria-hidden>
        <visual.Icon />
      </span>
      <span className="status-badge__label">{children ?? text}</span>
    </>
  )

  const style = { '--status-bg': visual.color } as CSSProperties

  if (as === 'button') {
    return (
      <button type={type} className={classNames} style={style} {...buttonProps}>
        {content}
      </button>
    )
  }

  return (
    <span className={classNames} style={style}>
      {content}
    </span>
  )
}
