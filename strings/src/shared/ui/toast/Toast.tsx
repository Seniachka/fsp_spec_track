import { useCallback, useEffect, useRef } from 'react'
import './toast.css'

type ToastProps = {
  message: string
  onClose: () => void
  duration?: number
}

/** Смахнули вверх дальше порога — закрываем */
const SWIPE_THRESHOLD = 48
/** Длительность улёта вверх */
const EXIT_MS = 200

export const Toast = ({ message, onClose, duration = 2500 }: ToastProps) => {
  const toastRef = useRef<HTMLDivElement>(null)
  // onClose приходит инлайн-стрелкой и новый на каждом ререндере родителя —
  // держим в ref, иначе таймер автозакрытия сбрасывается и тост висит дольше.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const closedRef = useRef(false)
  const exitTimerRef = useRef(0)

  /** Улетаем вверх и только после анимации отдаём onClose */
  const close = useCallback(() => {
    if (closedRef.current) return
    closedRef.current = true
    const el = toastRef.current
    if (el) {
      el.style.animation = 'none'
      el.style.transition = `transform ${EXIT_MS}ms ease-in, opacity ${EXIT_MS}ms ease-in`
      el.style.transform = 'translateX(-50%) translateY(calc(-100% - 96px))'
      el.style.opacity = '0'
    }
    exitTimerRef.current = window.setTimeout(() => onCloseRef.current(), EXIT_MS)
  }, [])

  // Автозакрытие. Удержание пальцем таймер не останавливает — тост уедет сам.
  useEffect(() => {
    const el = toastRef.current
    if (el) {
      // Новое сообщение в том же тосте — снимаем следы прошлого улёта
      el.style.animation = ''
      el.style.transition = ''
      el.style.transform = ''
      el.style.opacity = ''
    }
    closedRef.current = false
    const timer = window.setTimeout(close, duration)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(exitTimerRef.current)
    }
  }, [message, duration, close])

  // Смахивание вверх: тост едет за пальцем, за порогом — закрывается,
  // не дотянули — плавно возвращается на место.
  useEffect(() => {
    const el = toastRef.current
    if (!el) return

    let dragging = false
    let startY = 0
    let offsetY = 0

    const resetTransform = () => {
      el.style.transform = 'translateX(-50%) translateY(0)'
      el.style.transition = 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)'
      // animation:none оставляем: вернуть animation из класса — значит
      // перезапустить toast-in, и тост мигнёт (opacity 0 → 1) на возврате.
      // Улёт (close) ставит animation:none сам, а новое сообщение чистит стили.
    }

    const onStart = (e: MouseEvent | TouchEvent) => {
      if (closedRef.current) return
      startY = 'touches' in e ? e.touches[0].clientY : e.clientY
      offsetY = 0
      dragging = true
    }

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging) return
      // Автозакрытие сработало под пальцем — дальше не мешаем улёту
      if (closedRef.current) {
        dragging = false
        return
      }
      const y = 'touches' in e ? e.touches[0].clientY : e.clientY
      const delta = y - startY
      if (delta >= 0) {
        offsetY = 0
        el.style.transform = 'translateX(-50%) translateY(0)'
        return
      }
      offsetY = delta
      el.style.transform = `translateX(-50%) translateY(${delta}px)`
      el.style.transition = 'none'
      el.style.animation = 'none'
      if ('touches' in e) e.preventDefault()
    }

    const onEnd = () => {
      if (!dragging) return
      dragging = false
      if (closedRef.current) return
      if (offsetY < -SWIPE_THRESHOLD) close()
      else resetTransform()
      offsetY = 0
      startY = 0
    }

    el.addEventListener('mousedown', onStart)
    el.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)

    return () => {
      el.removeEventListener('mousedown', onStart)
      el.removeEventListener('touchstart', onStart)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [close])

  return (
    <div className="toast" role="status" ref={toastRef}>
      <p className="toast__text">{message}</p>
    </div>
  )
}
