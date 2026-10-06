import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

type Options = {
  /** Вызывается при подтверждённом закрытии (после анимации или fallback) */
  onClosed: () => void
  /**
   * Если вернуть false — закрытие отменяется.
   * Можно внутри показать confirm (грязный выход).
   */
  canClose?: () => boolean
  swipeThreshold?: number
  /** Селекторы в шапке, с которых свайп не стартует */
  ignoreSelector?: string
}

/**
 * Закрытие sheet-модалки: tryClose / requestClose, свайп за шапку,
 * animationend + timeout-fallback (если клик «пробил» confirm).
 */
export const useSheetDismiss = (
  sheetRef: RefObject<HTMLElement | null>,
  headerRef: RefObject<HTMLElement | null>,
  { onClosed, canClose, swipeThreshold = 80, ignoreSelector }: Options,
) => {
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const finishedRef = useRef(false)
  const onClosedRef = useRef(onClosed)
  const canCloseRef = useRef(canClose)
  onClosedRef.current = onClosed
  canCloseRef.current = canClose

  const finishClosed = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    onClosedRef.current()
  }, [])

  /** Принудительное закрытие (после confirm «Выйти» / «Удалить») */
  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
  }, [])

  /** Закрытие с проверкой canClose (backdrop / крестик / свайп) */
  const tryClose = useCallback(() => {
    if (closingRef.current) return
    if (canCloseRef.current && !canCloseRef.current()) return
    requestClose()
  }, [requestClose])

  /** Доводим шторку вниз с текущей позиции — без прыжка к translateY(0) */
  const animateOut = useCallback(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    sheet.style.transition = 'transform 0.24s cubic-bezier(0.4, 0, 1, 1)'
    sheet.style.transform = 'translateY(100%)'
  }, [sheetRef])

  useEffect(() => {
    if (!closing) return
    const sheet = sheetRef.current
    // Свайп оставляет inline animation:none — он душит .sheet-modal--exit.
    // Если его нет, CSS-анимация выхода отработает сама.
    if (!sheet || !sheet.style.animation) return
    animateOut()
  }, [closing, sheetRef, animateOut])

  useEffect(() => {
    if (!closing) return
    // Держим overlay ≥360ms после dismiss, иначе click после pointerdown
    // «пробивает» в кнопки под диммером (настройки → документы и т.п.).
    const t = window.setTimeout(() => finishClosed(), 360)
    return () => window.clearTimeout(t)
  }, [closing, finishClosed])

  const onAnimEnd = useCallback(() => {
    // animationend (~240ms) раньше окна защиты — не размонтируем здесь
  }, [])

  useEffect(() => {
    const header = headerRef.current
    const sheet = sheetRef.current
    if (!header || !sheet) return

    let dragging = false
    let startY = 0
    let offsetY = 0

    const resetTransform = () => {
      sheet.style.transform = 'translateY(0)'
      sheet.style.transition = 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)'
      // animation:none снимать нельзя: возврат к animation из класса
      // перезапускает sheet-slide-in — шторка прыгает вниз и въезжает заново.
      // Закрытие после свайпа доводит эффект по closing (animateOut).
    }

    const onStart = (e: MouseEvent | TouchEvent) => {
      if (closingRef.current) return
      const target = e.target as HTMLElement
      if (ignoreSelector && target.closest(ignoreSelector)) return
      const y = 'touches' in e ? e.touches[0].clientY : e.clientY
      startY = y
      offsetY = 0
      dragging = true
    }

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging) return
      const y = 'touches' in e ? e.touches[0].clientY : e.clientY
      const delta = y - startY
      if (delta <= 0) {
        offsetY = 0
        sheet.style.transform = 'translateY(0)'
        return
      }
      offsetY = delta
      sheet.style.transform = `translateY(${delta}px)`
      sheet.style.transition = 'none'
      sheet.style.animation = 'none'
      if ('touches' in e) e.preventDefault()
    }

    const onEnd = () => {
      if (!dragging) return
      dragging = false
      if (offsetY > swipeThreshold) {
        tryClose()
        if (closingRef.current) animateOut()
        else resetTransform()
      } else {
        resetTransform()
      }
      offsetY = 0
      startY = 0
    }

    header.addEventListener('mousedown', onStart)
    header.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)

    return () => {
      header.removeEventListener('mousedown', onStart)
      header.removeEventListener('touchstart', onStart)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [headerRef, sheetRef, ignoreSelector, swipeThreshold, tryClose, animateOut])

  return { closing, requestClose, tryClose, onAnimEnd }
}
