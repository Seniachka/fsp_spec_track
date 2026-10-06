import { Button } from '../button/Button'
import './startup-gate.css'

/**
 * Экран ожидания стартовых гейтов (welcome, RequireOnboardingComplete).
 * До него доходят только те, у кого уже есть токен: вместо пустой белой
 * страницы на всё время запроса показываем фон приложения и спиннер.
 */
export const StartupLoader = ({ label = 'Загружаем…' }: { label?: string }) => (
  <main className="startup-gate" aria-busy="true">
    <div className="startup-gate__box">
      <span className="startup-gate__spinner" aria-hidden />
      <p className="startup-gate__text">{label}</p>
    </div>
  </main>
)

type StartupErrorProps = {
  onRetry: () => void
  onSignOut: () => void
}

/**
 * Сервер не ответил за отведённое время. Уводить такого пользователя в
 * онбординг нельзя (он уже вошёл) — даём повторить запрос или выйти.
 */
export const StartupError = ({ onRetry, onSignOut }: StartupErrorProps) => (
  <main className="startup-gate">
    <div className="startup-gate__box">
      <h1 className="startup-gate__title">Нет связи с сервером</h1>
      <p className="startup-gate__text">Проверь интернет и попробуй ещё раз</p>
      <Button className="startup-gate__retry" onClick={onRetry}>
        Повторить
      </Button>
      <button type="button" className="startup-gate__link" onClick={onSignOut}>
        Выйти
      </button>
    </div>
  </main>
)
