import { useCallback, useEffect, useRef, useState } from 'react'
import { NavigationType, useNavigate, useNavigationType } from 'react-router-dom'

const SLIDE_IN_MS = 300
const SLIDE_OUT_MS = 160
const EDGE_PX = 28
const ACTIVATE_DX = 10
const COMMIT_DX = 72
const COMMIT_VELOCITY = 0.45 // px/ms
const MAX_DY = 56

type Phase = 'enter' | 'idle' | 'exit' | 'drag'

type UsePageSwipeRightOptions = {
  /** Куда уходить при «назад» после анимации */
  backTo?: string
  /** Интерактивный свайп от края */
  edgeSwipe?: boolean
  /** Можно временно выключить (шиты / диалоги) */
  edgeSwipeEnabled?: boolean
  /**
   * Вызов после визуального commit жеста (экран уже уехал).
   * Навигация без повторной exit-анимации.
   */
  onEdgeSwipeBack?: () => void
  /** Старт интерактивного свайпа назад (для предзагрузки базы под оверлеем) */
  onEdgeSwipeStart?: () => void
  /** false → жест отменяется (snap back), можно показать confirm */
  canEdgeSwipeCommit?: () => boolean
  /** Принудительно без enter (если экран уже был в стеке) */
  skipEnter?: boolean
}

/**
 * Вход справа / выход вправо. Свайп от левого края — экран едет за пальцем.
 * При POP (возврат назад) enter не проигрывается.
 */
export const usePageSwipeRight = ({
  backTo = '/profile',
  edgeSwipe = true,
  edgeSwipeEnabled = true,
  onEdgeSwipeBack,
  onEdgeSwipeStart,
  canEdgeSwipeCommit,
  skipEnter = false,
}: UsePageSwipeRightOptions = {}) => {
  const navigate = useNavigate()
  const navType = useNavigationType()
  const rootRef = useRef<HTMLElement | null>(null)
  const finishedRef = useRef(false)
  const initialPhase: Phase =
    skipEnter || navType === NavigationType.Pop ? 'idle' : 'enter'
  const phaseRef = useRef<Phase>(initialPhase)
  const onEdgeSwipeBackRef = useRef(onEdgeSwipeBack)
  const onEdgeSwipeStartRef = useRef(onEdgeSwipeStart)
  const canEdgeSwipeCommitRef = useRef(canEdgeSwipeCommit)
  onEdgeSwipeBackRef.current = onEdgeSwipeBack
  onEdgeSwipeStartRef.current = onEdgeSwipeStart
  canEdgeSwipeCommitRef.current = canEdgeSwipeCommit
  const [phase, setPhase] = useState<Phase>(initialPhase)
  phaseRef.current = phase

  const setPhaseBoth = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  useEffect(() => {
    if (phase !== 'enter') return
    const el = rootRef.current
    if (el) {
      el.style.transform = ''
      el.style.transition = ''
    }

    const toIdle = () => {
      if (el) {
        el.style.transform = ''
        el.style.transition = ''
      }
      setPhaseBoth('idle')
    }

    const onEnd = (event: AnimationEvent) => {
      if (el && event.target !== el) return
      toIdle()
    }

    el?.addEventListener('animationend', onEnd)
    const fallback = window.setTimeout(toIdle, SLIDE_IN_MS + 50)
    return () => {
      el?.removeEventListener('animationend', onEnd)
      window.clearTimeout(fallback)
    }
  }, [phase, setPhaseBoth])

  const runExitThen = useCallback(
    (action: () => void) => {
      const el = rootRef.current
      if (!el || phaseRef.current === 'exit') {
        action()
        return
      }

      finishedRef.current = false
      setPhaseBoth('exit')
      el.style.transition = ''
      el.style.transform = ''
      el.classList.remove('page-swipe-right--dragging')

      let node: HTMLElement | null = el.parentElement
      while (node) {
        if (node.classList.contains('swipe-keep-alive')) {
          node.classList.add('swipe-keep-alive--revealing')
        }
        node = node.parentElement
      }

      const finish = () => {
        if (finishedRef.current) return
        finishedRef.current = true
        action()
      }

      const onEnd = (event: AnimationEvent) => {
        if (event.target !== el) return
        el.removeEventListener('animationend', onEnd)
        finish()
      }

      el.addEventListener('animationend', onEnd)
      window.setTimeout(finish, SLIDE_OUT_MS + 40)
    },
    [setPhaseBoth],
  )

  const navigateBack = useCallback(
    (to: string = backTo) => {
      runExitThen(() => navigate(to))
    },
    [backTo, navigate, runExitThen],
  )

  useEffect(() => {
    if (!edgeSwipe || !edgeSwipeEnabled) return
    const el = rootRef.current
    if (!el) return

    let startX = 0
    let startY = 0
    let armed = false
    let dragging = false
    let lastDx = 0
    let lastT = 0
    let velocity = 0

    const setRevealing = (on: boolean) => {
      let node: HTMLElement | null = el.parentElement
      while (node) {
        if (node.classList.contains('swipe-keep-alive')) {
          node.classList.toggle('swipe-keep-alive--revealing', on)
        }
        node = node.parentElement
      }
    }

    const applyDrag = (dx: number) => {
      const x = Math.max(0, dx)
      el.style.transition = 'none'
      el.style.transform = `translate3d(${x}px, 0, 0)`
      el.classList.add('page-swipe-right--dragging')
      setRevealing(true)
    }

    const resetVisual = () => {
      el.style.transition = ''
      el.style.transform = ''
      el.classList.remove('page-swipe-right--dragging')
      setRevealing(false)
    }

    const cancelDrag = () => {
      dragging = false
      armed = false
      el.style.transition = 'transform 0.22s ease-out'
      el.style.transform = 'translate3d(0, 0, 0)'
      window.setTimeout(() => {
        if (phaseRef.current === 'drag') setPhaseBoth('idle')
        resetVisual()
      }, 240)
    }

    const commitDrag = () => {
      dragging = false
      armed = false
      const w = Math.max(window.innerWidth, 1)
      el.style.transition = 'transform 0.16s ease-in'
      el.style.transform = `translate3d(${w}px, 0, 0)`
      setRevealing(true)
      window.setTimeout(() => {
        const custom = onEdgeSwipeBackRef.current
        if (custom) custom()
        else navigate(backTo)
      }, 170)
    }

    const onTouchStart = (event: TouchEvent) => {
      if (phaseRef.current !== 'idle' && phaseRef.current !== 'drag') return
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      if (!touch) return
      startX = touch.clientX
      startY = touch.clientY
      lastT = performance.now()
      lastDx = 0
      velocity = 0
      armed = startX <= EDGE_PX
      dragging = false
    }

    const onTouchMove = (event: TouchEvent) => {
      if (!armed || event.touches.length !== 1) return
      const touch = event.touches[0]
      if (!touch) return

      const dx = touch.clientX - startX
      const dy = Math.abs(touch.clientY - startY)
      const now = performance.now()
      const dt = Math.max(now - lastT, 1)
      velocity = (dx - lastDx) / dt
      lastDx = dx
      lastT = now

      if (!dragging) {
        if (dy > MAX_DY && dy >= dx) {
          armed = false
          return
        }
        if (dx > ACTIVATE_DX && dx > dy * 1.15) {
          dragging = true
          setPhaseBoth('drag')
          onEdgeSwipeStartRef.current?.()
        } else {
          return
        }
      }

      if (event.cancelable) event.preventDefault()
      applyDrag(dx)
    }

    const onTouchEnd = () => {
      if (!armed && !dragging) return
      if (!dragging) {
        armed = false
        return
      }

      const shouldCommit = lastDx >= COMMIT_DX || (velocity > COMMIT_VELOCITY && lastDx > 40)

      if (shouldCommit) {
        const canCommit = canEdgeSwipeCommitRef.current
        if (canCommit && !canCommit()) {
          cancelDrag()
          onEdgeSwipeBackRef.current?.()
          return
        }
        commitDrag()
      } else {
        cancelDrag()
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
      resetVisual()
    }
  }, [edgeSwipe, edgeSwipeEnabled, backTo, navigate, setPhaseBoth])

  const rootClassName =
    phase === 'enter'
      ? 'page-swipe-right--enter'
      : phase === 'exit'
        ? 'page-swipe-right--exit'
        : phase === 'drag'
          ? 'page-swipe-right--dragging'
          : ''

  return { rootRef, rootClassName, navigateBack, runExitThen }
}
