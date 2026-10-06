/**
 * Мутация объявлений в одном экране — чтобы соседние живые инстансы
 * (превью Афиши и страница объявлений под keep-alive, раздел объявлений
 * в профиле) не залипали со старым списком.
 *
 * detail — «кто изменил»: свой же инстанс пропускает событие, у него состояние
 * уже обновлено оптимистично.
 */
export const POSTS_CHANGED_EVENT = 'faculty:posts-changed'

export const emitPostsChanged = (source: unknown): void => {
  window.dispatchEvent(new CustomEvent(POSTS_CHANGED_EVENT, { detail: source }))
}

export const subscribePostsChanged = (handler: (source: unknown) => void): (() => void) => {
  const listener = (event: Event) => handler((event as CustomEvent<unknown>).detail)
  window.addEventListener(POSTS_CHANGED_EVENT, listener)
  return () => window.removeEventListener(POSTS_CHANGED_EVENT, listener)
}

/**
 * Список скрытых авторов изменился (скрытие из жалобы, разблокировка в
 * настройках): все экраны с объявлениями обязаны перефильтроваться сразу,
 * не дожидаясь перезагрузки. Событие шлёт notifyHiddenAuthorsChanged
 * (shared/lib/hiddenPostAuthors) и модалка объявления.
 */
export const HIDDEN_AUTHORS_EVENT = 'faculty:hidden-authors-changed'

export const subscribeHiddenAuthorsChanged = (handler: () => void): (() => void) => {
  window.addEventListener(HIDDEN_AUTHORS_EVENT, handler)
  return () => window.removeEventListener(HIDDEN_AUTHORS_EVENT, handler)
}
