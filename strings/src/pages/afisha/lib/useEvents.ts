import { useCallback, useEffect, useRef, useState } from 'react'
import { isAuthenticated } from '../../../api/client'
import {
  deleteEventResponse,
  listEvents,
  listMyEventResponses,
  respondToEvent,
  syncEventsFromCu,
} from '../../../api/Events'
import { isEventNotPast, mapApiEventToUi, startOfToday, type Event } from './mapEvent'
import { warmPhotos } from '../../../shared/lib/preloadImages'
import { toUserError } from '../../../shared/lib/userError'

const EVENTS_SYNCED_AT_KEY = 'faculty.eventsSyncedAt'
/** Не дёргать ЦУ на каждый заход на экран */
const EVENTS_SYNC_TTL_MS = 15 * 60 * 1000

/**
 * Мутация мероприятий в одном экране — чтобы соседние живые инстансы хука
 * (превью Афиши под keep-alive) не залипали со старым списком.
 */
const EVENTS_CHANGED_EVENT = 'faculty:events-changed'

const maybeSyncFromCu = async () => {
  try {
    const last = Number(sessionStorage.getItem(EVENTS_SYNCED_AT_KEY) || '0')
    if (Number.isFinite(last) && Date.now() - last < EVENTS_SYNC_TTL_MS) return
    await syncEventsFromCu()
    sessionStorage.setItem(EVENTS_SYNCED_AT_KEY, String(Date.now()))
  } catch {
    // список всё равно покажем из БД; sync — best-effort
  }
}

export type ToggleAttendanceResult =
  | { ok: true; isAttending: boolean }
  | { ok: false; reason: 'busy' | 'unknown' }

export const useEvents = () => {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(() => isAuthenticated())
  const [error, setError] = useState<string | null>(null)
  const attendanceBusyRef = useRef(new Set<string>())
  const eventsRef = useRef(events)
  eventsRef.current = events
  /** Свой инстанс — чтобы не перезагружаться на собственное же уведомление */
  const instanceRef = useRef({})
  /**
   * Оптимистичные статусы «Я иду»: фоновый рефреш приходит со старым срезом
   * с бэка и без этого откатывает только что нажатую кнопку.
   */
  const attendanceOverridesRef = useRef(new Map<string, boolean>())

  const applyAttendanceOverrides = useCallback((list: Event[]) => {
    const overrides = attendanceOverridesRef.current
    if (!overrides.size) return list
    return list.map((e) => {
      const override = overrides.get(e.id)
      if (override == null) return e
      // Бэк догнал наш статус — локальная перебивка больше не нужна
      if (override === e.isAttending) {
        overrides.delete(e.id)
        return e
      }
      return { ...e, isAttending: override }
    })
  }, [])

  const refetch = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false

      if (!isAuthenticated()) {
        setEvents([])
        if (!silent) setLoading(false)
        return []
      }

      if (!silent) {
        setLoading(true)
        setError(null)
      }

      try {
        // Список из БД сначала — sync с ЦУ в фоне (иначе native часто падает по таймауту)
        const [all, attending] = await Promise.all([listEvents(), listMyEventResponses()])
        const attendingIds = new Set(attending.map((e) => e.id))
        const today = startOfToday()

        const mapped = all
          .map((e) => mapApiEventToUi(e, attendingIds))
          .filter((e) => isEventNotPast(e, today))
          .sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime())

        // Текст + фото готовы — только потом снимаем скелетон
        await warmPhotos(mapped.map((e) => e.image))
        const nextEvents = applyAttendanceOverrides(mapped)
        setEvents(nextEvents)
        // Тихая синхронизация тоже снимает баннер ошибки: иначе после удачной
        // фоновой загрузки список показан, а «не удалось загрузить» висит сверху
        setError(null)

        // Фоновая догрузка нужна только на «живом» заходе на экран
        if (!silent) {
          void maybeSyncFromCu().then(async () => {
            try {
              const [freshAll, freshAttending] = await Promise.all([
                listEvents(),
                listMyEventResponses(),
              ])
              const freshIds = new Set(freshAttending.map((e) => e.id))
              const refreshed = freshAll
                .map((e) => mapApiEventToUi(e, freshIds))
                .filter((e) => isEventNotPast(e, today))
                .sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime())
              await warmPhotos(refreshed.map((e) => e.image))
              setEvents(applyAttendanceOverrides(refreshed))
            } catch {
              // оставляем уже показанный список
            }
          })
        }

        return nextEvents
      } catch (err) {
        // Фон: молча оставляем то, что уже показано
        if (silent) return eventsRef.current
        setError(toUserError(err, 'Не удалось загрузить. Проверь связь'))
        setEvents([])
        return []
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [applyAttendanceOverrides],
  )

  useEffect(() => {
    void refetch()
  }, [refetch])

  useEffect(() => {
    const onChanged = (e: CustomEvent<unknown>) => {
      // Своя же мутация — состояние уже обновлено оптимистично
      if (e.detail === instanceRef.current) return
      void refetch({ silent: true })
    }
    window.addEventListener(EVENTS_CHANGED_EVENT, onChanged as EventListener)
    return () => window.removeEventListener(EVENTS_CHANGED_EVENT, onChanged as EventListener)
  }, [refetch])

  const toggleAttendance = useCallback(
    async (eventId: string, fallbackIsAttending?: boolean): Promise<ToggleAttendanceResult> => {
      const current = eventsRef.current.find((e) => e.id === eventId)
      const wasAttending = current?.isAttending ?? fallbackIsAttending
      if (wasAttending == null) return { ok: false, reason: 'unknown' }
      if (attendanceBusyRef.current.has(eventId)) return { ok: false, reason: 'busy' }
      attendanceBusyRef.current.add(eventId)

      const next = !wasAttending
      attendanceOverridesRef.current.set(eventId, next)
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, isAttending: next } : e)),
      )

      try {
        if (next) await respondToEvent(eventId)
        else await deleteEventResponse(eventId)
        window.dispatchEvent(
          new CustomEvent(EVENTS_CHANGED_EVENT, { detail: instanceRef.current }),
        )
        return { ok: true, isAttending: next }
      } catch (err) {
        attendanceOverridesRef.current.delete(eventId)
        setEvents((prev) =>
          prev.map((e) => (e.id === eventId ? { ...e, isAttending: wasAttending } : e)),
        )
        throw err
      } finally {
        attendanceBusyRef.current.delete(eventId)
      }
    },
    [],
  )

  return { events, loading, error, refetch, toggleAttendance }
}
