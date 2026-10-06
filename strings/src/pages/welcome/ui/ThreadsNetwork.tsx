import { useEffect, useId, useRef } from 'react'
import './threads-network.css'

/**
 * Exact geometry from LinesSearch.svg — animated draw / fade loop.
 */
const PATHS = [
  {
    d: 'M81 336.5C97.5685 336.5 111 323.069 111 306.5V305C111 287.603 125.103 273.5 142.5 273.5H410.5',
    grad: 0,
    delay: 0.35,
  },
  {
    d: 'M81 336.5H165.251C172.845 336.5 179.001 330.344 179.001 322.75C179.001 315.156 185.157 309 192.751 309H411.001',
    grad: 1,
    delay: 0.45,
  },
  {
    d: 'M80 336.5C62.8533 336.5 48.9531 322.375 48.9531 305.228C48.9531 287.831 34.8501 273.5 17.4531 273.5H-251',
    grad: 3,
    delay: 0.4,
  },
  {
    d: 'M83 336.5C99.5685 336.5 113 349.932 113 366.5V390.5C113 420.323 137.177 444.5 167 444.5H441.5',
    grad: 8,
    delay: 0.55,
  },
  {
    d: 'M80.5 336C63.1462 336 49.0782 350.231 49.0782 367.585C49.0782 385.12 34.8633 399.5 17.3282 399.5H-68.5',
    grad: 9,
    delay: 0.5,
  },
  {
    d: 'M286 309H307C323.569 309 337 295.569 337 279V241.208C337 224.699 350.338 211.293 366.847 211.208L603 210',
    grad: 2,
    delay: 1.55,
  },
  {
    d: 'M230 444.5C246.017 444.5 259.001 431.516 259.001 415.499V412.75C259.001 395.215 273.216 381 290.751 381H558.501',
    grad: 4,
    delay: 1.9,
  },
  {
    d: 'M230 444.5C246.017 444.5 259.002 457.485 259.002 473.502V475.5C259.002 492.621 272.881 506.5 290.002 506.5H558.502',
    grad: 5,
    delay: 2.0,
  },
  {
    d: 'M230.5 444.5H282.75C292.001 444.5 299.5 451.999 299.5 461.25C299.5 470.501 306.999 478 316.25 478H559',
    grad: 6,
    delay: 2.05,
  },
  {
    d: 'M231 444.5H318C327.389 444.5 335 436.889 335 427.5C335 418.111 342.611 410.5 352 410.5H594.5',
    grad: 7,
    delay: 2.1,
  },
  {
    d: 'M343.5 125.5C326.379 125.5 312.5 111.496 312.5 94.3755C312.5 77.1166 298.509 63 281.25 63H13',
    grad: 10,
    delay: 2.9,
  },
  {
    d: 'M344 126C361.121 126 375 111.996 375 94.8755C375 77.6166 388.991 63.5 406.25 63.5H674.5',
    grad: 11,
    delay: 3.0,
  },
  {
    d: 'M239 63C221.879 63 208 48.9963 208 31.8755C208 14.6166 194.009 0.5 176.75 0.5H-91.5',
    grad: 12,
    delay: 2.85,
  },
  {
    d: 'M239 63.5C221.879 63.5 208 77.5037 208 94.6245C208 111.883 194.009 126 176.75 126H-91.5',
    grad: 13,
    delay: 2.95,
  },
  {
    d: 'M343 126C360.354 126 374.422 140.107 374.422 157.461C374.422 174.858 388.525 189 405.922 189H492',
    grad: 14,
    delay: 3.1,
  },
] as const

const DOTS = [
  { cx: 81, cy: 336.5, delay: 0 },
  { cx: 286, cy: 308.5, delay: 1.4 },
  { cx: 231, cy: 444.5, delay: 1.75 },
  { cx: 335, cy: 477.5, delay: 2.55 },
  { cx: 237, cy: 63.5, delay: 2.7 },
  { cx: 343, cy: 125.5, delay: 2.8 },
] as const

const GRADIENTS: Array<{
  x1: number
  y1: number
  x2: number
  y2: number
  fromGray?: boolean
  reverse?: boolean
}> = [
  { x1: 410.5, y1: 304.75, x2: 80, y2: 304.75 },
  { x1: 411, y1: 322.5, x2: 80, y2: 322.5 },
  { x1: 603, y1: 259.5, x2: 272, y2: 259.5 },
  { x1: -251, y1: 305, x2: 80, y2: 305 },
  { x1: 558.5, y1: 412.25, x2: 228, y2: 412.25 },
  { x1: 558.5, y1: 475.25, x2: 228, y2: 475.25 },
  { x1: 559, y1: 461, x2: 228, y2: 461 },
  { x1: 594.5, y1: 427.5, x2: 263.5, y2: 427.5, reverse: true },
  { x1: 441.5, y1: 390.5, x2: 83, y2: 390.5 },
  { x1: -68.5, y1: 368, x2: 80.5, y2: 368 },
  { x1: 13, y1: 94.25, x2: 343.5, y2: 94.25, fromGray: true },
  { x1: 674.5, y1: 94.75, x2: 344, y2: 94.75, fromGray: true },
  { x1: -91.5, y1: 31.75, x2: 239, y2: 31.75, fromGray: true },
  { x1: -91.5, y1: 94.75, x2: 239, y2: 94.75, fromGray: true },
  { x1: 492, y1: 157.5, x2: 343, y2: 157.5, fromGray: true },
]

const CYCLE_MS = 9000
const DRAW_MS = 1600
const FADE_START = 0.62
const FADE_END = 0.78

export const ThreadsNetwork = () => {
  const uid = useId().replace(/:/g, '')
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const animations: Animation[] = []

    const paths = svg.querySelectorAll<SVGPathElement>('.threads-network__path')
    paths.forEach((path, index) => {
      const length = path.getTotalLength()
      path.style.strokeDasharray = `${length}`
      path.style.strokeDashoffset = `${length}`

      if (reduced) {
        path.style.strokeDashoffset = '0'
        return
      }

      const delay = PATHS[index]!.delay
      const t0 = delay / (CYCLE_MS / 1000)
      const t1 = Math.min(FADE_START - 0.05, t0 + DRAW_MS / CYCLE_MS)

      const anim = path.animate(
        [
          { strokeDashoffset: length, opacity: 1, offset: 0 },
          { strokeDashoffset: length, opacity: 1, offset: t0 },
          { strokeDashoffset: 0, opacity: 1, offset: t1 },
          { strokeDashoffset: 0, opacity: 1, offset: FADE_START },
          { strokeDashoffset: 0, opacity: 0, offset: FADE_END },
          { strokeDashoffset: length, opacity: 0, offset: 1 },
        ],
        {
          duration: CYCLE_MS,
          iterations: Infinity,
          easing: 'linear',
          fill: 'forwards',
        },
      )
      animations.push(anim)
    })

    const dots = svg.querySelectorAll<SVGCircleElement>('.threads-network__dot')
    dots.forEach((dot, index) => {
      if (reduced) {
        dot.style.opacity = '1'
        return
      }

      const delay = DOTS[index]!.delay
      const t0 = delay / (CYCLE_MS / 1000)
      const tAppear = Math.min(FADE_START - 0.05, t0 + 0.08)

      const anim = dot.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: t0 },
          { opacity: 1, offset: tAppear },
          { opacity: 1, offset: FADE_START },
          { opacity: 0, offset: FADE_END },
          { opacity: 0, offset: 1 },
        ],
        {
          duration: CYCLE_MS,
          iterations: Infinity,
          easing: 'linear',
          fill: 'forwards',
        },
      )
      animations.push(anim)
    })

    return () => {
      animations.forEach((a) => a.cancel())
    }
  }, [])

  return (
    <svg
      ref={svgRef}
      className="welcome-page__network threads-network"
      viewBox="0 0 375 507"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMin meet"
      aria-hidden="true"
    >
      <defs>
        {GRADIENTS.map((g, i) => {
          const solid = g.fromGray ? '#B8A9FF' : '#775AFF'
          const firstOpacity = g.reverse ? 1 : 0
          const secondOpacity = g.reverse ? 0 : 1
          const firstColor = g.reverse ? '#775AFF' : solid
          return (
            <linearGradient
              key={i}
              id={`${uid}-paint${i}`}
              x1={g.x1}
              y1={g.y1}
              x2={g.x2}
              y2={g.y2}
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor={firstColor} stopOpacity={firstOpacity} />
              <stop offset="1" stopColor="#775AFF" stopOpacity={secondOpacity} />
            </linearGradient>
          )
        })}
        <filter
          id={`${uid}-dot-blur`}
          x="-80%"
          y="-80%"
          width="260%"
          height="260%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" />
        </filter>
      </defs>

      {PATHS.map((path, i) => (
        <path
          key={i}
          className="threads-network__path"
          d={path.d}
          stroke={`url(#${uid}-paint${path.grad})`}
          strokeOpacity={0.45}
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {DOTS.map((dot, i) => (
        <circle
          key={i}
          className="threads-network__dot"
          cx={dot.cx}
          cy={dot.cy}
          r={4}
          fill="#A894FF90"
          filter={`url(#${uid}-dot-blur)`}
        />
      ))}
    </svg>
  )
}
