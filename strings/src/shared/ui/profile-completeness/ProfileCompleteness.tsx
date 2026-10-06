import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import './profile-completeness.css'

type ProfileCompletenessProps = {
  /** 0–100; `null` — кольцо скрыто до загрузки */
  percent: number | null
  children: ReactNode
  className?: string
  /** Скругление аватара в % от стороны (как border-radius: 12.5%) */
  radiusPercent?: number
}

const COLOR_LOW = '#EB6531'
const COLOR_HIGH = '#0DBA5F'

/** Толщина кольца в единицах viewBox 0…100 (без non-scaling-stroke — иначе dash плывёт) */
const STROKE_USER = 3.5

const clampPercent = (value: number) => Math.max(0, Math.min(100, value))

const colorForPercent = (percent: number) => (percent >= 70 ? COLOR_HIGH : COLOR_LOW)

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

/**
 * Концентрический скруглённый прямоугольник внутри аватара.
 * inset = половина stroke → весь штрих внутри viewBox, ничего не клипается.
 * Старт и финиш — верхний центр. Без Z.
 */
const roundedRectPathFromTopCenter = (
  radiusPercent: number,
  inset: number,
): string => {
  const x0 = inset
  const y0 = inset
  const x1 = 100 - inset
  const y1 = 100 - inset
  const r = Math.max(0, Math.min(radiusPercent, 50) - inset)
  const cx = 50

  return [
    `M ${cx} ${y0}`,
    `L ${x1 - r} ${y0}`,
    `A ${r} ${r} 0 0 1 ${x1} ${y0 + r}`,
    `L ${x1} ${y1 - r}`,
    `A ${r} ${r} 0 0 1 ${x1 - r} ${y1}`,
    `L ${x0 + r} ${y1}`,
    `A ${r} ${r} 0 0 1 ${x0} ${y1 - r}`,
    `L ${x0} ${y0 + r}`,
    `A ${r} ${r} 0 0 1 ${x0 + r} ${y0}`,
    `L ${cx} ${y0}`,
  ].join(' ')
}

const useAnimatedPercent = (target: number | null, durationMs = 900) => {
  const [display, setDisplay] = useState(0)
  /** Последнее показанное значение — старт следующей анимации */
  const fromRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    if (target == null) return

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const next = clampPercent(target)

    if (reduceMotion) {
      fromRef.current = next
      setDisplay(next)
      return
    }

    const from = fromRef.current
    const start = performance.now()

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const value = from + (next - from) * easeOutCubic(t)
      // Пишем каждый кадр: если percent сменится на полпути,
      // новая анимация продолжится с текущего места, а не прыгнет назад.
      fromRef.current = value
      setDisplay(value)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = next
        setDisplay(next)
      }
    }

    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(rafRef.current)
  }, [target, durationMs])

  return display
}

export const ProfileCompleteness = ({
  percent,
  children,
  className = '',
  radiusPercent = 12.5,
}: ProfileCompletenessProps) => {
  const animated = useAnimatedPercent(percent)
  const shown = percent == null ? 0 : animated
  const rounded = Math.round(shown)
  const color = colorForPercent(percent ?? 0)
  const dash = clampPercent(shown)
  const complete = dash >= 99.5
  const inset = STROKE_USER / 2
  const path = roundedRectPathFromTopCenter(radiusPercent, inset)

  const style = {
    '--pc-color': color,
  } as CSSProperties

  return (
    <span className={`profile-completeness ${className}`.trim()} style={style}>
      {percent != null && (
        <svg
          className="profile-completeness__svg"
          viewBox="0 0 100 100"
          aria-hidden
        >
          <path
            className="profile-completeness__progress"
            d={path}
            pathLength={100}
            stroke={color}
            strokeWidth={STROKE_USER}
            // 100%: без dasharray — полный контур до точки старта.
            // иначе pathLength нормализует периметр в 0…100.
            strokeDasharray={complete ? 'none' : `${Math.max(dash, 0.001)} 100`}
            opacity={dash > 0.2 ? 1 : 0}
          />
        </svg>
      )}

      <span className="profile-completeness__content">{children}</span>

      {percent != null && (
        <span className="profile-completeness__badge" aria-live="polite">
          {rounded}%
        </span>
      )}
    </span>
  )
}
