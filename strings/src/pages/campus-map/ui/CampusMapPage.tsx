import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import {
  FiArrowLeft,
  FiChevronDown,
  FiChevronRight,
  FiMinus,
  FiPlus,
  FiSearch,
  FiX,
} from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import {
  getNativeKeyboardHeight,
  subscribeNativeKeyboardHeight,
} from '../../../shared/lib/nativeKeyboard'
import { usePageSwipeRight } from '../../../shared/lib/usePageSwipeRight'
import {
  buildCampusSearch,
  CAMPUSES,
  campusFloorHasHits,
  campusLegend,
  campusMarkerTitle,
  getCampus,
  readStoredCampusId,
  storeCampusId,
  zoneTitle,
  type Campus,
  type CampusFloor,
  type CampusId,
  type CampusMarker,
  type CampusResultRow,
  type CampusRoom,
  type CampusSearch,
} from '../model/campusMapData'
import './campus-map-page.css'

const MIN_SCALE = 1
const MAX_SCALE = 4
const DOUBLE_TAP_SCALE = 2.5
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_PX = 24
/** Поле вокруг найденных плашек и потолок автоприближения для группы плашек */
const FIT_PADDING = 24
const FIT_MAX_SCALE = 2.5
/**
 * Тап рядом с плашкой считается тапом по ней: плашка на плане бывает меньше
 * 45pt, а палец — нет. Порог в пикселях экрана, в координаты плана переводится
 * с учётом текущего масштаба.
 */
const TAP_SLOP_PX = 18
/** Клик-эхо второго тапа приходит следом за ним; дольше этого срока глушить нечего */
const SWALLOW_CLICK_MS = 400
/**
 * Клавиатура iOS уезжает примерно за 250–300 мс, и всё это время вебвью (а с
 * ним и скроллер) ниже своей настоящей высоты. Через этот срок перемеряем.
 */
const KEYBOARD_ANIM_MS = 320
/** Сколько ждать, пока вебвью вернёт высоту после скрытия клавиатуры (см. afterKeyboardHidden) */
const KEYBOARD_HIDE_FALLBACK_MS = 400
/** Шаг колеса мыши и кнопок +/- (только десктоп) */
const WHEEL_STEP = 1.1
const ZOOM_BUTTON_STEP = 1.4

/**
 * Высота окна карты. Считается ОДИН раз на монтировании и на повороте экрана:
 * на iOS клавиатура ужимает вебвью (Keyboard.resize = native), и пересчёт по
 * resize дёргал бы карту вверх-вниз прямо под пальцем. Границы — чтобы план
 * не превращался в марку на маленьком экране и в простыню на большом.
 */
const MAP_MIN_H = 260
const MAP_MAX_H = 440
const MAP_H_RATIO = 0.42

const readMapHeight = (): number =>
  Math.max(MAP_MIN_H, Math.min(MAP_MAX_H, Math.round(window.innerHeight * MAP_H_RATIO)))

type Transform = { scale: number; x: number; y: number }

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 }

/** Режим экрана: обзор, набор запроса, показ выбранного результата */
type Mode = 'browse' | 'typing' | 'result'

/** Выбранное помещение: подсветка на плане и строка под ним */
type Selection = {
  floorId: number
  ids: string[]
  code: string
  title: string
  zone: string | null
}

/**
 * Заявка на приближение. Токен — чтобы повторный тап по тому же ряду снова
 * сработал. keyboardOpen — клавиатура была открыта в момент заявки (см.
 * afterKeyboardHidden).
 */
type ZoomRequest = { token: number; floorId: number; ids: string[]; keyboardOpen: boolean }

/**
 * Прямоугольник плана внутри окна карты. Окно фиксированной высоты, планы у
 * этажей разной пропорции — план вписывается в окно (contain) и центрируется.
 * Считается из чисел, а не измерением DOM: слой уже трансформирован зумом,
 * и getBoundingClientRect вернул бы размеры вместе с масштабом.
 */
type PlanBox = { left: number; top: number; width: number; height: number; scale: number }

const fitPlanBox = (width: number, height: number, box: { w: number; h: number }): PlanBox => {
  if (width <= 0 || height <= 0 || box.w <= 0 || box.h <= 0) {
    return { left: 0, top: 0, width: 0, height: 0, scale: 0 }
  }
  const scale = Math.min(width / box.w, height / box.h)
  const planWidth = box.w * scale
  const planHeight = box.h * scale
  return {
    left: (width - planWidth) / 2,
    top: (height - planHeight) / 2,
    width: planWidth,
    height: planHeight,
    scale,
  }
}

/** Картинка не должна отрываться от краёв вьюпорта: сдвиг всегда в пределах полей. */
const clampTransform = (next: Transform, width: number, height: number): Transform => {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale))
  return {
    scale,
    x: Math.min(0, Math.max(width * (1 - scale), next.x)),
    y: Math.min(0, Math.max(height * (1 - scale), next.y)),
  }
}

const groupRoomsByZone = (
  campus: Campus,
  rooms: CampusRoom[],
): { zone: string; items: CampusRoom[] }[] =>
  campus.zones
    .map((zone) => ({ zone: zone.id, items: rooms.filter((room) => room.zone === zone.id) }))
    .filter((group) => group.items.length > 0)

const floorsLabel = (ids: number[]): string =>
  `${ids.length === 1 ? 'этаж' : 'этажи'} ${ids.join(', ')}`

/** Пример номеров для подсказки в пустом результате — из данных самого кампуса */
const sampleCodes = (campus: Campus): string[] => {
  const found: string[] = []
  for (const floor of campus.floors) {
    for (const room of floor.rooms) {
      const code = room.codes.split(/[,–—-]/)[0]?.trim()
      if (code && !found.includes(code)) found.push(code)
      if (found.length === 2) return found
    }
  }
  return found
}

/** Плавность прокрутки: при «уменьшить движение» прыгаем сразу, без анимации */
const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

/**
 * Выполнить кадром позже — а если клавиатура открыта, то когда вебвью вернул
 * свою высоту. На iOS (Keyboard.resize = native) кадр вебвью плагин
 * восстанавливает уже ПОСЛЕ keyboardWillHide, и до страницы это доезжает
 * событием resize. Всё, что меряет скроллер (прокрутка к карте, видимая часть
 * под зумом), раньше этого момента считает по ужатому окну — и карта ездила
 * туда-обратно. Resize может и не прийти (вебвью не ужимался) — тогда таймер.
 * keyboardOpen читать ДО blur, в том же обработчике: событие скрытия обнуляет
 * высоту раньше, чем до неё доберётся эффект зума. Возвращает отмену.
 */
const afterKeyboardHidden = (keyboardOpen: boolean, run: () => void): (() => void) => {
  let frame = 0
  let timer = 0
  const finish = () => {
    window.removeEventListener('resize', finish)
    window.clearTimeout(timer)
    frame = requestAnimationFrame(run)
  }
  if (keyboardOpen) {
    window.addEventListener('resize', finish)
    timer = window.setTimeout(finish, KEYBOARD_HIDE_FALLBACK_MS)
  } else {
    frame = requestAnimationFrame(run)
  }
  return () => {
    window.removeEventListener('resize', finish)
    window.clearTimeout(timer)
    cancelAnimationFrame(frame)
  }
}

/* ─── плашка на плане ────────────────────────────────────────────────────── */

type MapMarkerProps = {
  id: string
  label: string
  /** Геометрия в процентах прямоугольника плана */
  left: number
  top: number
  width: number
  height: number
  hit: boolean
  focus: boolean
}

/**
 * Плашек на этаже до полутора сотен, а перерисовка страницы случается на
 * каждую букву запроса. Пропсы — примитивы, поэтому memo действительно
 * отсекает повторный рендер: меняются только те плашки, у которых сменилась
 * подсветка.
 */
const MapMarker = memo(({ id, label, left, top, width, height, hit, focus }: MapMarkerProps) => (
  <button
    type="button"
    className={`campus-map-page__marker${hit ? ' campus-map-page__marker--hit' : ''}${
      focus ? ' campus-map-page__marker--focus' : ''
    }`}
    style={{
      left: `${left}%`,
      top: `${top}%`,
      width: `${width}%`,
      height: `${height}%`,
    }}
    aria-label={label}
    aria-pressed={focus}
    data-marker-id={id}
  />
))
MapMarker.displayName = 'MapMarker'

/* ─── строки списков ─────────────────────────────────────────────────────── */

const RoomRow = ({ room }: { room: CampusRoom }) => (
  <div className="campus-map-page__room">
    {room.codes && <span className="campus-map-page__room-code">{room.codes}</span>}
    <span className="campus-map-page__room-title">{room.title}</span>
  </div>
)

type ResultRowProps = {
  row: CampusResultRow
  current: boolean
  onOpen: () => void
}

const ResultRow = ({ row, current, onOpen }: ResultRowProps) => {
  // Помещение есть в списке из PDF, а плашки на плане нет («Радиостудия»):
  // вести такую строку некуда, поэтому она не кнопка.
  if (row.ids.length === 0) {
    return (
      <div className="campus-map-page__room campus-map-page__room--plain">
        {row.code && <span className="campus-map-page__room-code">{row.code}</span>}
        <span className="campus-map-page__room-title">{row.title}</span>
        <span className="campus-map-page__room-note">нет на плане</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      className={`campus-map-page__room campus-map-page__room--result${
        current ? ' campus-map-page__room--current' : ''
      }`}
      onClick={onOpen}
    >
      {row.code && <span className="campus-map-page__room-code">{row.code}</span>}
      <span className="campus-map-page__room-title">{row.title}</span>
      <FiChevronRight className="campus-map-page__room-chevron" size={16} aria-hidden />
    </button>
  )
}

type ResultListProps = {
  search: CampusSearch
  selection: Selection | null
  onOpen: (floor: CampusFloor, row: CampusResultRow) => void
  /** Подсказка под «ничего не найдено»: «Проверьте номер (B102, B104)…» */
  emptyHint: string
  /** Кнопка «есть в другом кампусе». null — предлагать нечего */
  otherCampus: Campus | null
  onSwitchCampus: (id: CampusId) => void
}

/**
 * Список результатов. Один и тот же компонент на одном и том же месте дерева
 * и в режиме набора, и после подтверждения: иначе тап по строке, который
 * переключает режим, не доехал бы до onClick — React успел бы размонтировать
 * кнопку между pointerup и click.
 */
const ResultList = ({
  search,
  selection,
  onOpen,
  emptyHint,
  otherCampus,
  onSwitchCampus,
}: ResultListProps) => {
  if (!search.found) {
    return (
      <div className="campus-map-page__rooms">
        <p className="campus-map-page__empty">{search.emptyText}</p>
        <p className="campus-map-page__empty-hint">{emptyHint}</p>
        {otherCampus && (
          <button
            type="button"
            className="campus-map-page__other-campus"
            onClick={() => onSwitchCampus(otherCampus.id)}
          >
            {`Есть в кампусе «${otherCampus.shortName}» — показать`}
          </button>
        )}
      </div>
    )
  }

  const groups = search.floors.filter((item) => item.rows.length > 0)

  return (
    <div className="campus-map-page__rooms">
      {search.heading && <p className="campus-map-page__result-title">{search.heading}</p>}
      {groups.map((group) => (
        <div key={group.floor.id} className="campus-map-page__group">
          <h2 className="campus-map-page__group-title">{group.floor.label}</h2>
          {group.rows.map((row) => (
            <ResultRow
              key={row.key}
              row={row}
              current={
                selection?.floorId === group.floor.id &&
                row.ids.some((id) => selection.ids.includes(id))
              }
              onOpen={() => onOpen(group.floor, row)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/* ─── страница ───────────────────────────────────────────────────────────── */

export const CampusMapPage = () => {
  const navigate = useNavigate()
  const zoomedRef = useRef(false)
  const [zoomed, setZoomed] = useState(false)
  const { rootRef, rootClassName, navigateBack } = usePageSwipeRight({
    backTo: '/afisha',
    // Панорамирование приближённого плана начинается от левого края экрана так
    // же, как жест «назад», — на зуме жест выключаем целиком: запрет одного
    // commit оставлял видимое перетаскивание страницы с «Афишей» под ней.
    edgeSwipeEnabled: !zoomed,
    // Страховка к edgeSwipeEnabled: на зуме жест не коммитим.
    canEdgeSwipeCommit: () => !zoomedRef.current,
    // Хук на запрещённый commit ВСЁ РАВНО зовёт onEdgeSwipeBack (там это
    // сделано ради confirm-диалогов), поэтому тот же запрет дублируем здесь:
    // без него палец на зуме всё равно увёл бы с экрана.
    onEdgeSwipeBack: () => {
      if (!zoomedRef.current) navigate('/afisha')
    },
  })

  const [campusId, setCampusId] = useState<CampusId>(readStoredCampusId)
  const campus = useMemo(() => getCampus(campusId), [campusId])
  const [floorId, setFloorId] = useState(() => getCampus(readStoredCampusId()).floors[0].id)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<Mode>('browse')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [zoomRequest, setZoomRequest] = useState<ZoomRequest | null>(null)
  const [howtoOpen, setHowtoOpen] = useState(false)
  const [mapHeight, setMapHeight] = useState(readMapHeight)
  const [viewportWidth, setViewportWidth] = useState(0)
  // Пока картинка этажа не загрузилась, плашки и подсветка ездят по пустоте —
  // держим их скрытыми и показываем вместе с планом.
  const [loadedAssets, setLoadedAssets] = useState<ReadonlySet<string>>(() => new Set<string>())

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const floorsRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Первый рендер чипы не двигает: активен всегда первый этаж, он и так виден
  const floorsScrolledRef = useRef(false)
  const transformRef = useRef<Transform>(IDENTITY)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distance: number; midX: number; midY: number } | null>(null)
  const tapRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const lastTapRef = useRef<{ x: number; y: number; time: number } | null>(null)
  // Палец уехал — значит это было панорамирование, а не тап по плашке
  const draggedRef = useRef(false)
  // Второй тап двойного тапа приезжает ещё и кликом. Храним СРОК, до которого
  // клик надо проглотить: липкий флаг однажды оставался поднятым (если эхо не
  // приходило) и съедал следующий честный тап.
  const swallowClickUntilRef = useRef(0)
  // Выбор до клика первого тапа. Двойной тап распознаётся только на ВТОРОМ
  // pointerup, а click первого приходит раньше и успевает переключить плашку:
  // как только жест оказался двойным тапом, возвращаем то, что было.
  const tapSelectionRef = useRef<{ value: Selection | null } | null>(null)
  // Прямоугольник окна карты на время жеста: getBoundingClientRect на каждый
  // pointermove — это layout на каждый кадр перетаскивания.
  const viewportRectRef = useRef<DOMRect | null>(null)
  const zoomTokenRef = useRef(0)
  // Заявку на приближение исполняем один раз: planBox и zoomToRect
  // пересоздаются на любом изменении размеров окна, и без этой отметки поворот
  // экрана снова вжимал бы карту в цель после явного «Сбросить».
  const appliedZoomTokenRef = useRef(0)

  const floor = useMemo(
    () => campus.floors.find((item) => item.id === floorId) ?? campus.floors[0],
    [campus, floorId],
  )

  /** Один расчёт поиска на рендер: второй, синхронный, в обработчике ввода не нужен */
  const search = useMemo(() => buildCampusSearch(campus, query), [campus, query])

  const showMap = mode !== 'typing'
  const showBrowseExtras = mode === 'browse'

  const planBox = useMemo(
    () => fitPlanBox(viewportWidth, mapHeight, floor.viewBox),
    [viewportWidth, mapHeight, floor],
  )

  const planReady = loadedAssets.has(floor.asset)
  const legend = useMemo(() => campusLegend(campus), [campus])

  const currentMatch = useMemo(
    () => search?.floors.find((item) => item.floor.id === floor.id) ?? null,
    [search, floor],
  )

  const foundFloors = useMemo(
    () => new Set((search?.floors ?? []).filter(campusFloorHasHits).map((item) => item.floor.id)),
    [search],
  )

  const highlightIds = useMemo(() => {
    const ids = new Set(currentMatch?.ids ?? [])
    if (selection?.floorId === floor.id) selection.ids.forEach((id) => ids.add(id))
    return ids
  }, [currentMatch, selection, floor])

  const focusIds = useMemo(
    () => new Set(selection?.floorId === floor.id ? selection.ids : []),
    [selection, floor],
  )

  const directoryGroups = useMemo(
    () => (campus.groupRoomsByZone ? groupRoomsByZone(campus, floor.rooms) : null),
    [campus, floor],
  )

  const totalRows = useMemo(
    () => (search ? search.floors.reduce((sum, item) => sum + item.rows.length, 0) : 0),
    [search],
  )

  const hitFloorIds = useMemo(
    () => (search ? search.floors.filter(campusFloorHasHits).map((item) => item.floor.id) : []),
    [search],
  )

  const emptyHint = useMemo(() => {
    const codes = sampleCodes(campus)
    return codes.length > 0
      ? `Проверьте номер (${codes.join(', ')}) или ищите по названию`
      : 'Проверьте номер или ищите по названию'
  }, [campus])

  /** Второй кампус — для подсказки «есть в другом кампусе» и переключателя */
  const otherCampus = useMemo(
    () => CAMPUSES.find((item) => item.id !== campus.id) ?? null,
    [campus],
  )

  /**
   * Запрос не нашёлся здесь, но находится в соседнем кампусе. Считаем только
   * когда своих результатов нет, — иначе лишний проход по второму кампусу на
   * каждую букву.
   */
  const foundInOtherCampus = useMemo(() => {
    if (!search || search.found || !otherCampus) return false
    return buildCampusSearch(otherCampus, query)?.found === true
  }, [search, otherCampus, query])

  /** Трансформацию правим напрямую в DOM: на pointermove перерисовка React лишняя. */
  const applyTransform = useCallback((next: Transform) => {
    transformRef.current = next
    const stage = stageRef.current
    if (stage) {
      stage.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`
    }
    // Обводка живёт внутри трансформированного слоя и растёт вместе с планом:
    // компенсируем масштабом, иначе на 4x рамка в 2px выглядит как 8px.
    viewportRef.current?.style.setProperty('--campus-map-line', `${2 / next.scale}px`)
    const nextZoomed = next.scale > 1.001
    if (zoomedRef.current !== nextZoomed) {
      zoomedRef.current = nextZoomed
      setZoomed(nextZoomed)
    }
  }, [])

  const resetTransform = useCallback(() => {
    pointersRef.current.clear()
    pinchRef.current = null
    applyTransform(IDENTITY)
  }, [applyTransform])

  // Смена этажа — новая картинка, старый зум и выбор к ней не относятся
  const selectFloor = useCallback(
    (id: number) => {
      setFloorId(id)
      setSelection(null)
      setZoomRequest(null)
      resetTransform()
    },
    [resetTransform],
  )

  const requestZoom = useCallback((targetFloorId: number, ids: string[], keyboardOpen: boolean) => {
    // Приближать не к чему — но и прошлая заявка больше не актуальна
    if (ids.length === 0) {
      setZoomRequest(null)
      return
    }
    zoomTokenRef.current += 1
    setZoomRequest({ token: zoomTokenRef.current, floorId: targetFloorId, ids, keyboardOpen })
  }, [])

  /**
   * Активный чип должен быть виден: этажей девять, в строку они не влезают.
   * Двигаем сам список чипов, а не scrollIntoView: тот прокручивает ВСЕ
   * прокручиваемые предки, включая обёртку свайп-оверлея с overflow: hidden.
   * На монтировании страница ещё едет справа (enter-анимация), у обёртки от
   * этого появляется горизонтальный скролл — и экран уезжает вбок, обнажая
   * «Афишу». Плюс на первом рендере активен первый этаж: двигать нечего.
   */
  useEffect(() => {
    const list = floorsRef.current
    const active = list?.querySelector<HTMLElement>('.campus-map-page__floor--active')
    const scrolled = floorsScrolledRef.current
    floorsScrolledRef.current = true
    if (!list || !active || !scrolled) return
    const target = Math.max(
      0,
      Math.min(
        list.scrollWidth - list.clientWidth,
        active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2,
      ),
    )
    if (Math.abs(list.scrollLeft - target) > 1) {
      list.scrollTo({ left: target, behavior: scrollBehavior() })
    }
    // showMap в зависимостях не лишний: на время набора лента размонтируется, и
    // назад она приезжает новым элементом со scrollLeft = 0, хотя этаж тот же.
  }, [floorId, showMap])

  /** Прокрутка к плану — по своему контейнеру, без scrollIntoView (см. выше). */
  const scrollToMap = useCallback((keyboardOpen: boolean) => {
    const run = (): number => {
      const scroller = scrollRef.current
      const viewport = viewportRef.current
      if (!scroller || !viewport) return 0
      const offset = viewport.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      const centered =
        scroller.scrollTop + offset - (scroller.clientHeight - viewport.offsetHeight) / 2
      scroller.scrollTo({
        top: Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, centered)),
        behavior: scrollBehavior(),
      })
      return scroller.clientHeight
    }
    // Прокрутке предшествует blur, но клавиатура уезжает не мгновенно: по
    // ужатому скроллеру слагаемое (clientHeight − высота карты) / 2 уходит в
    // минус — карта встаёт выше верхней кромки. Поэтому ждём, пока вебвью
    // вернёт высоту, и прокручиваем один раз.
    afterKeyboardHidden(keyboardOpen, () => {
      const height = run()
      if (height <= 0) return
      // Страховка: resize не пришёл и сработал таймер, а высота всё-таки
      // поменялась позже — пересчитываем.
      window.setTimeout(() => {
        if ((scrollRef.current?.clientHeight ?? 0) !== height) run()
      }, KEYBOARD_ANIM_MS)
    })
  }, [])

  /** Масштаб вокруг точки: содержимое под пальцем остаётся под пальцем. */
  const zoomAround = useCallback(
    (scale: number, pointX: number, pointY: number) => {
      const current = transformRef.current
      const factor = scale / current.scale
      applyTransform(
        clampTransform(
          {
            scale,
            x: pointX - (pointX - current.x) * factor,
            y: pointY - (pointY - current.y) * factor,
          },
          viewportWidth,
          mapHeight,
        ),
      )
    },
    [applyTransform, viewportWidth, mapHeight],
  )

  /**
   * Приблизить к прямоугольнику (координаты — пиксели окна карты без
   * трансформации). Целимся не в центр окна, а в центр его ВИДИМОЙ части:
   * под клавиатурой окно карты наполовину уходит за нижнюю кромку скроллера,
   * и «приближённое» помещение оказывалось ровно под клавиатурой.
   */
  const zoomToRect = useCallback(
    (x: number, y: number, w: number, h: number, maxScale: number) => {
      const width = viewportWidth
      const height = mapHeight
      const viewport = viewportRef.current
      if (width <= 0 || height <= 0 || w <= 0 || h <= 0 || !viewport) return

      let visibleTop = 0
      let visibleBottom = height
      const scroller = scrollRef.current
      if (scroller) {
        const rect = viewport.getBoundingClientRect()
        const scrollRect = scroller.getBoundingClientRect()
        const top = Math.max(0, scrollRect.top - rect.top)
        const bottom = Math.min(height, scrollRect.bottom - rect.top)
        // Сколько карты видно, когда она доехала до места: под клавиатурой
        // скроллер ниже самой карты, и целиком её не покажешь.
        const slice = Math.min(height, scroller.clientHeight)
        if (bottom - top >= slice - 1) {
          visibleTop = top
          visibleBottom = bottom
        } else {
          // Карта ещё за кромкой (тап по результату из длинного списка): меряем
          // не текущее пересечение — по нему масштаб выходил ровно 1, — а то,
          // каким оно станет после scrollToMap, который центрирует карту.
          visibleTop = (height - slice) / 2
          visibleBottom = visibleTop + slice
        }
      }

      const visibleHeight = visibleBottom - visibleTop
      const scale = Math.min(
        maxScale,
        Math.max(
          MIN_SCALE,
          Math.min(width / (w + FIT_PADDING * 2), visibleHeight / (h + FIT_PADDING * 2)),
        ),
      )
      applyTransform(
        clampTransform(
          {
            scale,
            x: width / 2 - (x + w / 2) * scale,
            y: (visibleTop + visibleBottom) / 2 - (y + h / 2) * scale,
          },
          width,
          height,
        ),
      )
    },
    [applyTransform, viewportWidth, mapHeight],
  )

  // Высота окна карты: на монтировании и на повороте экрана. На повороте
  // innerHeight обновляется не сразу — перечитываем ещё раз кадром позже.
  useEffect(() => {
    let timer = 0
    const update = () => {
      setMapHeight(readMapHeight())
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setMapHeight(readMapHeight()), 250)
    }
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('orientationchange', update)
      window.clearTimeout(timer)
    }
  }, [])

  // Ширина окна карты. Она не зависит от клавиатуры, поэтому наблюдателя
  // держим постоянно: меняется только на повороте и в сплит-вью.
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    setViewportWidth(viewport.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0
      if (next > 0) setViewportWidth(next)
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [showMap])

  // Остальные этажи кампуса догружаем в простое: перелистывание чипов не
  // должно упираться в сеть. requestIdleCallback есть не везде — фолбэк таймером.
  useEffect(() => {
    const assets = campus.floors.map((item) => item.asset)
    let cancelled = false
    const preload = () => {
      if (cancelled) return
      for (const asset of assets) {
        const image = new Image()
        image.decoding = 'async'
        image.src = asset
      }
    }
    const idle =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(preload)
        : window.setTimeout(preload, 400)
    return () => {
      cancelled = true
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle)
      else window.clearTimeout(idle)
    }
  }, [campus])

  // Приближаем к совпадениям после того, как React отрисовал нужный этаж.
  // planBox в зависимостях не для красоты: при тапе по результату из режима
  // набора окно карты только монтируется, его ширина известна кадром позже —
  // эффект повторится с настоящими числами.
  useEffect(() => {
    if (!zoomRequest || zoomRequest.floorId !== floor.id || planBox.width <= 0) return
    // Заявка уже исполнена: повтор эффекта здесь — это смена размеров окна
    // (поворот, сплит-вью), а не новый запрос. Приближать снова нельзя: к этому
    // моменту масштаб мог быть сброшен кнопкой или двойным тапом.
    if (appliedZoomTokenRef.current === zoomRequest.token) return
    const ids = new Set(zoomRequest.ids)
    const targets = floor.markers.filter((marker) => ids.has(marker.id))
    if (targets.length === 0) return
    let timer = 0
    // Клавиатура ещё открыта (Enter, тап по результату из набора) — приближаем,
    // когда вебвью вернул высоту: zoomToRect меряет видимую часть по скроллеру.
    const cancelWait = afterKeyboardHidden(zoomRequest.keyboardOpen, () => {
      const box = floor.viewBox
      const x0 = Math.min(...targets.map((marker) => marker.x))
      const y0 = Math.min(...targets.map((marker) => marker.y))
      const x1 = Math.max(...targets.map((marker) => marker.x + marker.w))
      const y1 = Math.max(...targets.map((marker) => marker.y + marker.h))
      const apply = () =>
        zoomToRect(
          planBox.left + (x0 - box.x) * planBox.scale,
          planBox.top + (y0 - box.y) * planBox.scale,
          (x1 - x0) * planBox.scale,
          (y1 - y0) * planBox.scale,
          // Одна плашка — можно и до упора: 45pt на плане иначе не прочитать.
          targets.length === 1 ? MAX_SCALE : FIT_MAX_SCALE,
        )
      apply()
      appliedZoomTokenRef.current = zoomRequest.token
      // Страховка на случай, когда высоту вернули уже после таймера
      // afterKeyboardHidden: с ужатым скроллером масштаб и центр выходят
      // заниженными. Повторяем расчёт, только если высота поменялась и карту с
      // тех пор не трогали руками (applyTransform кладёт в ref новый объект).
      const height = scrollRef.current?.clientHeight ?? 0
      const applied = transformRef.current
      timer = window.setTimeout(() => {
        if ((scrollRef.current?.clientHeight ?? 0) === height) return
        if (transformRef.current !== applied) return
        apply()
      }, KEYBOARD_ANIM_MS)
    })
    return () => {
      cancelWait()
      window.clearTimeout(timer)
    }
  }, [zoomRequest, floor, planBox, zoomToRect])

  // Колесо мыши — только десктоп. Слушателя вешаем руками: React вешает wheel
  // пассивно, и preventDefault из onWheel ничего бы не отменил.
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = viewport.getBoundingClientRect()
      const factor = event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP
      const scale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, transformRef.current.scale * factor),
      )
      zoomAround(scale, event.clientX - rect.left, event.clientY - rect.top)
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [showMap, zoomAround])

  const markLoaded = useCallback((asset: string) => {
    setLoadedAssets((current) => {
      if (current.has(asset)) return current
      const next = new Set(current)
      next.add(asset)
      return next
    })
  }, [])

  /* ─── поиск ─── */

  const handleQueryChange = (value: string) => {
    setQuery(value)
    setSelection(null)
    setZoomRequest(null)
    // Набор ничего не двигает: карта в этот момент не видна, а прыжок этажа и
    // масштаба под клавиатурой — ровно та боль, из-за которой всё переделано.
    resetTransform()
    setMode(value.trim() ? 'typing' : 'browse')
  }

  const clearQuery = () => {
    setQuery('')
    setMode('browse')
    setSelection(null)
    setZoomRequest(null)
    resetTransform()
    // Фокус возвращаем только из набора: там крестик жмут, чтобы набрать заново.
    // В режиме результата карта уже на экране, и поднятая клавиатура ужала бы
    // вебвью (Keyboard.resize = native) поверх плана, который человек смотрит.
    if (mode === 'typing') inputRef.current?.focus()
  }

  /** Подтверждение запроса: Enter на клавиатуре. Ничего не нашлось — остаёмся в наборе */
  const commitSearch = () => {
    if (!search || !search.found) return
    // До blur: прокрутка и зум дождутся, пока вебвью вернёт высоту (afterKeyboardHidden)
    const keyboardOpen = getNativeKeyboardHeight() > 0
    inputRef.current?.blur()
    const hits = search.floors.filter(campusFloorHasHits)
    const rows = search.floors.flatMap((item) =>
      item.rows.map((row) => ({ floor: item.floor, row })),
    )
    // Единственный результат — сразу открываем его, как по тапу
    const only = rows.length === 1 && rows[0].row.ids.length > 0 ? rows[0] : null
    const target = only
      ? only.floor
      : (hits.find((item) => item.floor.id === floor.id) ?? hits[0]).floor

    setMode('result')
    setFloorId(target.id)
    resetTransform()
    // Чипы и карта вставляются НАД списком: без этой прокрутки пролистанный
    // список остаётся на месте, а карта оказывается выше видимой области.
    // zoomToRect считает срез ровно по состоянию ПОСЛЕ неё.
    scrollToMap(keyboardOpen)

    if (only) {
      setSelection({
        floorId: only.floor.id,
        ids: only.row.ids,
        code: only.row.code,
        title: only.row.title,
        zone: only.row.zone,
      })
      requestZoom(only.floor.id, only.row.ids, keyboardOpen)
      return
    }

    setSelection(null)
    const targetIds = search.floors.find((item) => item.floor.id === target.id)?.ids
    requestZoom(target.id, targetIds ? [...targetIds] : [], keyboardOpen)
  }

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    // Идёт набор через IME (китайский/японский) — Enter подтверждает подстановку
    if (event.nativeEvent.isComposing) return
    event.preventDefault()
    commitSearch()
  }

  // Тап по результату: этаж, фокус на его плашках, приближение и прокрутка
  // к карте. Запрос остаётся — список результатов никуда не девается.
  const openFromSearch = (target: CampusFloor, row: CampusResultRow) => {
    if (row.ids.length === 0) return
    // Сначала убираем клавиатуру: иначе она закрывает половину плана, к
    // которому мы прокручиваем. Открыта ли она, читаем до blur (см. commitSearch).
    const keyboardOpen = getNativeKeyboardHeight() > 0
    inputRef.current?.blur()
    setMode('result')
    setFloorId(target.id)
    resetTransform()
    setSelection({
      floorId: target.id,
      ids: row.ids,
      code: row.code,
      title: row.title,
      zone: row.zone,
    })
    requestZoom(target.id, row.ids, keyboardOpen)
    scrollToMap(keyboardOpen)
  }

  /** Смена кампуса: всё, что относилось к прежнему, сбрасывается */
  const switchCampus = (id: CampusId, keepQuery = false) => {
    if (id === campusId) return
    storeCampusId(id)
    setCampusId(id)
    setFloorId(getCampus(id).floors[0].id)
    setSelection(null)
    setZoomRequest(null)
    resetTransform()
    setLoadedAssets(new Set())
    if (!keepQuery) {
      setQuery('')
      setMode('browse')
    }
    // Чипы этажей и сама простыня — к началу: у нового кампуса другой список
    floorsRef.current?.scrollTo({ left: 0 })
    if (!keepQuery) scrollRef.current?.scrollTo({ top: 0 })
  }

  // Нажали «Назад» в шапке: экран уходит, из набора его не выводим.
  const leavingRef = useRef(false)

  /**
   * Клавиатуру убрали без Enter: «Готово» над клавиатурой iOS, «Назад» на
   * Android, тап мимо поля. Набор на этом кончился — возвращаем карту: есть
   * совпадения — режим результата и этаж с подсветкой, нет — обзор. Без
   * приближения и прокрутки: человек ничего не выбирал. Режим результата не
   * трогаем — его уже выставили Enter или тап по строке.
   */
  const leaveTyping = () => {
    if (mode === 'result' || leavingRef.current) return
    if (!search?.found) {
      setMode('browse')
      return
    }
    const hits = search.floors.filter(campusFloorHasHits)
    const target = hits.find((item) => item.floor.id === floor.id) ?? hits[0]
    setMode('result')
    if (target) setFloorId(target.floor.id)
  }

  // Выход из набора зовётся из таймера, а к тому времени запрос, кампус и режим
  // могли смениться (тап по строке, «есть в другом кампусе») — нужна свежая версия.
  const leaveTypingRef = useRef(leaveTyping)
  useLayoutEffect(() => {
    leaveTypingRef.current = leaveTyping
  })

  /**
   * Откладываем на задачу: тап по строке результата приходит click'ом уже ПОСЛЕ
   * blur, и вставленные над списком чипы и карта увели бы строку из-под пальца.
   */
  const scheduleLeaveTyping = useCallback((unlessRefocused = false) => {
    window.setTimeout(() => {
      // тап по лупе или отступу поля: blur, и тут же <label> возвращает фокус в
      // поле — набор продолжается, карту не показываем
      if (unlessRefocused && document.activeElement === inputRef.current) return
      leaveTypingRef.current()
    }, 0)
  }, [])

  // На Android «Назад» прячет клавиатуру, не снимая фокуса с поля, — blur не
  // придёт. Ловим само исчезновение клавиатуры (на iOS оно приходит следом за
  // blur от «Готово», второй вызов ничего не меняет).
  useEffect(() => {
    if (mode !== 'typing') return
    return subscribeNativeKeyboardHeight((height) => {
      if (height === 0) scheduleLeaveTyping()
    })
  }, [mode, scheduleLeaveTyping])

  /* ─── жесты по карте ─── */

  const viewportRect = (): DOMRect | null =>
    viewportRectRef.current ?? viewportRef.current?.getBoundingClientRect() ?? null

  const pointerCenter = () => {
    const points = [...pointersRef.current.values()]
    const rect = viewportRect()
    const first = points[0]
    const second = points[1]
    if (!first || !second || !rect) return null
    return {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      midX: (first.x + second.x) / 2 - rect.left,
      midY: (first.y + second.y) / 2 - rect.top,
    }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current
    if (pointers.size >= 2 && !pointers.has(event.pointerId)) return
    viewportRectRef.current = event.currentTarget.getBoundingClientRect()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Указатель уже неактивен (pointercancel опередил) — жест всё равно ведём по событиям
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size === 1) {
      tapRef.current = { x: event.clientX, y: event.clientY, moved: false }
      draggedRef.current = false
    } else {
      tapRef.current = null
      draggedRef.current = true
      pinchRef.current = pointerCenter()
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current
    const previous = pointers.get(event.pointerId)
    if (!previous) return

    const tap = tapRef.current
    if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > DOUBLE_TAP_PX) {
      tap.moved = true
      draggedRef.current = true
    }

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointers.size >= 2) {
      const before = pinchRef.current
      const after = pointerCenter()
      if (!before || !after || before.distance < 1) {
        pinchRef.current = after
        return
      }
      const current = transformRef.current
      const scale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, current.scale * (after.distance / before.distance)),
      )
      const factor = scale / current.scale
      applyTransform(
        clampTransform(
          {
            scale,
            x: after.midX - (before.midX - current.x) * factor,
            y: after.midY - (before.midY - current.y) * factor,
          },
          viewportWidth,
          mapHeight,
        ),
      )
      pinchRef.current = after
      return
    }

    const current = transformRef.current
    if (current.scale <= 1) return
    applyTransform(
      clampTransform(
        {
          scale: current.scale,
          x: current.x + (event.clientX - previous.x),
          y: current.y + (event.clientY - previous.y),
        },
        viewportWidth,
        mapHeight,
      ),
    )
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current
    if (!pointers.delete(event.pointerId)) return
    if (pointers.size < 2) pinchRef.current = null

    const tap = tapRef.current
    tapRef.current = null
    if (event.type === 'pointercancel' || !tap || tap.moved || pointers.size > 0) {
      lastTapRef.current = null
      return
    }

    const now = performance.now()
    const previous = lastTapRef.current
    const isDoubleTap =
      previous !== null &&
      now - previous.time < DOUBLE_TAP_MS &&
      Math.hypot(tap.x - previous.x, tap.y - previous.y) < DOUBLE_TAP_PX

    if (!isDoubleTap) {
      lastTapRef.current = { x: tap.x, y: tap.y, time: now }
      // Заготовку отката чистим до того, как придёт click этого тапа: он её и
      // заполнит, если попадёт по плашке.
      tapSelectionRef.current = null
      return
    }

    lastTapRef.current = null
    swallowClickUntilRef.current = now + SWALLOW_CLICK_MS
    // Жест оказался двойным тапом — значит выбор, сделанный кликом первого
    // тапа, человек не просил: возвращаем, что было до него. Иначе двойной тап
    // для возврата масштаба заодно снимал выбор или переносил его на соседа.
    const pending = tapSelectionRef.current
    tapSelectionRef.current = null
    if (pending) setSelection(pending.value)
    const rect = viewportRect()
    if (!rect) return
    if (transformRef.current.scale > 1.001) {
      applyTransform(IDENTITY)
    } else {
      zoomAround(DOUBLE_TAP_SCALE, tap.x - rect.left, tap.y - rect.top)
    }
  }

  const toggleMarker = (marker: CampusMarker) => {
    setSelection((current) => {
      const same =
        current?.floorId === floor.id && current.ids.length === 1 && current.ids[0] === marker.id
      if (same) return null
      return {
        floorId: floor.id,
        ids: [marker.id],
        code: marker.code ?? '',
        title: campusMarkerTitle(campus, floor, marker),
        zone: marker.zone,
      }
    })
  }

  /**
   * Ближайшая плашка к точке тапа. Точный closest('[data-marker-id]') требовал
   * попадания пальцем внутрь плашки, а на плане они бывают в пару миллиметров.
   * Переводим точку экрана в координаты viewBox (снимаем трансформацию и сдвиг
   * плана внутри окна) и берём ближайший прямоугольник в пределах порога.
   */
  const markerAtPoint = (clientX: number, clientY: number): CampusMarker | null => {
    const rect = viewportRect()
    if (!rect || planBox.scale <= 0) return null
    const transform = transformRef.current
    const box = floor.viewBox
    const localX = (clientX - rect.left - transform.x) / transform.scale
    const localY = (clientY - rect.top - transform.y) / transform.scale
    const unitX = box.x + (localX - planBox.left) / planBox.scale
    const unitY = box.y + (localY - planBox.top) / planBox.scale
    const threshold = TAP_SLOP_PX / transform.scale / planBox.scale

    let best: CampusMarker | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    for (const marker of floor.markers) {
      const dx = Math.max(marker.x - unitX, 0, unitX - (marker.x + marker.w))
      const dy = Math.max(marker.y - unitY, 0, unitY - (marker.y + marker.h))
      const distance = Math.hypot(dx, dy)
      if (distance < bestDistance) {
        bestDistance = distance
        best = marker
      }
    }
    return best && bestDistance <= threshold ? best : null
  }

  /**
   * Клик по плашке ловим на окне карты, а не на самой кнопке: окно держит
   * pointer capture, и браузер уводит на него и pointerup, и click (проверено).
   * С клавиатуры target — сама кнопка, точка нажатия там бессмысленна (0;0).
   */
  const handleViewportClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    // Кнопки поверх карты лежат ВНУТРИ окна, и их click всплывает сюда: хит-тест
    // по координатам кнопки выбирал случайную плашку под ней. stopPropagation на
    // pointerdown тут не помогает — click приходит отдельным событием.
    if (
      (event.target as HTMLElement | null)?.closest(
        '.campus-map-page__reset, .campus-map-page__zoom',
      )
    ) {
      return
    }
    if (performance.now() < swallowClickUntilRef.current) {
      swallowClickUntilRef.current = 0
      return
    }
    if (event.detail === 0) {
      const id = (event.target as HTMLElement | null)
        ?.closest('[data-marker-id]')
        ?.getAttribute('data-marker-id')
      const marker = id ? floor.markers.find((item) => item.id === id) : undefined
      if (marker) toggleMarker(marker)
      return
    }
    // Панорамирование заканчивается кликом — но только у настоящего указателя
    if (draggedRef.current) return
    const marker = markerAtPoint(event.clientX, event.clientY)
    if (!marker) return
    // Этот клик может оказаться первым тапом двойного: запоминаем прежний выбор,
    // чтобы handlePointerUp вернул его, когда распознает жест (см. там же).
    tapSelectionRef.current = { value: selection }
    toggleMarker(marker)
  }

  /** Кнопки поверх карты не должны отдавать указатель окну: оно перехватит жест */
  const stopPointer = (event: ReactPointerEvent<HTMLElement>) => event.stopPropagation()

  const zoomByButton = (factor: number) => {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, transformRef.current.scale * factor))
    zoomAround(scale, viewportWidth / 2, mapHeight / 2)
  }

  const selected = selection?.floorId === floor.id ? selection : null
  const summaryText =
    search && search.found ? `Найдено ${totalRows} · ${floorsLabel(hitFloorIds)}` : ''
  const pinchHint = !selected && !summaryText && showMap && !zoomed
  const statusText = selected
    ? [selected.code, selected.title, zoneTitle(campus, selected.zone)].filter(Boolean).join(' · ')
    : summaryText
      ? summaryText
      : !showMap
        ? '' // «ничего не найдено» живёт только в списке, дважды не пишем
        : zoomed
          ? 'Двойной тап — вернуть масштаб'
          : 'Разведи пальцами, чтобы приблизить'

  return (
    <main ref={rootRef} className={`campus-map-page page-shell ${rootClassName}`}>
      <div className="campus-map-page__content page-shell__content">
        <div className="campus-map-page__header">
          <button
            type="button"
            className="campus-map-page__back"
            onClick={() => {
              // страница уезжает — не вставлять карту в уходящий экран по blur поля
              leavingRef.current = true
              navigateBack()
            }}
            aria-label="Назад"
          >
            <FiArrowLeft size={28} />
          </button>
          <h1 className="campus-map-page__title">Карта кампуса</h1>
          <div className="campus-map-page__campus" role="tablist" aria-label="Кампус">
            {CAMPUSES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === campus.id}
                className={`campus-map-page__campus-option${
                  item.id === campus.id ? ' campus-map-page__campus-option--active' : ''
                }`}
                onClick={() => switchCampus(item.id)}
                // Короткая подпись только для глаз: экранный диктор читает полную
                aria-label={item.switchLabel}
              >
                {item.switchLabelShort ? (
                  <>
                    <span className="campus-map-page__campus-label">{item.switchLabel}</span>
                    <span className="campus-map-page__campus-label campus-map-page__campus-label--short">
                      {item.switchLabelShort}
                    </span>
                  </>
                ) : (
                  item.switchLabel
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="campus-map-page__list-block page-list-block">
          <div ref={scrollRef} className="campus-map-page__scroll page-list-block__scroll">
            <label className="campus-map-page__search">
              <FiSearch className="campus-map-page__search-icon" aria-hidden />
              <input
                ref={inputRef}
                type="search"
                inputMode="search"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                enterKeyHint="search"
                aria-label="Поиск по кампусу"
                className="campus-map-page__search-input"
                placeholder={campus.searchPlaceholder}
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                onBlur={(event) => {
                  // Фокус забрала кнопка под полем (крестик, строка результата,
                  // «есть в другом кампусе» — в Chrome кнопки фокусируемые):
                  // режим решит её onClick.
                  if (
                    event.relatedTarget?.closest(
                      '.campus-map-page__search, .campus-map-page__rooms',
                    )
                  ) {
                    return
                  }
                  scheduleLeaveTyping(true)
                }}
              />
              {query !== '' && (
                <button
                  type="button"
                  className="campus-map-page__search-clear"
                  onClick={clearQuery}
                  aria-label="Очистить поиск"
                >
                  <FiX size={18} aria-hidden />
                </button>
              )}
            </label>

            {showMap ? (
              <div className="campus-map-page__floors">
                <span className="campus-map-page__floors-label">Этаж</span>
                <div className="campus-map-page__floors-list" ref={floorsRef}>
                  {campus.floors.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`campus-map-page__floor${
                        item.id === floor.id ? ' campus-map-page__floor--active' : ''
                      }${foundFloors.has(item.id) ? ' campus-map-page__floor--found' : ''}`}
                      onClick={() => selectFloor(item.id)}
                      aria-pressed={item.id === floor.id}
                    >
                      {item.id}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {showMap ? (
              <div
                ref={viewportRef}
                className="campus-map-page__viewport"
                role="group"
                aria-label={`План этажа ${floor.id}`}
                style={
                  {
                    '--campus-map-h': `${mapHeight}px`,
                    // Не менять: на масштабе 1 вертикальная прокрутка страницы
                    // должна работать пальцем прямо по плану (проверено на устройстве)
                    touchAction: zoomed ? 'none' : 'pan-y',
                  } as CSSProperties
                }
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onClick={handleViewportClick}
              >
                <div ref={stageRef} className="campus-map-page__stage">
                  {/* Прямоугольник плана: размеры считаем сами (contain), чтобы
                      проценты плашек и математика зума жили в одной системе */}
                  <div
                    className="campus-map-page__plan-box"
                    style={{
                      left: `${planBox.left}px`,
                      top: `${planBox.top}px`,
                      width: `${planBox.width}px`,
                      height: `${planBox.height}px`,
                    }}
                  >
                    <img
                      key={floor.asset}
                      src={floor.asset}
                      alt={`План этажа ${floor.id}`}
                      draggable={false}
                      decoding="async"
                      className={`campus-map-page__plan${
                        planReady ? ' campus-map-page__plan--ready' : ''
                      }`}
                      onLoad={() => markLoaded(floor.asset)}
                      ref={(node) => {
                        // Картинка из кеша бывает готова ещё до подписки на onLoad
                        if (node?.complete) markLoaded(floor.asset)
                      }}
                    />
                    <div
                      className={`campus-map-page__markers${
                        planReady ? ' campus-map-page__markers--ready' : ''
                      }`}
                    >
                      {floor.markers.map((marker) => (
                        <MapMarker
                          key={marker.id}
                          id={marker.id}
                          label={[marker.code, marker.title].filter(Boolean).join(' ')}
                          left={((marker.x - floor.viewBox.x) / floor.viewBox.w) * 100}
                          top={((marker.y - floor.viewBox.y) / floor.viewBox.h) * 100}
                          width={(marker.w / floor.viewBox.w) * 100}
                          height={(marker.h / floor.viewBox.h) * 100}
                          hit={highlightIds.has(marker.id)}
                          focus={focusIds.has(marker.id)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {zoomed && (
                  <button
                    type="button"
                    className="campus-map-page__reset"
                    onPointerDown={stopPointer}
                    onClick={resetTransform}
                  >
                    Сбросить
                  </button>
                )}

                {/* Только для мыши: на телефоне кнопки лишние, там щипок */}
                <div className="campus-map-page__zoom">
                  <button
                    type="button"
                    className="campus-map-page__zoom-btn"
                    onPointerDown={stopPointer}
                    onClick={() => zoomByButton(ZOOM_BUTTON_STEP)}
                    aria-label="Приблизить"
                  >
                    <FiPlus size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="campus-map-page__zoom-btn"
                    onPointerDown={stopPointer}
                    onClick={() => zoomByButton(1 / ZOOM_BUTTON_STEP)}
                    aria-label="Отдалить"
                  >
                    <FiMinus size={16} aria-hidden />
                  </button>
                </div>
              </div>
            ) : null}

            {/* Одна строка на все состояния: место под планом не должно скакать */}
            <p
              className={`campus-map-page__status${
                pinchHint ? ' campus-map-page__status--hint' : ''
              }`}
              role="status"
              aria-live="polite"
            >
              {statusText}
            </p>

            {showBrowseExtras ? (
              <div className="campus-map-page__legend">
                {legend.map((item) => (
                  <span key={item.label} className="campus-map-page__legend-item">
                    <i
                      className="campus-map-page__legend-dot"
                      style={{ background: item.color }}
                      aria-hidden
                    />
                    {item.label}
                  </span>
                ))}
              </div>
            ) : null}

            {search ? (
              <ResultList
                search={search}
                selection={selection}
                onOpen={openFromSearch}
                emptyHint={emptyHint}
                otherCampus={foundInOtherCampus ? otherCampus : null}
                onSwitchCampus={(id) => {
                  switchCampus(id, true)
                  // Поле в фокусе (на iOS тап по кнопке его не снимает) — набор
                  // продолжается. Иначе клавиатуры уже нет: показываем найденное
                  // на карте, как после «Готово».
                  if (document.activeElement !== inputRef.current) scheduleLeaveTyping()
                }}
              />
            ) : (
              <div className="campus-map-page__rooms">
                {directoryGroups
                  ? directoryGroups.map((group) => (
                      <div key={group.zone} className="campus-map-page__group">
                        <h2 className="campus-map-page__group-title">
                          {zoneTitle(campus, group.zone)}
                        </h2>
                        {group.items.map((room) => (
                          <RoomRow key={`${room.codes}-${room.title}`} room={room} />
                        ))}
                      </div>
                    ))
                  : // Кампус без деления на корпуса: плоский список без заголовков
                    floor.rooms.map((room) => (
                      <RoomRow key={`${room.codes}-${room.title}`} room={room} />
                    ))}
              </div>
            )}

            {showBrowseExtras ? (
              <div className="campus-map-page__howto">
                <button
                  type="button"
                  className="campus-map-page__howto-toggle"
                  onClick={() => setHowtoOpen((open) => !open)}
                  aria-expanded={howtoOpen}
                >
                  {campus.howtoTitle}
                  {/* Поворачиваем обёртку, а не сам <svg>: так результат не зависит
                      от того, как движок обходится с transform у корневого SVG. */}
                  <span
                    className={`campus-map-page__howto-chevron${
                      howtoOpen ? ' campus-map-page__howto-chevron--open' : ''
                    }`}
                    aria-hidden
                  >
                    <FiChevronDown size={20} />
                  </span>
                </button>
                {howtoOpen && <p className="campus-map-page__howto-text">{campus.howtoText}</p>}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}
