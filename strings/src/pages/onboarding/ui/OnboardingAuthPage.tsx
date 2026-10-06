import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import {
  exchangeCallback,
  mapActivePageToStep,
  openCuAuthPopup,
  resetSession,
  resendOtp,
  startAuth,
  submitOtp,
  submitPassword,
  submitUsername,
  subscribeCuAuthMessage,
  type AuthStepResult,
  type CuAuthSession,
} from '../../../api/auth'
import {
  adminLogin,
  checkAdminLogin,
  type AdminLoginProbe,
  type AdminLoginResponse,
} from '../../../api/AdminAuth'
import {
  ApiRequestError,
  applyAuthFromEnv,
  clearAuth,
  clearLocalAuth,
  getBffToken,
  getDevBffFromEnv,
  isAuthenticated,
  setBffToken,
} from '../../../api/client'
import { getMe, recordConsent, resetGetMeInflight, restoreMe } from '../../../api/Me'
import type { UserProfile } from '../../../api/types'
import { registerStudent } from '../../../api/Students'
import { useProfile } from '../../../shared/lib/useProfile'
import ArrowBackIcon from '../../../assets/components/arrowBack'
import { Button } from '../../../shared/ui/button/Button'
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/ConfirmDialog'
import { FieldInput } from '../../../shared/ui/input/FieldInput'
import { Toast } from '../../../shared/ui/toast/Toast'
import { maskPhoneNumber } from '../../../shared/lib/maskPhone'
import { toUserError } from '../../../shared/lib/userError'
import {
  DEFAULT_KEYBOARD_RESIZE,
  getNativeKeyboardHeight,
  isNativeKeyboardResizeControllable,
  setNativeKeyboardResize,
  setNativeKeyboardScroll,
  subscribeNativeKeyboardHeight,
} from '../../../shared/lib/nativeKeyboard'
import { clearOnboardingCompleted, setOnboardingCompleted } from '../model/onboardingStorage'
import { resolvePostAuthPath } from '../../../shared/lib/appLinks'
import { ensureStorageOwner } from '../../../shared/lib/userScopedStorage'
import type { LegalDocId } from '../../legal/model/legalDocuments'
import { LEGAL_REVISION } from '../../legal/model/legalVersion'
import {
  isServerConsentCurrent,
  needsConsent,
  rememberConsentLocally,
} from '../../legal/model/consentStorage'
import { FormalitiesSheet } from '../../welcome/ui/FormalitiesSheet'
import { LegalDocSheet } from '../../welcome/ui/LegalDocSheet'
import './onboarding-auth.css'

type AuthStep = 'email' | 'password' | 'sms'

/**
 * Модификатор «мало места»: блок с заголовком и островом не помещается в область
 * над клавиатурой. Раньше эту роль играл @media (max-height: 520px) — он работал
 * потому, что вебвью ужимался под клавиатуру. Теперь вьюпорт постоянный, и решение
 * принимает JS по реально доступной высоте (см. эффект расчёта сдвига).
 */
const COMPACT_CLASS = 'onboarding-auth--compact'

/**
 * Запас между низом кнопки «Продолжить» и верхней кромкой клавиатуры. Держим
 * видимыми только поле ввода и эту кнопку — всё, что ниже (ссылка на вход через
 * браузер, подсказка про VPN), клавиатура может закрыть.
 */
const KEEP_VISIBLE_GAP = 12

/**
 * Пауза перед переходом в resize: none после скрытия клавиатуры. Плагин на iOS
 * восстанавливает кадр вебвью отложенно (Keyboard.m: setKeyboardHeight:0 delay:0.01
 * → _updateFrame), а в режиме none восстанавливать его уже некому — переключаемся
 * заведомо после того, как кадр вернулся на место.
 */
const KEYBOARD_MODE_SWITCH_DELAY_MS = 200

const ADMIN_PROBE_TIMEOUT_MS = 8000

/** Паузы между повторами проверки логина — итого три попытки. */
const ADMIN_PROBE_BACKOFF_MS = [500, 1500]

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/**
 * Тестовый (админский) это логин или обычный. Каждую попытку отменяем по своему
 * таймауту (AbortController + короткий нативный таймаут), а не бросаем: брошенный
 * запрос держал единственный слот нативной HTTP-очереди и тормозил getMe после входа.
 *
 * Возвращаем три состояния. 'error' обязателен: раньше сбой сети выглядел как
 * «обычный логин», и пароль тестового аккаунта уходил в Keycloak ЦУ.
 */
const probeAdminLogin = async (login: string): Promise<AdminLoginProbe> => {
  const trimmed = login.trim()
  if (!trimmed) return 'not-admin'

  for (let attempt = 0; attempt <= ADMIN_PROBE_BACKOFF_MS.length; attempt++) {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), ADMIN_PROBE_TIMEOUT_MS)
    let result: AdminLoginProbe
    try {
      result = await checkAdminLogin(trimmed, {
        signal: controller.signal,
        nativeTimeoutMs: ADMIN_PROBE_TIMEOUT_MS,
      })
    } finally {
      window.clearTimeout(timeoutId)
    }
    if (result !== 'error') return result

    const backoff = ADMIN_PROBE_BACKOFF_MS[attempt]
    if (backoff != null) await wait(backoff)
  }

  return 'error'
}

const AUTH_NOT_READY = 'Не удалось подготовить вход. Попробуй ещё раз'

const SMS_CODE_TTL_SEC = 120

/** Фоновый поллинг браузерного входа — предохранитель, webview по нему НЕ закрываем. */
const AUTH_POLL_MAX_MS = 10 * 60_000

/**
 * 403 «аккаунт удалён». Бэкенд присылает code=account_deleted; 403 с другим кодом
 * (например, forbidden на чужой ресурс) за удаление не считаем — иначе любой запрет
 * показал бы диалог отмены удаления. 403 без кода оставлен для старого бэкенда.
 */
const isAccountDeletedError = (err: unknown): boolean =>
  err instanceof ApiRequestError &&
  (err.code === 'account_deleted' ||
    /account.?deleted/i.test(err.message) ||
    (err.status === 403 && !err.code))

/** Сколько живёт удалённый аккаунт, если бэкенд не прислал purgeAt. */
const PURGE_WINDOW_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

const readIsoField = (details: Record<string, unknown> | undefined, key: string): string | null => {
  const value = details?.[key]
  return typeof value === 'string' && value.trim() ? value : null
}

/**
 * Когда данные удалят безвозвратно. Берём purgeAt из тела 403; старый бэкенд
 * присылает только deletedAt — тогда считаем сами, а совсем без дат вернём null
 * и покажем «через 30 дней».
 */
const readPurgeAt = (err: unknown): string | null => {
  if (!(err instanceof ApiRequestError)) return null
  const purgeAt = readIsoField(err.details, 'purgeAt')
  if (purgeAt) return purgeAt

  const deletedAt = readIsoField(err.details, 'deletedAt')
  if (!deletedAt) return null
  const parsed = parseISO(deletedAt)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(parsed.getTime() + PURGE_WINDOW_DAYS * DAY_MS).toISOString()
}

/** «20 сентября 2026»; null на пустой или битой дате — вызывающий подставит фолбэк. */
const formatPurgeDate = (value: string | null): string | null => {
  if (!value) return null
  const parsed = parseISO(value)
  if (Number.isNaN(parsed.getTime())) return null
  return format(parsed, 'd MMMM yyyy', { locale: ru })
}

const isExpiredOtpMessage = (message: string | null | undefined): boolean =>
  Boolean(message && /истёк|истек|expired|запроси новый|запросите новый/i.test(message))

export const OnboardingAuthPage = () => {
  const navigate = useNavigate()
  const { refetch, clearCachedProfile } = useProfile()
  const inputRef = useRef<HTMLInputElement>(null)
  /** Рефы нужны только для расчёта сдвига блока под клавиатуру (см. эффект ниже). */
  const shellRef = useRef<HTMLElement>(null)
  const backRef = useRef<HTMLButtonElement>(null)
  const centerRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  /** Обёртка кнопки «Продолжить»: её низ — та отметка, что обязана быть видна. */
  const keepRef = useRef<HTMLDivElement>(null)
  const authSessionRef = useRef<CuAuthSession | null>(null)
  const browserAuthPollRef = useRef<number | null>(null)
  /** Свой in-flight поллинга — чтобы не наслаивать startAuth и не трогать чужой loading */
  const browserAuthPollBusyRef = useRef(false)
  /** Уже были с токеном на маунте — резолвим цель через getMe, без stale /profile */
  const hadTokenOnMountRef = useRef(isAuthenticated())
  const finishingAuthRef = useRef(false)
  const [step, setStep] = useState<AuthStep>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null)
  const [loginAction, setLoginAction] = useState<string | null>(null)
  // Решение «это тестовый аккаунт» принимаем один раз на шаге email и запоминаем:
  // повторная проверка на шаге пароля при сбое сети роняла пароль тестового
  // аккаунта в обычный сабмит в Keycloak ЦУ.
  const [isAdminLogin, setIsAdminLogin] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  /** Дата безвозвратного удаления из тела 403 (null — покажем «через 30 дней»). */
  const [purgeAt, setPurgeAt] = useState<string | null>(null)
  /**
   * Кому и зачем показываем «Формальности»: новому пользователю ЦУ перед register
   * или уже вошедшему аккаунту (в том числе тестовому) без отметки о согласии.
   */
  const [consentMode, setConsentMode] = useState<'register' | 'existing'>('register')
  const consentTargetRef = useRef<{ user: UserProfile; skipLists?: boolean } | null>(null)
  /** Автоповтор startAuth — не больше одного на действие пользователя. */
  const authRetryUsedRef = useRef(false)
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [smsSecondsLeft, setSmsSecondsLeft] = useState(0)
  const [smsEpoch, setSmsEpoch] = useState(0)
  const [resending, setResending] = useState(false)
  const [legalDocId, setLegalDocId] = useState<LegalDocId | null>(null)

  const loadingRef = useRef(loading)
  loadingRef.current = loading

  useEffect(() => {
    if (!import.meta.env.DEV) return
    // Не дергаем /api/me на маунте со stale dev-маркером — только по кнопке входа.
    if (getBffToken() === 'dev-proxy-bff') {
      clearLocalAuth()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on auth mount in dev
  }, [])

  /**
   * Шаг, на котором фокус уже отработал. Именно предыдущий шаг, а не флаг
   * «первый рендер»: под StrictMode layout-эффект на маунте вызывается дважды
   * (эффект → cleanup → эффект), и флаг успел бы сброситься, а поле — получить
   * фокус со второго прохода. Сравнение со шагом от такого прохода не зависит.
   */
  const focusedStepRef = useRef<AuthStep>(step)

  useLayoutEffect(() => {
    // Первый показ экрана (вход с welcome по «Войти через университет», gate,
    // редирект после 401) фокус НЕ ставим: клавиатура должна выезжать только
    // после того, как пользователь сам тапнет по полю.
    if (focusedStepRef.current === step) return
    focusedStepRef.current = step

    // Смена шага (email -> пароль -> СМС и назад): у полей разные key, старое
    // поле размонтируется и роняет фокус. Клавиатура тут уже открыта — её и
    // удерживаем. С таймаутом iOS успевал начать анимацию скрытия клавиатуры и
    // тут же показывал её заново — та самая «прыгающая» клавиатура из видео.
    // В layout-эффекте фокус переезжает в том же кадре, что и удаление старого
    // поля, и клавиатура просто не уходит.
    inputRef.current?.focus({ preventScroll: true })
  }, [step])

  // На iOS WKWebView сам скроллит документ к сфокусированному полю — экран
  // «уезжал» вверх, под ним открывался голый фон. Гасим скролл вебвью только на
  // время жизни этого экрана: глобально его выключать нельзя, документным
  // скроллом живут юрдокументы и поддержка.
  useEffect(() => {
    setNativeKeyboardScroll({ isDisabled: true })
    return () => setNativeKeyboardScroll({ isDisabled: false })
  }, [])

  /**
   * Вычитать ли высоту клавиатуры из вьюпорта самим.
   *
   * true — только на iOS и только после того, как режим ресайза реально стал
   * 'none': вьюпорт тогда постоянный, и место под клавиатурой знаем только мы.
   * false — вьюпорт уже ужат системой (Android: adjustResize + resizeOnFullScreen,
   * setResizeMode там не реализован; iOS до переключения режима) либо клавиатуры
   * нет вовсе (web). Вычесть её там второй раз — выбросить блок за верхнюю кромку.
   */
  const [manualShift, setManualShift] = useState(false)

  // Только на этом экране вебвью не ужимается под клавиатуру: при resize = native
  // вьюпорт менялся скачком, вёрстка пересчитывалась и блок мгновенно перепрыгивал
  // вверх (а на закрытии — вниз). В режиме none вьюпорт постоянен, а блок сам едет
  // трансформом (--auth-shift ниже). Возврат к дефолту обязателен: остальные экраны
  // прижимают кнопки к низу и рассчитывают на ресайз.
  useEffect(() => {
    if (!isNativeKeyboardResizeControllable()) return

    let cancelled = false
    let switchTimeoutId: number | null = null
    let unsubscribe: (() => void) | null = null

    const applyNone = () => {
      if (cancelled) return
      unsubscribe?.()
      unsubscribe = null
      setNativeKeyboardResize('none')
      setManualShift(true)
    }

    // Клавиатура ещё видна (экран открыт редиректом с другого экрана, например
    // после 401): переключаться нельзя — плагин при смене режима кадр вебвью не
    // пересчитывает, и восстановить ужатый кадр в режиме none будет некому.
    // Ждём нулевой высоты и ещё немного сверху (KEYBOARD_MODE_SWITCH_DELAY_MS).
    const scheduleWhenHidden = (keyboardHeight: number) => {
      if (switchTimeoutId != null) {
        window.clearTimeout(switchTimeoutId)
        switchTimeoutId = null
      }
      if (keyboardHeight > 0) return
      switchTimeoutId = window.setTimeout(applyNone, KEYBOARD_MODE_SWITCH_DELAY_MS)
    }

    if (getNativeKeyboardHeight() === 0) {
      applyNone()
    } else {
      unsubscribe = subscribeNativeKeyboardHeight(scheduleWhenHidden)
    }

    return () => {
      cancelled = true
      if (switchTimeoutId != null) window.clearTimeout(switchTimeoutId)
      unsubscribe?.()
      setNativeKeyboardResize(DEFAULT_KEYBOARD_RESIZE)
    }
  }, [])

  // Сдвиг блока «заголовок + остров» под клавиатуру и компактный режим.
  //
  // Сдвиг МИНИМАЛЬНО необходимый: пока поле ввода и кнопка «Продолжить» видны над
  // клавиатурой, блок вообще не двигается. Как только низ кнопки (плюс запас
  // KEEP_VISIBLE_GAP) уходит под клавиатуру — поднимаем ровно на недостающее.
  // В центр оставшейся над клавиатурой области блок НЕ центрируем: на больших
  // экранах это уводило заголовок далеко вверх без нужды. Ссылка «Авторизоваться
  // через браузер» и подсказка про VPN при этом могут уйти под клавиатуру — так и
  // задумано. Предел один: вверх не выше кнопки «назад».
  //
  // Layout-эффект, а не обычный: первый сдвиг применяется до кадра, иначе блок
  // при открытии экрана заметно доезжал бы анимацией.
  useLayoutEffect(() => {
    const shell = shellRef.current
    const center = centerRef.current
    const stack = stackRef.current
    const keep = keepRef.current
    const back = backRef.current
    if (!shell || !center || !stack || !keep || !back) return

    const applyShift = (keyboardHeight: number) => {
      // Вычитаем клавиатуру ТОЛЬКО там, где вьюпорт постоянный (iOS, resize none).
      // На Android и web window.innerHeight уже равен видимой области, и второе
      // вычитание выбросило бы блок за верхнюю кромку. С нулём формула ниже
      // остаётся верной: кнопка заведомо выше нижней кромки, и сдвиг выходит нулевым.
      const effectiveKeyboard = manualShift ? keyboardHeight : 0
      const shellTop = shell.getBoundingClientRect().top
      const topLimit = shellTop + back.offsetTop + back.offsetHeight + 8
      const visibleBottom = window.innerHeight - effectiveKeyboard

      // Геометрия — через offsetTop/offsetHeight, а не getBoundingClientRect:
      // rect во время анимации отдаёт промежуточное значение transform, и расчёт
      // поехал бы сам от себя. offset* трансформы не учитывает. offsetParent у
      // блока и у обёртки кнопки один и тот же — .onboarding-auth__center
      // (единственный позиционированный предок внутри экрана), поэтому слагаемые
      // у обеих отметок совпадают.
      const measure = () => {
        const blockTop = shellTop + center.offsetTop + stack.offsetTop
        return {
          // Низ кнопки «Продолжить» с запасом: ниже этой отметки клавиатуре нельзя.
          keepBottom:
            shellTop + center.offsetTop + keep.offsetTop + keep.offsetHeight + KEEP_VISIBLE_GAP,
          // Выше кнопки «назад» блок не поднимаем.
          maxShift: Math.max(0, blockTop - topLimit),
        }
      }

      // Компактный режим — последнее средство: включаем, только если кнопка не
      // помещается над клавиатурой даже после максимального сдвига. @media
      // (max-height) тут мёртв: вьюпорт под клавиатуру больше не ужимается.
      // Замер делаем со СНЯТЫМ модификатором — иначе решение зависело бы от
      // собственного результата и щёлкало бы туда-сюда на каждом пересчёте.
      shell.classList.remove(COMPACT_CLASS)
      const natural = measure()
      shell.classList.toggle(COMPACT_CLASS, natural.keepBottom - natural.maxShift > visibleBottom)

      const { keepBottom, maxShift } = measure()
      const shift = Math.round(Math.min(Math.max(keepBottom - visibleBottom, 0), maxShift))

      shell.style.setProperty('--auth-shift', `${shift}px`)
    }

    const handleKeyboardHeight = (keyboardHeight: number) => {
      // Тап по «Продолжить» роняет фокус с поля, и клавиатура успевает уехать
      // раньше, чем придёт ответ сети: блок дёргался вниз и тут же обратно.
      // Пока идёт сабмит, скрытие игнорируем — когда loading погаснет, эффект
      // пересчитает сдвиг заново (loading в зависимостях).
      if (keyboardHeight === 0 && loadingRef.current) return
      applyShift(keyboardHeight)
    }

    // Пересчёт «не из-за клавиатуры» (первый показ, смена шага, поворот экрана):
    // вёрстка в этот момент и так меняется скачком, анимировать сдвиг нечему —
    // гасим транзишн на время записи, иначе блок заметно доезжал бы до центра
    // сразу после открытия экрана.
    const recalc = () => {
      const previousTransition = stack.style.transition
      stack.style.transition = 'none'
      applyShift(getNativeKeyboardHeight())
      void stack.offsetHeight
      stack.style.transition = previousTransition
    }

    recalc()
    const unsubscribe = subscribeNativeKeyboardHeight(handleKeyboardHeight)
    // Поворот экрана меняет и высоту вьюпорта, и высоту блока.
    window.addEventListener('resize', recalc)
    return () => {
      unsubscribe()
      window.removeEventListener('resize', recalc)
    }
    // Высота острова разная на шагах (подсказка в СМС, кнопки на email) — пересчитываем.
  }, [step, manualShift, loading])

  useEffect(() => {
    if (step !== 'sms') {
      setSmsSecondsLeft(0)
      return
    }
    setSmsSecondsLeft(SMS_CODE_TTL_SEC)
    const id = window.setInterval(() => {
      setSmsSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [step, smsEpoch])

  useEffect(() => {
    return subscribeCuAuthMessage((token) => {
      if (browserAuthPollRef.current != null) {
        window.clearInterval(browserAuthPollRef.current)
        browserAuthPollRef.current = null
      }
      authSessionRef.current?.close()
      authSessionRef.current = null
      void (async () => {
        setLoading(true)
        try {
          setBffToken(token)
          await finishAuthenticated()
        } catch (err) {
          // Вход не доехал — откатываем только локальную сессию, чтобы повтор
          // не начинался с нуля (сессия ЦУ ещё жива и даст новый bff.cookie).
          clearLocalAuth()
          setToast(toUserError(err, 'Ошибка авторизации'))
        } finally {
          setLoading(false)
        }
      })()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe once
  }, [])

  useEffect(() => {
    return () => {
      if (browserAuthPollRef.current != null) {
        window.clearInterval(browserAuthPollRef.current)
        browserAuthPollRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let bootstrapId = 0

    const bootstrap = async () => {
      const id = ++bootstrapId

      // В dev не автologinим со stale localStorage — ждём явного входа (кнопка VITE_BFF / ЦУ).
      if (hadTokenOnMountRef.current && !import.meta.env.DEV) {
        setBootstrapping(true)
        setLoading(true)
        try {
          await finishAuthenticated()
        } catch (err) {
          if (!cancelled) setToast(toUserError(err, 'Ошибка авторизации'))
        } finally {
          if (!cancelled && id === bootstrapId) {
            setLoading(false)
            setBootstrapping(false)
          }
        }
        return
      }

      if (import.meta.env.DEV) {
        setBootstrapping(false)
        resetSession()
        // Keycloak в фоне — не блокируем dev-вход по VITE_BFF и не показываем toast при сбое CU.
        void startAuth().then((result) => {
          if (cancelled || id !== bootstrapId) return
          if (result.type === 'next') applyNextStep(result)
        })
        return
      }

      setBootstrapping(true)
      resetSession()
      const result = await startAuth()
      if (cancelled || id !== bootstrapId) return

      if (result.type === 'error') {
        // Фоновый прогрев Keycloak ЦУ не удался (из-за границы антибот ЦУ рвёт
        // TLS) — это не ошибка пользователя: тестовым аккаунтам Keycloak не нужен
        // вовсе, а для входа через ЦУ handleContinue поднимет его заново через
        // recoverLoginAction и только тогда покажет ошибку. Тост на пустом экране
        // «Вход» ревьюер Apple читает как «приложение показывает ошибку при запуске».
        console.warn('[auth] bootstrap startAuth failed:', result.message)
        setBootstrapping(false)
        return
      }

      if (result.type === 'redirect') {
        // Уже есть CU-сессия (часто после 401 / повторного входа) — добираем bff.cookie.
        setLoading(true)
        try {
          await finishWithCookie(result.callbackUrl)
        } catch (err) {
          setToast(toUserError(err, 'Ошибка авторизации'))
        } finally {
          if (!cancelled && id === bootstrapId) {
            setLoading(false)
            setBootstrapping(false)
          }
        }
        return
      }

      if (result.type === 'next') {
        applyNextStep(result)
      } else {
        setToast('Неожиданный ответ сервера авторизации')
      }
      setBootstrapping(false)
    }

    void bootstrap()
    return () => {
      cancelled = true
      bootstrapId += 1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once on mount
  }, [])

  const applyNextStep = (
    result: Extract<AuthStepResult, { type: 'next' }>,
    submittedStep?: AuthStep,
  ) => {
    setLoginAction(result.loginAction)
    if (result.phoneNumber) setPhoneNumber(result.phoneNumber)

    const mapped = mapActivePageToStep(result.activePage)
    const enteredSms = mapped === 'sms' && step !== 'sms'
    if (mapped) {
      setStep(mapped)
      if (enteredSms) setSmsEpoch((n) => n + 1)
    } else {
      setToast(`Неизвестный шаг входа: ${result.activePage}`)
    }

    if (result.errorMessage) {
      setToast(result.errorMessage)
      if (submittedStep === 'sms' && isExpiredOtpMessage(result.errorMessage)) {
        setSmsSecondsLeft(0)
      }
      return
    }

    // Keycloak иногда возвращает ту же страницу без systemMessage — всё равно говорим, что не вышло.
    if (submittedStep === 'password' && mapped === 'password') {
      setToast('Неверный логин или пароль')
      return
    }
    if (submittedStep === 'email' && mapped === 'email') {
      setToast('Не удалось продолжить. Проверь логин и попробуй ещё раз')
      return
    }
    if (submittedStep === 'sms' && mapped === 'sms') {
      setToast('Неверный код. Попробуй ещё раз')
    }
  }

  /**
   * Уводим в приложение или в онбординг. Пароль ЦУ здесь уже не нужен — гасим его
   * в стейте: дальше он не участвует ни в одном запросе.
   */
  const proceed = async (user: UserProfile, opts?: { skipLists?: boolean }) => {
    const onboardingDone = Boolean(user.completedAt)
    if (onboardingDone) setOnboardingCompleted()
    else clearOnboardingCompleted()
    setPassword('')
    // Списки грузим и для тестовых аккаунтов: админ-сессия для них уже валидна,
    // иначе профиль до перезапуска остаётся пустым (учёба/работа/скиллы).
    await refetch({ silent: true, user, skipLists: opts?.skipLists })
    navigate(onboardingDone ? resolvePostAuthPath(true) : '/onboarding', { replace: true })
  }

  const openConsent = (
    mode: 'register' | 'existing',
    target?: { user: UserProfile; skipLists?: boolean },
  ) => {
    // Аутентификация уже прошла — пароль ЦУ больше нигде не участвует.
    setPassword('')
    consentTargetRef.current = target ?? null
    setConsentMode(mode)
    setAcceptedTerms(false)
    setAcceptedPrivacy(false)
    setConsentOpen(true)
  }

  const finishAuthenticated = async (adminSession?: AdminLoginResponse) => {
    if (finishingAuthRef.current) return
    finishingAuthRef.current = true
    try {
      resetGetMeInflight()
      let existing: UserProfile | null = null
      try {
        existing = await getMe()
      } catch (meErr) {
        if (!adminSession) throw meErr
      }

      if (adminSession && existing && existing.id !== adminSession.id) {
        existing = null
      }

      // Второй рубеж против «переезда» сканов/заметок между аккаунтами:
      // если localStorage принадлежал другому пользователю — вычищаем его
      // данные ДО того, как начнём наполнять кэши новой сессии.
      const ownerId = existing?.id ?? adminSession?.id ?? ''
      if (ownerId) ensureStorageOwner(ownerId)

      if (existing) {
        // Согласие спрашиваем у ЛЮБОГО аккаунта без отметки — и у ЦУ, и у тестового.
        if (needsConsent(existing)) {
          if (!existing.completedAt) clearOnboardingCompleted()
          openConsent('existing', { user: existing })
          return
        }
        await proceed(existing)
        return
      }

      if (adminSession) {
        const fallback: UserProfile = {
          id: adminSession.id,
          photoUrl: null,
          firstName: adminSession.firstName,
          lastName: adminSession.lastName,
          bio: null,
          birthdate: null,
          speciality: null,
          status: null,
          role: adminSession.role,
        }
        clearOnboardingCompleted()
        if (needsConsent(fallback)) {
          openConsent('existing', { user: fallback, skipLists: true })
          return
        }
        await proceed(fallback, { skipLists: true })
        return
      }

      // Новый пользователь — согласие, потом register
      clearOnboardingCompleted()
      openConsent('register')
    } catch (err) {
      if (isAccountDeletedError(err)) {
        setPurgeAt(readPurgeAt(err))
        setRestoreOpen(true)
        return
      }
      // Аварийный путь внутри входа: сессию ЦУ сохраняем, иначе после любой
      // ошибки getMe пользователь заново проходит логин/пароль/СМС.
      clearLocalAuth()
      const message = err instanceof Error ? err.message : 'Ошибка регистрации'
      const isAts =
        /App Transport Security|NSAppTransportSecurity|-1022|NSURLErrorDomain.*-1022/i.test(message)
      const isNetwork =
        /failed to fetch|NSURLError|Network request failed|Could not connect|timed out|The Internet connection appears to be offline/i.test(
          message,
        )
      setToast(
        isAts
          ? `iOS ATS блокирует HTTP к API. Нужна пересборка из Xcode после Info.plist (${message})`
          : isNetwork
            ? import.meta.env.DEV
              ? `Нет связи с dev-прокси (localhost:5173 → API). ${message}. Перезапусти npm run dev.`
              : `Нет связи с API (${import.meta.env.VITE_API_BASE_URL || 'URL?'}): ${message}`
            : message,
      )
    } finally {
      finishingAuthRef.current = false
    }
  }

  const consentBody = () => ({
    termsVersion: LEGAL_REVISION,
    privacyVersion: LEGAL_REVISION,
  })

  /**
   * Фиксируем согласие на сервере. 404/405 — бэкенд без этого эндпоинта: вход не
   * рвём, помним локально. Остальные ошибки отдаём наверх: согласие обязано
   * доехать, и пользователю честнее нажать «Принять и продолжить» ещё раз.
   */
  const submitConsent = async (userId: string): Promise<void> => {
    try {
      await recordConsent(consentBody())
      rememberConsentLocally(userId)
    } catch (err) {
      if (err instanceof ApiRequestError && (err.status === 404 || err.status === 405)) {
        rememberConsentLocally(userId)
        return
      }
      throw err
    }
  }

  const handleConsentContinue = async () => {
    if (!acceptedTerms || !acceptedPrivacy) return
    setLoading(true)
    try {
      const target = consentTargetRef.current
      if (consentMode === 'existing' && target) {
        await submitConsent(target.user.id)
        consentTargetRef.current = null
        // Сначала уходим дальше, потом закрываем sheet — иначе гонка с рендером формы
        await proceed(target.user, { skipLists: target.skipLists })
        setConsentOpen(false)
        return
      }

      const user = await registerStudent(consentBody())
      if (user?.id) ensureStorageOwner(user.id)
      // Старый бэкенд игнорирует согласие в теле register, а register может вернуть
      // уже существующего пользователя с подписью под прошлой редакцией — добиваем
      // отдельным вызовом, пока на сервере не встанет текущая редакция.
      if (user?.id && !isServerConsentCurrent(user)) {
        try {
          await submitConsent(user.id)
        } catch {
          // Регистрация уже прошла: не запираем нового пользователя из-за отметки.
        }
      }
      await proceed(user)
      setConsentOpen(false)
    } catch (err) {
      if (isAccountDeletedError(err)) {
        setConsentOpen(false)
        setPurgeAt(readPurgeAt(err))
        setRestoreOpen(true)
        return
      }
      if (consentMode === 'existing') {
        // Сессия жива и пользователь уже вошёл — оставляем шторку для повтора.
        setToast(toUserError(err, 'Не удалось сохранить согласие. Попробуй ещё раз'))
        return
      }
      // Регистрация не прошла — даём повторить попытку по живой сессии ЦУ.
      clearLocalAuth()
      setConsentOpen(false)
      setToast(toUserError(err, 'Не удалось зарегистрироваться'))
    } finally {
      setLoading(false)
    }
  }

  const handleConsentClose = () => {
    setConsentOpen(false)
    consentTargetRef.current = null
    setPassword('')
    // Пользователь отказался от согласий и уходит на welcome — это настоящий выход,
    // сессию ЦУ гасим, чтобы следующий вход не продолжил этот аккаунт молча.
    clearAuth()
    clearCachedProfile()
    clearOnboardingCompleted()
    resetSession()
    navigate('/', { replace: true })
  }

  /** Отмена запланированного удаления — сервер возвращает аккаунт в строй. */
  const handleRestore = async () => {
    setRestoring(true)
    try {
      const restored = await restoreMe()
      const user = restored ?? (await getMe())
      if (!user) {
        setToast('Не удалось загрузить профиль после отмены удаления')
        return
      }
      setRestoreOpen(false)
      setPurgeAt(null)
      if (user.id) ensureStorageOwner(user.id)
      if (needsConsent(user)) {
        if (!user.completedAt) clearOnboardingCompleted()
        openConsent('existing', { user })
        return
      }
      await proceed(user)
    } catch (err) {
      setToast(toUserError(err, 'Не удалось отменить удаление'))
    } finally {
      setRestoring(false)
    }
  }

  const handleDeclineRestore = () => {
    setRestoreOpen(false)
    setExitConfirmOpen(true)
  }

  const handleConfirmExit = () => {
    // Явный «Выйти» — полный выход вместе с сессией ЦУ.
    clearAuth()
    clearCachedProfile()
    clearOnboardingCompleted()
    resetSession()
    setExitConfirmOpen(false)
    setPassword('')
    setPurgeAt(null)
    navigate('/', { replace: true })
  }

  const handleCancelExit = () => {
    setExitConfirmOpen(false)
    setRestoreOpen(true)
  }

  // Документ открываем поверх шторки, без navigate: уход со страницы размонтирует её,
  // и галочки согласий вместе с сессией входа теряются (а на возврате может выбросить из неё).
  const openDocument = (id: LegalDocId) => {
    setLegalDocId(id)
  }

  const finishWithCookie = async (callbackUrl: string) => {
    const cookie = await exchangeCallback(callbackUrl)
    if (!cookie) {
      setToast('Не удалось получить сессию (bff.cookie). Попробуйте войти ещё раз.')
      return
    }

    setBffToken(cookie)
    await finishAuthenticated()
  }

  const handleDevCookieAuth = async () => {
    if (!getDevBffFromEnv()) {
      setToast(
        'VITE_BFF не подхватился. Проверь strings-front/.env и перезапусти dev-сервер (npm run dev).',
      )
      return
    }

    setLoading(true)
    // Dev-вход по куке из .env: чистим только локальную сессию.
    clearLocalAuth()
    resetGetMeInflight()
    try {
      applyAuthFromEnv()

      // Серверный dev-эндпоинт: Node → API напрямую, без /api proxy и блокировок /api/me.
      let me: UserProfile | null
      try {
        const response = await fetch(`${window.location.origin}/__dev/me`)
        if (response.status === 404) {
          me = null
        } else if (!response.ok) {
          if (response.status === 401) {
            setToast(
              'Кука в VITE_BFF протухла или невалидна. Войди через ЦУ и скопируй свежую bff.cookie в .env.',
            )
            clearLocalAuth()
            return
          }
          const text = await response.text()
          throw new Error(text || `HTTP ${response.status}`)
        } else {
          me = (await response.json()) as UserProfile
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        clearLocalAuth()
        if (/failed to fetch/i.test(message)) {
          setToast(
            `Не достучались до dev-сервера (${window.location.origin}). Запущен ли npm run dev? Отключи блокировщик рекламы для localhost.`,
          )
        } else {
          setToast(`Dev-вход не удался: ${message}`)
        }
        return
      }

      if (me) {
        if (me.id) ensureStorageOwner(me.id)
        if (needsConsent(me)) {
          if (!me.completedAt) clearOnboardingCompleted()
          openConsent('existing', { user: me })
          return
        }
        await proceed(me)
        return
      }

      clearOnboardingCompleted()
      openConsent('register')
    } catch (err) {
      clearLocalAuth()
      setToast(toUserError(err, 'Ошибка авторизации по VITE_BFF'))
    } finally {
      setLoading(false)
    }
  }

  const stopBrowserAuthPoll = () => {
    if (browserAuthPollRef.current != null) {
      window.clearInterval(browserAuthPollRef.current)
      browserAuthPollRef.current = null
    }
  }

  const handleBrowserAuth = () => {
    stopBrowserAuthPoll()
    // Окно ЦУ закрыли руками — ждать больше нечего, гасим поллинг.
    const session = openCuAuthPopup({ onDismiss: stopBrowserAuthPoll })
    if (!session) {
      setToast('Не удалось открыть страницу авторизации.')
      return
    }
    authSessionRef.current = session

    // Fallback: если postMessage из браузера не дошёл, проверяем callback-сессию сами.
    const startedAt = Date.now()
    browserAuthPollRef.current = window.setInterval(() => {
      // Свой in-flight и чужой loading читаем через ref: замыкание interval'а устаревает.
      if (browserAuthPollBusyRef.current || loadingRef.current || finishingAuthRef.current) return
      if (Date.now() - startedAt > AUTH_POLL_MAX_MS) {
        // Только гасим поллинг. Webview не трогаем: пользователь может всё ещё вводить
        // пароль или СМС, а токен придёт через postMessage.
        stopBrowserAuthPoll()
        return
      }
      browserAuthPollBusyRef.current = true
      void (async () => {
        try {
          const result = await startAuth()
          if (result.type !== 'redirect') return
          stopBrowserAuthPoll()
          authSessionRef.current?.close()
          authSessionRef.current = null
          setLoading(true)
          try {
            await finishWithCookie(result.callbackUrl)
          } finally {
            setLoading(false)
          }
        } catch {
          // continue polling
        } finally {
          browserAuthPollBusyRef.current = false
        }
      })()
    }, 2500)
  }

  /**
   * loginAction потерян (Keycloak не поднялся или сессия протухла) — поднимаем
   * вход заново вместо «обновите страницу»: в нативной сборке обновлять нечего.
   * handled — дальше идти не надо, мы уже ушли по другой ветке (например, у нас
   * оказалась живая сессия ЦУ и вход завершился сам).
   * Ровно одна автоматическая попытка на действие пользователя: сбойный Keycloak
   * иначе крутил бы startAuth по кругу.
   */
  const recoverLoginAction = async (
    target: AuthStep,
  ): Promise<{ action: string | null; handled: boolean }> => {
    if (authRetryUsedRef.current) return { action: null, handled: false }
    authRetryUsedRef.current = true

    resetSession()
    const started = await startAuth()
    if (started.type === 'redirect') {
      await finishWithCookie(started.callbackUrl)
      return { action: null, handled: true }
    }
    if (started.type !== 'next') return { action: null, handled: false }

    if (target === 'email') {
      setLoginAction(started.loginAction)
      return { action: started.loginAction, handled: false }
    }

    const user = email.trim()
    if (!user) return { action: null, handled: false }

    const afterUser = await submitUsername(started.loginAction, user)
    if (afterUser.type === 'redirect') {
      await finishWithCookie(afterUser.callbackUrl)
      return { action: null, handled: true }
    }
    if (afterUser.type !== 'next' || mapActivePageToStep(afterUser.activePage) !== 'password') {
      return { action: null, handled: false }
    }
    setLoginAction(afterUser.loginAction)
    return { action: afterUser.loginAction, handled: false }
  }

  const handleAuthResult = async (result: AuthStepResult, submittedStep?: AuthStep) => {
    if (result.type === 'error') {
      setToast(result.message)
      return
    }

    if (result.type === 'redirect') {
      await finishWithCookie(result.callbackUrl)
      return
    }

    applyNextStep(result, submittedStep)
  }

  /** Full restart of Keycloak flow with saved email+password → new SMS. */
  const restartAuthToSms = async (): Promise<boolean> => {
    const user = email.trim()
    if (!user || !password) {
      setToast('Чтобы получить новый код, начни вход заново')
      setStep('email')
      return false
    }

    resetSession()
    const started = await startAuth()
    if (started.type === 'error') {
      setToast(started.message)
      return false
    }
    if (started.type !== 'next') {
      setToast('Не удалось запросить новый код. Начни вход заново')
      setStep('email')
      return false
    }

    const afterUser = await submitUsername(started.loginAction, user)
    if (afterUser.type === 'error') {
      setToast(afterUser.message)
      return false
    }
    if (afterUser.type !== 'next') {
      setToast('Не удалось запросить новый код. Начни вход заново')
      return false
    }

    const afterPass = await submitPassword(afterUser.loginAction, password)
    await handleAuthResult(afterPass, 'password')
    if (afterPass.type === 'next' && mapActivePageToStep(afterPass.activePage) === 'sms') {
      setCode('')
      setSmsEpoch((n) => n + 1)
      setToast('Новый код отправлен')
      return true
    }
    return false
  }

  const handleResendOtp = async () => {
    if (!loginAction || !phoneNumber) {
      setToast('Сессия СМС не готова. Начни вход заново')
      return
    }
    setResending(true)
    try {
      const result = await resendOtp(loginAction, phoneNumber)
      if (result.type === 'error') {
        const ok = await restartAuthToSms()
        if (!ok) setToast(result.message)
        return
      }
      if (result.type === 'redirect') {
        await finishWithCookie(result.callbackUrl)
        return
      }

      if (result.errorMessage && /слишком|подожд|often|limit/i.test(result.errorMessage)) {
        setToast(result.errorMessage)
        applyNextStep(result)
        return
      }

      if (result.errorMessage && !isExpiredOtpMessage(result.errorMessage)) {
        const ok = await restartAuthToSms()
        if (!ok) setToast(result.errorMessage)
        return
      }

      applyNextStep(result)
      setCode('')
      setSmsEpoch((n) => n + 1)
      setToast('Новый код отправлен')
    } catch (err) {
      try {
        const ok = await restartAuthToSms()
        if (!ok) setToast(toUserError(err, 'Не удалось отправить код'))
      } catch (fallbackErr) {
        setToast(toUserError(fallbackErr, 'Не удалось отправить код'))
      }
    } finally {
      setResending(false)
    }
  }

  const title =
    step === 'email' ? 'Вход' : step === 'password' ? 'Введи пароль' : 'Введи код из СМС'

  /**
   * Назад с шага СМС: сохранённый loginAction ведёт на OTP-форму Keycloak, и пароль,
   * отправленный туда, возвращает юзера на СМС со сброшенным таймером и без нового кода.
   * Поэтому переоткрываем вход и доходим до формы пароля заново.
   */
  const backFromSmsToPassword = async () => {
    if (loadingRef.current) return

    setStep('password')
    setCode('')
    setPassword('')
    setPhoneNumber(null)
    setLoginAction(null)
    setLoading(true)
    try {
      resetSession()
      const started = await startAuth()
      if (started.type === 'error') {
        setToast(started.message)
        setStep('email')
        return
      }
      if (started.type !== 'next') {
        setToast('Не удалось вернуться назад. Начни вход заново')
        setStep('email')
        return
      }

      const user = email.trim()
      if (!user) {
        applyNextStep(started)
        return
      }

      const afterUser = await submitUsername(started.loginAction, user)
      if (afterUser.type === 'redirect') {
        await finishWithCookie(afterUser.callbackUrl)
        return
      }
      if (afterUser.type !== 'next' || mapActivePageToStep(afterUser.activePage) !== 'password') {
        setToast('Не удалось вернуться назад. Начни вход заново')
        setStep('email')
        return
      }
      setLoginAction(afterUser.loginAction)
    } catch (err) {
      setToast(toUserError(err, 'Не удалось вернуться назад'))
      setStep('email')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (step === 'email') {
      navigate('/', { replace: true })
      return
    }
    if (step === 'password') {
      // Пароль ЦУ дальше не нужен — не держим его в стейте дольше шага.
      setPassword('')
      setStep('email')
      return
    }
    void backFromSmsToPassword()
  }

  const handleContinue = async () => {
    // Новое действие пользователя — снова разрешаем один автоповтор startAuth.
    authRetryUsedRef.current = false

    if (step === 'email') {
      const value = email.trim()
      if (!value) {
        setToast('Введите логин или email')
        return
      }
      setLoading(true)
      try {
        const probe = await probeAdminLogin(value)
        if (probe === 'error') {
          // В Keycloak НЕ проваливаемся: там пароль тестового аккаунта уйдёт в ЦУ.
          setToast('Не удалось проверить логин. Проверь связь и попробуй ещё раз')
          return
        }
        setIsAdminLogin(probe === 'admin')
        if (probe === 'admin') {
          setStep('password')
          return
        }
        let action = loginAction
        if (!action) {
          const recovery = await recoverLoginAction('email')
          if (recovery.handled) return
          if (!recovery.action) {
            setToast(AUTH_NOT_READY)
            return
          }
          action = recovery.action
        }
        await handleAuthResult(await submitUsername(action, value), 'email')
      } catch (err) {
        setToast(toUserError(err, 'Ошибка авторизации'))
      } finally {
        setLoading(false)
      }
      return
    }

    if (step === 'password') {
      if (!password) {
        setToast('Введите пароль')
        return
      }
      setLoading(true)
      try {
        const login = email.trim()
        // Не перепроверяем checkAdminLogin: пароль тестового аккаунта не должен
        // уйти в Keycloak ЦУ из-за случайного сбоя повторной проверки.
        if (isAdminLogin && login) {
          try {
            const admin = await adminLogin(login, password)
            await finishAuthenticated(admin)
          } catch (err) {
            setToast(toUserError(err, 'Неверный логин или пароль'))
            return
          }
          return
        }

        let action = loginAction
        if (!action) {
          const recovery = await recoverLoginAction('password')
          if (recovery.handled) return
          if (!recovery.action) {
            setToast(AUTH_NOT_READY)
            return
          }
          action = recovery.action
        }
        await handleAuthResult(await submitPassword(action, password), 'password')
      } catch (err) {
        setToast(toUserError(err, 'Ошибка авторизации'))
      } finally {
        setLoading(false)
      }
      return
    }

    if (!loginAction) {
      // Сессию СМС уже не спасти: код привязан к утраченному loginAction.
      // Поднимаем вход заново и возвращаем на первый шаг.
      setLoading(true)
      try {
        const recovery = await recoverLoginAction('email')
        if (recovery.handled) return
      } catch (err) {
        setToast(toUserError(err, AUTH_NOT_READY))
        return
      } finally {
        setLoading(false)
      }
      setToast(AUTH_NOT_READY)
      setCode('')
      setStep('email')
      return
    }

    if (smsSecondsLeft <= 0) {
      setToast('Старый код истёк. Получи новый по кнопке ниже')
      return
    }

    const otp = code.trim()
    if (!otp) {
      setToast('Введите код из СМС')
      return
    }
    if (!phoneNumber) {
      setToast('Неизвестный номер телефона. Начните вход заново.')
      return
    }

    setLoading(true)
    try {
      await handleAuthResult(await submitOtp(loginAction, otp, phoneNumber), 'sms')
    } catch (err) {
      setToast(toUserError(err, 'Ошибка авторизации'))
    } finally {
      setLoading(false)
    }
  }

  const busy = loading || bootstrapping || restoring

  /** Enter («Далее»/«Готово» на клавиатуре) = кнопка «Продолжить», с её блокировками. */
  const handleFieldKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    // Идёт набор через IME (китайский/японский) — Enter подтверждает подстановку.
    if (e.nativeEvent.isComposing) return
    e.preventDefault()
    if (busy || resending) return
    void handleContinue()
  }
  /** Бэкенд не прислал ни purgeAt, ни deletedAt — говорим про срок, а не про дату. */
  const purgeLabel = formatPurgeDate(purgeAt) ?? 'через 30 дней'

  return (
    <main className="onboarding-auth" ref={shellRef}>
      <button
        type="button"
        className="onboarding-auth__back"
        onClick={handleBack}
        aria-label="Назад"
        ref={backRef}
      >
        <ArrowBackIcon />
      </button>

      <div className="onboarding-auth__center" ref={centerRef}>
        <div className="onboarding-auth__stack" ref={stackRef}>
          <h1 className="onboarding-auth__title">{title}</h1>

          <div className="onboarding-auth__chip">
            {step === 'sms' && (
              <p className="onboarding-auth__hint">
                Мы отправили код подтверждения на номер телефона {maskPhoneNumber(phoneNumber ?? '')}.
              </p>
            )}

            {step === 'email' && (
              <FieldInput
                ref={inputRef}
                key="email"
                type="text"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
                enterKeyHint="next"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleFieldKeyDown}
                placeholder="Email или логин"
                className="onboarding-auth__input"
              />
            )}

            {step === 'password' && (
              <FieldInput
                ref={inputRef}
                key="password"
                type="password"
                autoComplete="current-password"
                enterKeyHint="go"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleFieldKeyDown}
                placeholder="Пароль"
                className="onboarding-auth__input"
              />
            )}

            {step === 'sms' && (
              <FieldInput
                ref={inputRef}
                key="sms"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                enterKeyHint="done"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={handleFieldKeyDown}
                placeholder="Код"
                className="onboarding-auth__input"
              />
            )}

            {/* Обёртка нужна ради рефа: Button ref наружу не пробрасывает, а низ
                этой кнопки — та отметка, которую держим над клавиатурой. */}
            <div className="onboarding-auth__cta-wrap" ref={keepRef}>
              <Button
                className={`onboarding-auth__cta${step === 'sms' && smsSecondsLeft <= 0 ? ' onboarding-auth__cta--expired' : ''}`}
                disabled={busy || resending}
                // Не отдаём фокус кнопке: иначе поле теряет его ещё до запроса,
                // клавиатура уезжает, блок едет вниз — и через полсекунды, уже на
                // новом шаге, обратно вверх. Перевод фокуса — действие по умолчанию
                // именно mousedown (на iOS это событие приходит в общей пачке с
                // click), клик после preventDefault отрабатывает как обычно.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void handleContinue()}
              >
                {loading ? 'Авторизация…' : 'Продолжить'}
              </Button>
            </div>

            {step === 'sms' && (
              <button
                type="button"
                className="onboarding-auth__dev-cta"
                disabled={busy || resending || smsSecondsLeft > 0}
                // Тоже не забираем фокус у поля кода — см. кнопку «Продолжить».
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void handleResendOtp()}
              >
                {resending
                  ? 'Отправляем…'
                  : smsSecondsLeft > 0
                    ? `Новый код через ${smsSecondsLeft} сек.`
                    : 'Отправить код снова'}
              </button>
            )}

            {step === 'email' && (
              <>
                <button
                  type="button"
                  className="onboarding-auth__dev-cta"
                  disabled={busy}
                  onClick={handleBrowserAuth}
                >
                  Авторизоваться через браузер
                </button>
                {/* Антибот ЦУ не пускает с VPN: страница университета в браузере просто не откроется. */}
                <p className="onboarding-auth__vpn-hint">
                  <svg
                    className="onboarding-auth__vpn-hint-icon"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M12 11v5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <circle cx="12" cy="7.8" r="1.1" fill="currentColor" />
                  </svg>
                  <span>При входе рекомендуем отключить VPN</span>
                </p>
              </>
            )}

            {import.meta.env.DEV && step === 'email' && (
              <>
                <button
                  type="button"
                  className="onboarding-auth__dev-cta"
                  disabled={busy || !getDevBffFromEnv()}
                  onClick={() => void handleDevCookieAuth()}
                >
                  {loading ? 'Авторизация…' : 'Войти по куке из .env'}
                </button>
                {!getDevBffFromEnv() ? (
                  <p className="onboarding-auth__dev-hint">
                    VITE_BFF не задан или dev-сервер не перезапускали после правки .env
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      {consentOpen ? (
        <FormalitiesSheet
          acceptedTerms={acceptedTerms}
          acceptedPrivacy={acceptedPrivacy}
          onAcceptedTermsChange={setAcceptedTerms}
          onAcceptedPrivacyChange={setAcceptedPrivacy}
          onOpenDocument={openDocument}
          onContinue={() => void handleConsentContinue()}
          onClose={handleConsentClose}
        />
      ) : null}

      {legalDocId ? (
        <LegalDocSheet docId={legalDocId} onClose={() => setLegalDocId(null)} />
      ) : null}

      {restoreOpen && (
        <ConfirmDialog
          title="Удаление аккаунта запланировано"
          subtitle={`Аккаунт будет удалён ${purgeLabel}. Отменить удаление?`}
          confirmLabel={restoring ? 'Отменяем…' : 'Отменить удаление'}
          cancelLabel="Выйти"
          confirmTone="brand"
          confirmDisabled={restoring}
          onConfirm={() => void handleRestore()}
          onCancel={handleDeclineRestore}
        />
      )}

      {exitConfirmOpen && (
        <ConfirmDialog
          title="Точно хочешь выйти?"
          subtitle="Ты выйдешь из приложения, удаление аккаунта останется запланированным"
          confirmLabel="Выйти"
          cancelLabel="Уже не хочу"
          confirmTone="danger"
          onConfirm={handleConfirmExit}
          onCancel={handleCancelExit}
        />
      )}

      {toast && (
        <Toast key={toast} message={toast} duration={4000} onClose={() => setToast(null)} />
      )}
    </main>
  )
}
