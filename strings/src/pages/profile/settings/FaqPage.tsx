import ArrowBackIcon from '../../../assets/components/arrowBack'
import { usePageSwipeRight } from '../../../shared/lib/usePageSwipeRight'
import './faq-page.css'

const FAQ_ITEMS = [
  {
    question: 'Как изменить фото профиля?',
    answer:
      'Открой редактирование профиля, нажми на аватар и выбери фото из галереи или сделай снимок. После обрезки сохрани изменения.',
  },
  {
    question: 'Кто видит мой профиль?',
    answer:
      'Профиль доступен авторизованным пользователям сообщества Центрального университета в пределах функций приложения «Нити».',
  },
  {
    question: 'Как связаться с поддержкой?',
    answer:
      'В настройках выбери «Написать в поддержку» и скопируй почту. Ответ обычно приходит в течение 48 часов в рабочее время.',
  },
]

export const FaqPage = () => {
  const { rootRef, rootClassName, navigateBack } = usePageSwipeRight({
    backTo: '/profile/settings',
  })

  return (
    <main ref={rootRef} className={`faq-page ${rootClassName}`}>
      <div className="faq-page__scroll">
        <header className="faq-page__header">
          <button
            type="button"
            className="faq-page__back"
            onClick={() => navigateBack()}
            aria-label="Назад"
          >
            <ArrowBackIcon />
          </button>
          <h1 className="faq-page__title">Часто задаваемые вопросы</h1>
        </header>

        <div className="faq-page__list">
          {FAQ_ITEMS.map((item) => (
            <article key={item.question} className="faq-page__item">
              <h2 className="faq-page__question">{item.question}</h2>
              <p className="faq-page__answer">{item.answer}</p>
            </article>
          ))}
        </div>
      </div>
    </main>
  )
}
