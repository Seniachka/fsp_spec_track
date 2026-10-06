import { useCallback, useEffect, useRef, useState } from 'react'
import { isAuthenticated } from '../../api/client'
import {
  deletePost,
  deletePostResponse,
  listMyPostResponses,
  listMyPosts,
  listPostResponders,
  listPosts,
  respondToPost,
  updatePost,
} from '../../api/Announcements'
import type { ApiPost } from '../../api/types'
import { listHiddenPostAuthors } from '../../shared/lib/hiddenPostAuthors'
import { warmUserPhotos } from '../../shared/lib/preloadImages'
import {
  emitPostsChanged,
  subscribeHiddenAuthorsChanged,
  subscribePostsChanged,
} from '../../pages/afisha/lib/announcementEvents'
import { isActualAnnouncement } from '../../pages/afisha/lib/announcementTtl'
import {
  mapApiPostToUi,
  mapUserToRespondent,
  type Announcement,
  type AnnouncementRespondent,
} from '../../pages/afisha/lib/mapAnnouncement'

/**
 * Эндпойнта «объявления пользователя X» на бэке нет: чужие объявления
 * приходится доставать из общей ленты и фильтровать по автору. limit у
 * /api/posts — 100, поэтому листаем страницами; потолок на случай, если бэк
 * когда-нибудь начнёт отдавать полную страницу бесконечно.
 *
 * Глубина обхода ограничена самим бэком: GET /api/posts отдаёт только живые
 * объявления (repository/post.go, postActiveCondition: created_at + 7 суток >
 * now()), то есть максимум неделю публикаций, а не всю историю. Плюс лента
 * тянется один раз на открытие профиля: на faculty:posts-changed чужой раздел
 * обновляет только свои отклики (см. refreshResponded).
 */
const FEED_PAGE_LIMIT = 100
const FEED_MAX_PAGES = 10

const byCreatedDesc = (a: Announcement, b: Announcement) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()

const loadFeedPages = async (): Promise<ApiPost[]> => {
  const collected: ApiPost[] = []
  for (let page = 0; page < FEED_MAX_PAGES; page += 1) {
    const chunk = await listPosts({ limit: FEED_PAGE_LIMIT, offset: page * FEED_PAGE_LIMIT })
    collected.push(...chunk)
    if (chunk.length < FEED_PAGE_LIMIT) break
  }
  return collected
}

type Params = {
  /** Чей профиль открыт */
  userId: string | null | undefined
  /** Свой профиль — грузим /api/me/posts и показываем срок */
  isOwn: boolean
  /** Пока неизвестно, кто смотрит — не грузим (иначе isOwn посчитан неверно) */
  enabled?: boolean
}

/**
 * Объявления для раздела в профиле: только актуальные (не архив, младше TTL).
 * Ошибка загрузки = пустой список: раздел просто не рендерится.
 */
export const useProfileAnnouncements = ({ userId, isOwn, enabled = true }: Params) => {
  const [items, setItems] = useState<Announcement[]>([])
  /** Свой инстанс — чтобы не перезагружаться на собственное же уведомление */
  const instanceRef = useRef({})
  /** Номер актуального запроса: ответ отменённого не должен перетирать состояние */
  const runIdRef = useRef(0)

  const load = useCallback(async () => {
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    const isStale = () => runIdRef.current !== runId

    if (!enabled || !userId || !isAuthenticated()) {
      setItems([])
      return
    }

    // Заблокированный автор скрыт везде, где показываются его объявления
    if (!isOwn && listHiddenPostAuthors().has(userId)) {
      setItems([])
      return
    }

    try {
      const now = new Date()

      if (isOwn) {
        const posts = await listMyPosts({ limit: FEED_PAGE_LIMIT, offset: 0 })
        if (isStale()) return
        const mapped = posts
          .map((post) => ({ ...mapApiPostToUi(post), isOwn: true }))
          .filter((ann) => isActualAnnouncement(ann, now))
          .sort(byCreatedDesc)
        setItems(mapped)

        // Откликнувшиеся — вторым проходом: строка «3 откликнулись» под заголовком.
        // Мержим по id, пока грузились — список мог измениться (удаление/правка).
        void Promise.all(
          mapped.map(async (ann) => {
            try {
              const users = await listPostResponders(ann.id)
              void warmUserPhotos(users)
              return { id: ann.id, respondents: users.map(mapUserToRespondent) }
            } catch {
              return { id: ann.id, respondents: [] as AnnouncementRespondent[] }
            }
          }),
        ).then((loaded) => {
          if (isStale()) return
          const byId = new Map(loaded.map((entry) => [entry.id, entry.respondents]))
          setItems((prev) =>
            prev.map((ann) => {
              const respondents = byId.get(ann.id)
              return respondents ? { ...ann, respondents } : ann
            }),
          )
        })
        return
      }

      const [feed, myResponses] = await Promise.all([
        loadFeedPages(),
        listMyPostResponses().catch(() => [] as ApiPost[]),
      ])
      if (isStale()) return
      const respondedIds = new Set(myResponses.map((post) => post.id))
      const mapped = feed
        .filter((post) => post.author?.id === userId)
        .map((post) => mapApiPostToUi(post, { respondedIds }))
        .filter((ann) => isActualAnnouncement(ann, now))
        .sort(byCreatedDesc)
      setItems(mapped)
    } catch (err) {
      if (isStale()) return
      // Раздел просто не показываем — пустого состояния в макете нет
      console.warn('[profile-announcements] не удалось загрузить объявления', err)
      setItems([])
    }
  }, [enabled, isOwn, userId])

  /**
   * Чужой профиль: чужие объявления сами по себе не меняются от того, что мы
   * что-то сделали на Афише — меняется только «откликнулся ли я». Обновляем
   * один флаг вместо повторного обхода всей ленты.
   */
  const refreshResponded = useCallback(async () => {
    try {
      const myResponses = await listMyPostResponses()
      const respondedIds = new Set(myResponses.map((post) => post.id))
      setItems((prev) =>
        prev.map((ann) =>
          ann.isResponded === respondedIds.has(ann.id)
            ? ann
            : { ...ann, isResponded: respondedIds.has(ann.id) },
        ),
      )
    } catch (err) {
      console.warn('[profile-announcements] не удалось обновить отклики', err)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      // Размонтирование / смена профиля: ответы в полёте больше не наши
      runIdRef.current += 1
    }
  }, [load])

  useEffect(() =>
    subscribePostsChanged((source) => {
      if (source === instanceRef.current) return
      if (!isOwn) {
        void refreshResponded()
        return
      }
      void load()
    }),
  [isOwn, load, refreshResponded])

  // «Скрыть автора» из жалобы (и обратная разблокировка в настройках): раздел
  // обязан перестать показывать его объявления сразу, а не после перезахода
  useEffect(() => subscribeHiddenAuthorsChanged(() => void load()), [load])

  const edit = useCallback(async (ann: Announcement, title: string, content: string) => {
    const updated = await updatePost(ann.id, {
      title,
      content: content.trim() || '—',
      isArchived: Boolean(ann.isArchived),
    })
    const mapped: Announcement = {
      ...mapApiPostToUi(updated),
      description: content.trim(),
      isOwn: true,
      respondents: ann.respondents ?? [],
    }
    setItems((prev) => prev.map((item) => (item.id === ann.id ? mapped : item)))
    emitPostsChanged(instanceRef.current)
    return mapped
  }, [])

  const remove = useCallback(async (id: string) => {
    await deletePost(id)
    setItems((prev) => prev.filter((item) => item.id !== id))
    emitPostsChanged(instanceRef.current)
  }, [])

  const respond = useCallback(async (id: string) => {
    await respondToPost(id)
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isResponded: true } : item)),
    )
    emitPostsChanged(instanceRef.current)
  }, [])

  const withdraw = useCallback(async (id: string) => {
    await deletePostResponse(id)
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isResponded: false } : item)),
    )
    emitPostsChanged(instanceRef.current)
  }, [])

  return { items, edit, remove, respond, withdraw }
}
