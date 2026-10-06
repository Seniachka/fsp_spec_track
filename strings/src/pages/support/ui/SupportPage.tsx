import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ArrowBackIcon from '../../../assets/components/arrowBack'
import { usePageSwipeRight } from '../../../shared/lib/usePageSwipeRight'
import { Toast } from '../../../shared/ui/toast/Toast'
import type { LegalDocId } from '../../legal/model/legalDocuments'
import './support-page.css'

const SUPPORT_EMAIL = 'niti-uni@yandex.ru'

const LEGAL_LINKS: Array<{ id: LegalDocId; label: string }> = [
  { id: 'terms', label: 'Пользовательское соглашение и правила сообщества' },
  { id: 'privacy', label: 'Политика конфиденциальности' },
  { id: 'consent', label: 'Согласие на обработку персональных данных' },
]

/**
 * Публичная страница поддержки: открывается без авторизации, в том числе из
 * браузера по прямой ссылке — на неё ссылаются документы и карточка в сторе.
 */
export const SupportPage = () => {
  const navigate = useNavigate()
  const [toast, setToast] = useState<string | null>(null)

  const { rootRef, rootClassName, navigateBack } = usePageSwipeRight({
    backTo: '/',
    onEdgeSwipeBack: () => navigate('/', { replace: true }),
  })

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL)
      setToast('Почта скопирована')
    } catch {
      setToast('Не удалось скопировать')
    }
  }

  return (
    <main ref={rootRef} className={`support-page ${rootClassName}`}>
      <div className="support-page__scroll">
        <header className="support-page__header">
          <button
            type="button"
            className="support-page__back"
            onClick={() => navigateBack()}
            aria-label="Назад"
          >
            <ArrowBackIcon />
          </button>
          <h1 className="support-page__title">Поддержка</h1>
        </header>

        <section className="support-page__block">
          <h2 className="support-page__subtitle">Написать нам</h2>
          <p className="support-page__text">
            Не работает вход, что-то сломалось или нужно удалить данные — напиши на почту ниже.
          </p>
          <button type="button" className="support-page__email" onClick={() => void copyEmail()}>
            {SUPPORT_EMAIL}
          </button>
          <p className="support-page__note">Отвечаем в течение 48 часов в рабочие дни.</p>
        </section>

        <section className="support-page__block">
          <h2 className="support-page__subtitle">Как пожаловаться на пользователя или объявление</h2>
          <p className="support-page__text">
            На профиле пользователя нажми иконку с восклицательным знаком в треугольнике в правом
            верхнем углу и выбери «Пожаловаться» — там же можно заблокировать человека. У объявления
            такая же иконка находится слева в шапке открытой карточки.
          </p>
          <p className="support-page__note">
            Жалобы на оскорбительный или противоправный контент рассматриваем в течение 24 часов.
          </p>
        </section>

        <section className="support-page__block">
          <h2 className="support-page__subtitle">Документы</h2>
          <ul className="support-page__links">
            {LEGAL_LINKS.map((link) => (
              <li key={link.id}>
                <button
                  type="button"
                  className="support-page__link"
                  onClick={() => navigate(`/legal/${link.id}`)}
                >
                  {link.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </main>
  )
}
