import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { FiChevronRight } from 'react-icons/fi'
import { useProfile } from '../../shared/lib/useProfile'
import { toUserError } from '../../shared/lib/userError'
import { getDaysLeft, getDaysText } from '../../pages/afisha/lib/announcementTtl'
import type { Announcement } from '../../pages/afisha/lib/mapAnnouncement'
import { AnnouncementModal } from '../announcement-modal/AnnouncementModal'
import { AnnouncementRespondents } from '../announcement-card/AnnouncementRespondents'
import { AnnouncementTimerBadge } from '../announcement-card/AnnouncementTimerBadge'
import { useProfileAnnouncements } from './useProfileAnnouncements'
import './profile-announcements.css'

type Props = {
  /** Чей профиль открыт: свой (profile.id) или чужой (:userId из маршрута) */
  userId: string | null | undefined
}

const showToast = (message: string) => {
  window.dispatchEvent(new CustomEvent('faculty:toast', { detail: message }))
}

/**
 * Раздел «Мои объявления» / «Объявления» внизу профиля: горизонтальная лента
 * актуальных объявлений. Модалка открывается локальным состоянием, без смены
 * URL — закрытие гарантированно возвращает на ту же страницу профиля, с той же
 * позицией скролла, на любом из маршрутов чужого профиля.
 */
export const ProfileAnnouncementsSection = ({ userId }: Props) => {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { profile, loading: meLoading } = useProfile()
  const meId = profile.id
  const isOwn = Boolean(userId && meId && userId === meId)
  const { items, edit, remove, respond, withdraw } = useProfileAnnouncements({
    userId,
    isOwn,
    // Пока свой id неизвестен, isOwn посчитан бы неверно — ждём профиль
    enabled: Boolean(meId) || !meLoading,
  })

  /**
   * Храним само объявление, а не id: после удаления оно исчезает из items, и по
   * id шторка (вместе с диалогом подтверждения) пропала бы из дерева, не доиграв
   * закрытие. Актуальную версию берём из items, снимок — только запасной вариант.
   */
  const [openedSnapshot, setOpenedSnapshot] = useState<Announcement | null>(null)

  /**
   * Ушли с профиля (перешли в профиль автора или откликнувшегося прямо из
   * шторки, переключили таб) — шторку закрываем: страница профиля остаётся
   * смонтированной под keep-alive, а шторка нарисована порталом в body и иначе
   * висела бы поверх новой страницы. Страница объявлений ведёт себя так же:
   * там модалка привязана к URL и на переходе исчезает.
   */
  const [openedAtPath, setOpenedAtPath] = useState(pathname)
  if (openedAtPath !== pathname) {
    setOpenedAtPath(pathname)
    if (openedSnapshot) setOpenedSnapshot(null)
  }

  const opened = openedSnapshot
    ? items.find((item) => item.id === openedSnapshot.id) ?? openedSnapshot
    : null

  const now = new Date()

  return (
    <>
      {/* Пусто (в т.ч. после ошибки загрузки) — раздела нет вовсе */}
      {items.length > 0 && (
        <section className="profile-announcements">
          <h3 className="profile-page__section-title profile-page__section-title--about">
            {isOwn ? 'Мои объявления' : 'Объявления'}
          </h3>

          <div className="profile-announcements__strip">
            {items.map((ann) => (
              <button
                key={ann.id}
                type="button"
                className="profile-announcements__card"
                onClick={() => setOpenedSnapshot(ann)}
              >
                {isOwn && (
                  <AnnouncementTimerBadge text={getDaysText(getDaysLeft(ann.createdAt, now))} />
                )}
                <span className="profile-announcements__card-title">{ann.title}</span>
                {/* Пустое состояние «Никто не откликнулся» — из широкой карточки
                    страницы объявлений; в компактной его нет ни по макету, ни
                    пока откликнувшиеся догружаются вторым запросом */}
                {isOwn && Boolean(ann.respondents?.length) && (
                  <AnnouncementRespondents
                    respondents={ann.respondents}
                    className="profile-announcements__card-respondents"
                  />
                )}
                {!isOwn && ann.isResponded && (
                  <span className="profile-announcements__card-responded">Ты откликнулся</span>
                )}
              </button>
            ))}

            {isOwn && (
              <div className="profile-announcements__more">
                <button
                  type="button"
                  className="profile-announcements__more-btn"
                  aria-label="Перейти к моим объявлениям"
                  onClick={() =>
                    navigate('/afisha/announcements', { state: { announcementsTab: 'created' } })
                  }
                >
                  <FiChevronRight size={24} />
                </button>
                <span className="profile-announcements__more-label">В раздел</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Через портал в body: блок профиля-хозяина висит с постоянным transform
          (.profile-page__enter, animation-fill-mode: both), а он делает себя
          containing block для position: fixed — оверлей шторки перестал бы
          считаться от вьюпорта и уехал бы вместе со скроллом */}
      {opened &&
        createPortal(
          <AnnouncementModal
            announcement={opened}
            isOwn={isOwn}
            onClose={() => setOpenedSnapshot(null)}
            onRespond={() =>
              // Ошибку пробрасываем в модалку: иначе «Отклик отправлен» покажется зря
              respond(opened.id).catch((err) => {
                showToast(toUserError(err, 'Не удалось отправить отклик'))
                throw err
              })
            }
            onWithdraw={() => {
              void withdraw(opened.id).catch((err) => {
                showToast(toUserError(err, 'Не удалось отозвать отклик'))
              })
              setOpenedSnapshot(null)
            }}
            onDelete={() => {
              void remove(opened.id)
                .then(() => setOpenedSnapshot(null))
                .catch((err) => showToast(toUserError(err, 'Не удалось выполнить действие')))
            }}
            onEdit={(updated) => {
              void edit(updated, updated.title, updated.description)
                .then(() => setOpenedSnapshot(null))
                .catch((err) => showToast(toUserError(err, 'Не удалось выполнить действие')))
            }}
          />,
          document.body,
        )}
    </>
  )
}
