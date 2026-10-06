import { Component, type ErrorInfo, type ReactNode } from 'react'
import './error-boundary.css'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
}

/**
 * Глобальный перехватчик ошибок рендера. Стоит выше всех провайдеров, поэтому
 * рисует фолбэк без роутера, профиля и модалок — любой из них мог и упасть.
 *
 * Зачем: в WKWebView упавший рендер оставляет белый экран навсегда — у нативной
 * оболочки нет ни адресной строки, ни кнопки «обновить», и выйти можно только
 * перезапуском приложения вручную (App Review 2.1).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Ошибка рендера:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="error-boundary">
        <div className="error-boundary__box">
          <h1 className="error-boundary__title">Что-то пошло не так</h1>
          <p className="error-boundary__text">Перезапусти приложение — данные не потеряются</p>
          <button
            type="button"
            className="error-boundary__btn"
            onClick={() => window.location.replace('/')}
          >
            Перезапустить
          </button>
        </div>
      </div>
    )
  }
}
