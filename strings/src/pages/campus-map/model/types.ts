// Типы карты кампуса. Файл написан руками: генератор
// scripts/campus-map/build-floors.py их только импортирует.

/** Вид помещения по цвету плашки на плане (легенда карты) */
export type CampusMarkerKind = 'students' | 'food' | 'teachers' | 'fitness' | 'closed' | 'wellbeing'

/** Плашка помещения с плана этажа. Координаты — в системе viewBox своего floor-N.svg */
export type CampusMarker = {
  id: string
  /** Номер помещения с плана, латиницей. null — плашка без номера */
  code: string | null
  title: string
  /** Корпус: у «Дуката» башня B/F, у «Телеграфа» N/S/E/W. null — плашка без номера */
  zone: string | null
  kind: CampusMarkerKind
  x: number
  y: number
  w: number
  h: number
}

export type CampusId = 'dukat' | 'telegraph'

/** Корпус (башня, сторона света): буква в номере помещения и подпись для человека */
export type CampusZone = { id: string; title: string }

export type CampusRoom = {
  /** Как напечатано на плане: «B106–B108», «B112, B118». Пусто — помещение без номера */
  codes: string
  title: string
  /** Корпус помещения. null — корпуса нет (кампус без деления или общая зона) */
  zone: string | null
}

export type CampusFloor = {
  id: number
  label: string
  asset: string
  /** viewBox плана: из w/h берётся aspect-ratio вьюпорта, x/y нужны маркерам */
  viewBox: { x: number; y: number; w: number; h: number }
  rooms: CampusRoom[]
  /** Плашки помещений с плана, координаты — в системе viewBox */
  markers: CampusMarker[]
}

/**
 * Ручной синоним поиска. Помещение задаётся этажом и названием, а если
 * названий-близнецов на этаже несколько — то ещё и номерами.
 */
export type CampusSearchAlias = { floor: number; aliases: string[] } & (
  | { title: string; codes?: string }
  | { codes: string; title?: string }
)

/** Слова легенды: по ним ищут «еду» и «фитнес», а не конкретное помещение */
export type CampusCategorySynonym = { kind: CampusMarkerKind; words: string[] }

export type Campus = {
  id: CampusId
  /** Полное название: подзаголовок страницы */
  name: string
  shortName: string
  /** Подпись на переключателе кампусов */
  switchLabel: string
  /** Короткая подпись для экранов уже 360px, где полная не влезает. Нет — везде полная */
  switchLabelShort?: string
  searchPlaceholder: string
  /** Корпуса в порядке показа в списке помещений */
  zones: CampusZone[]
  /** Группировать список помещений по корпусам. false — плоский список */
  groupRoomsByZone: boolean
  /** Буквы номеров помещений, латиницей и в нижнем регистре: ['b', 'f'] */
  codeLetters: string[]
  /**
   * Кириллическая буква, которую набирают вместо латинской, — только в позиции
   * кода (буква и сразу за ней цифры). Значение — латинская буква из codeLetters.
   */
  cyrillicCodeLetters: Record<string, string>
  /** В номерах бывает дробная часть: S306.1 и S306.2 — два разных помещения */
  codeSuffix: boolean
  /**
   * Шаг номеров внутри диапазона «B202–B218»: в башне B кольцо чётных номеров,
   * поэтому 2, а там, где номера идут подряд, — 1.
   */
  rangeStep: (zoneId: string, from: number, to: number) => number
  /** Подписи видов помещений. Виды, которых в кампусе нет, можно не указывать */
  kindLabels: Partial<Record<CampusMarkerKind, string>>
  /** Виды в легенде под планом, в порядке показа */
  legendKinds: CampusMarkerKind[]
  howtoTitle: string
  howtoText: string
  floors: CampusFloor[]
  aliases: CampusSearchAlias[]
  categorySynonyms: CampusCategorySynonym[]
}

/** Строка списка результатов: помещение из списка или отдельная плашка */
export type CampusResultRow = {
  key: string
  code: string
  title: string
  zone: string | null
  /** Плашки, на которые встаёт фокус по тапу */
  ids: string[]
}

export type CampusFloorResult = {
  floor: CampusFloor
  /** Плашки, которые надо подсветить */
  ids: Set<string>
  rows: CampusResultRow[]
}

export type CampusSearch = {
  kind: 'code' | 'category' | 'text'
  /** Заголовок над списком: «Еда, кухни, вендинги · 12 мест» */
  heading: string | null
  floors: CampusFloorResult[]
  found: boolean
  /** Что показать, когда не нашлось ничего */
  emptyText: string
}
