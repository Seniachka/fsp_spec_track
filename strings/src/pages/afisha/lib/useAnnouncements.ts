import { useCallback, useEffect, useRef, useState } from 'react'
import { isAuthenticated } from '../../../api/client'
import {
  createPost,
  deletePost,
  deletePostResponse,
  listMyPostResponses,
  listMyPosts,
  listPostResponders,
  listPosts,
  respondToPost,
  updatePost,
} from '../../../api/Announcements'
import { listBlockedUsers } from '../../../api/BlockedUsers'
import { getMe } from '../../../api/Me'
import type { UserProfile } from '../../../api/types'
import { prefetchOtherProfiles } from '../../../entities/profile/lib/prefetchOtherProfiles'
import { hidePostAuthor, listHiddenPostAuthors } from '../../../shared/lib/hiddenPostAuthors'
import {
  mapApiPostToUi,
  mapUserToRespondent,
  type Announcement,
  type AnnouncementRespondent,
} from './mapAnnouncement'
import {
  emitPostsChanged,
  subscribeHiddenAuthorsChanged,
  subscribePostsChanged,
} from './announcementEvents'
import { POST_TTL_DAYS } from './announcementTtl'
import { warmUserPhotos } from '../../../shared/lib/preloadImages'
import { toUserError } from '../../../shared/lib/userError'

const collectAuthorsForPrefetch = (
  posts: Array<{ author: UserProfile | null }>,
  myId: string | null,
) => {
  const byId = new Map<string, UserProfile>()
  for (const post of posts) {
    const author = post.author
    if (!author?.id || author.id === myId) continue
    byId.set(author.id, author)
  }
  return [...byId.values()].map((user) => ({
    user,
    isSaved: false,
    isContact: false,
    note: '',
  }))
}

export const useAnnouncements = () => {
  const [feed, setFeed] = useState<Announcement[]>([])
  const [mine, setMine] = useState<Announcement[]>([])
  const [responded, setResponded] = useState<Announcement[]>([])
  const [meId, setMeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(() => isAuthenticated())
  const [error, setError] = useState<string | null>(null)
  /** Свой инстанс — чтобы не перезагружаться на собственное же уведомление */
  const instanceRef = useRef({})

  const applyHiddenFilter = useCallback((items: Announcement[]) => {
    const hidden = listHiddenPostAuthors()
    if (!hidden.size) return items
    return items.filter((a) => !hidden.has(a.author.id))
  }, [])

  const notifyChanged = useCallback(() => {
    emitPostsChanged(instanceRef.current)
  }, [])

  /** silent — фоновая синхронизация: без скелетона и без сброса списка на ошибке */
  const refetch = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false

    if (!isAuthenticated()) {
      setFeed([])
      setMine([])
      setResponded([])
      if (!silent) setLoading(false)
      return
    }

    if (!silent) {
      setLoading(true)
      setError(null)
    }

    try {
      const me = await getMe()
      const myId = me?.id ?? null
      setMeId(myId)

      const [posts, myPosts, myResponses, blocked] = await Promise.all([
        listPosts(),
        listMyPosts(),
        listMyPostResponses(),
        listBlockedUsers({ limit: 100, offset: 0 }).catch(() => []),
      ])

      for (const user of blocked) {
        hidePostAuthor(user.id)
      }

      const respondedIds = new Set(myResponses.map((p) => p.id))

      const mappedFeed = applyHiddenFilter(
        posts
          .map((p) => mapApiPostToUi(p, { meId: myId, respondedIds }))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      )

      const mappedMine = myPosts
        .map((p) => mapApiPostToUi(p, { meId: myId, respondedIds }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      const mappedResponded = applyHiddenFilter(
        myResponses
          .map((p) => mapApiPostToUi(p, { meId: myId, respondedIds }))
          .map((a) => ({ ...a, isResponded: true }))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      )

      // Как в Нитях: сначала аватары из IndexedDB, потом докачка; затем снимаем скелетон.
      // Именно warmUserPhotos (а не warmPhotos по одним URL): он привязывает кадр
      // к userId — иначе у авторов не появляется ни ключ userId → фото, ни превью
      // в localStorage, и в следующем ответе с пустым photoUrl (редактура блокировки,
      // сбой подписи в S3) автор с фото падает в заглушку.
      const authorPhotos = [...mappedFeed, ...mappedMine, ...mappedResponded].map((a) => ({
        id: a.author.id,
        photoUrl: a.author.avatar,
      }))
      await warmUserPhotos(authorPhotos)
      setFeed(mappedFeed)
      setMine(mappedMine.map((a) => ({ ...a, isOwn: true, respondents: [] as AnnouncementRespondent[] })))
      setResponded(mappedResponded)
      // Тихая синхронизация тоже снимает баннер ошибки: иначе после удачной
      // фоновой загрузки список показан, а «не удалось загрузить» висит сверху
      setError(null)
      if (!silent) setLoading(false)

      void prefetchOtherProfiles(
        collectAuthorsForPrefetch([...posts, ...myPosts, ...myResponses], myId),
        { concurrency: 4, skipIfCached: true },
      )

      void Promise.all(
        mappedMine.map(async (ann) => {
          try {
            const users = await listPostResponders(ann.id)
            void warmUserPhotos(users)
            void prefetchOtherProfiles(
              users
                .filter((u) => u.id && u.id !== myId)
                .map((user) => ({
                  user,
                  isSaved: false,
                  isContact: false,
                  note: '',
                })),
              { concurrency: 4, skipIfCached: true },
            )
            return { ...ann, respondents: users.map(mapUserToRespondent), isOwn: true }
          } catch {
            return { ...ann, respondents: [] as AnnouncementRespondent[], isOwn: true }
          }
        }),
      ).then((withRespondents) => {
        // Мержим по id: пока грузились откликнувшиеся, список мог измениться
        // (создание/редактирование/удаление) — целиком его затирать нельзя
        const byId = new Map(withRespondents.map((a) => [a.id, a]))
        setMine((prev) =>
          prev.map((a) => {
            const loaded = byId.get(a.id)
            return loaded ? { ...a, respondents: loaded.respondents } : a
          }),
        )
      })
    } catch (err) {
      // Фон: молча оставляем то, что уже показано
      if (silent) return
      setError(toUserError(err, 'Не удалось загрузить. Проверь связь'))
      setFeed([])
      setMine([])
      setResponded([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [applyHiddenFilter])

  useEffect(() => {
    void refetch()
  }, [refetch])

  useEffect(() =>
    subscribePostsChanged((source) => {
      // Своя же мутация — состояние уже обновлено оптимистично
      if (source === instanceRef.current) return
      void refetch({ silent: true })
    }),
  [refetch])

  useEffect(() =>
    subscribeHiddenAuthorsChanged(() => {
      setFeed((prev) => applyHiddenFilter(prev))
      setResponded((prev) => applyHiddenFilter(prev))
    }),
  [applyHiddenFilter])

  const create = useCallback(
    async (title: string, content: string) => {
      const post = await createPost({
        title,
        content: content.trim() || '—',
      })
      const mapped = mapApiPostToUi(post, { meId, respondedIds: new Set() })
      const withOwn = {
        ...mapped,
        description: content.trim(),
        isOwn: true,
        respondents: [],
      }
      setMine((prev) => [withOwn, ...prev])
      setFeed((prev) => [withOwn, ...prev])
      notifyChanged()
      return withOwn
    },
    [meId, notifyChanged],
  )

  const edit = useCallback(
    async (ann: Announcement, title: string, content: string) => {
      const updated = await updatePost(ann.id, {
        title,
        content: content.trim() || '—',
        isArchived: Boolean(ann.isArchived),
      })
      const mapped = {
        ...mapApiPostToUi(updated, { meId, respondedIds: new Set() }),
        description: content.trim(),
        isOwn: true,
        respondents: ann.respondents ?? [],
      }
      setMine((prev) => prev.map((a) => (a.id === ann.id ? mapped : a)))
      setFeed((prev) => prev.map((a) => (a.id === ann.id ? mapped : a)))
      notifyChanged()
      return mapped
    },
    [meId, notifyChanged],
  )

  const remove = useCallback(
    async (id: string) => {
      await deletePost(id)
      setMine((prev) => prev.filter((a) => a.id !== id))
      setFeed((prev) => prev.filter((a) => a.id !== id))
      setResponded((prev) => prev.filter((a) => a.id !== id))
      notifyChanged()
    },
    [notifyChanged],
  )

  const respond = useCallback(
    async (id: string) => {
      await respondToPost(id)
      setFeed((prev) => prev.map((a) => (a.id === id ? { ...a, isResponded: true } : a)))
      const fromFeed = feed.find((a) => a.id === id) || mine.find((a) => a.id === id)
      if (fromFeed) {
        setResponded((prev) => [
          { ...fromFeed, isResponded: true },
          ...prev.filter((a) => a.id !== id),
        ])
      }
      notifyChanged()
      // best-effort sync with backend truth — silent, иначе весь список мигает скелетоном.
      // Не await: модалка ждёт respond(), чтобы показать «Отклик отправлен», и полный
      // перезапрос списков задержал бы экран успеха на все эти запросы.
      // Ветка «объявления нет в feed/mine» (открыто по прямой ссылке) закрывается этим
      // же перезапросом — отдельный await-refetch был его точным дублем.
      void refetch({ silent: true }).catch(() => {})
    },
    [feed, mine, refetch, notifyChanged],
  )

  const withdraw = useCallback(
    async (id: string) => {
      await deletePostResponse(id)
      setResponded((prev) => prev.filter((a) => a.id !== id))
      setFeed((prev) => prev.map((a) => (a.id === id ? { ...a, isResponded: false } : a)))
      notifyChanged()
      // best-effort sync with backend truth — silent, иначе весь список мигает скелетоном
      void refetch({ silent: true }).catch(() => {})
    },
    [refetch, notifyChanged],
  )

  const republish = useCallback(
    async (ann: Announcement) => {
      const updated = await updatePost(ann.id, {
        title: ann.title,
        content: ann.description.trim() || '—',
        isArchived: false,
      })
      const fromApi = mapApiPostToUi(updated, { meId, respondedIds: new Set() })
      // Группировка АКТУАЛЬНЫЕ/АРХИВ считает возраст от createdAt. Если бэк не
      // обновил дату при снятии из архива, объявление тут же вернулось бы в
      // АРХИВ — отсчитываем 7 дней заново локально.
      const createdMs = new Date(fromApi.createdAt).getTime()
      const stillExpired =
        !Number.isFinite(createdMs) ||
        Date.now() - createdMs >= POST_TTL_DAYS * 24 * 3600 * 1000
      const mapped = {
        ...fromApi,
        createdAt: stillExpired ? new Date().toISOString() : fromApi.createdAt,
        description: ann.description,
        isOwn: true,
        respondents: ann.respondents ?? [],
        isArchived: false,
      }
      setMine((prev) => [mapped, ...prev.filter((a) => a.id !== ann.id)])
      setFeed((prev) => {
        const without = prev.filter((a) => a.id !== ann.id)
        return [mapped, ...without]
      })
      notifyChanged()
    },
    [meId, notifyChanged],
  )

  return {
    feed,
    mine,
    responded,
    meId,
    loading,
    error,
    refetch,
    create,
    edit,
    remove,
    respond,
    withdraw,
    republish,
  }
}
