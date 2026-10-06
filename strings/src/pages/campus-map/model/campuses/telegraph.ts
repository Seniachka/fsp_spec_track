import floor1Url from '../../../../assets/campus-map/telegraph/floor-1.svg?url'
import floor2Url from '../../../../assets/campus-map/telegraph/floor-2.svg?url'
import floor3Url from '../../../../assets/campus-map/telegraph/floor-3.svg?url'
import { TELEGRAPH_MARKERS } from '../telegraphMarkers.generated'
import type { Campus, CampusCategorySynonym, CampusFloor, CampusSearchAlias } from '../types'

/**
 * Синонимы: на плашках подписи короткие («Ресепшн», «Техно точка»), а ищут
 * помещение обиходным словом — «рецепшен», «деканат», «медпункт».
 */
const RECEPTION_ALIASES = ['Ресепшен', 'Рецепшн', 'Рецепшен', 'Стойка информации', 'Информация']

const ALIASES: CampusSearchAlias[] = [
  { floor: 1, title: 'Ресепшн', aliases: RECEPTION_ALIASES },
  { floor: 2, title: 'Ресепшн', aliases: RECEPTION_ALIASES },
  { floor: 1, title: 'Гардероб', aliases: ['Раздевалка', 'Сдать вещи', 'Куртка'] },
  {
    floor: 1,
    title: 'Бюро пропусков',
    aliases: ['Пропуск', 'Пропуска', 'Заказать пропуск', 'Охрана'],
  },
  { floor: 1, title: 'Вход', aliases: ['Главный вход', 'Тверская', 'Метро', 'Охотный ряд'] },
  { floor: 2, title: 'Исторический вход', aliases: ['Вход'] },
  { floor: 2, title: 'Обеденный зал', aliases: ['Столовая', 'Обед'] },
  { floor: 2, title: 'Кафе Лицей', aliases: ['Лицей'] },
  { floor: 2, title: 'Радиостудия', aliases: ['Радио', 'Студия', 'Подкаст'] },
  {
    floor: 3,
    title: 'Опенспейс',
    aliases: ['Коворкинг', 'Коворк', 'Опен спейс', 'Open space', 'Центр коллективной работы'],
  },
  {
    floor: 3,
    title: 'Медицинский блок',
    aliases: ['Медпункт', 'Медблок', 'Врач', 'Медицинский кабинет', 'Первая помощь'],
  },
  {
    floor: 3,
    title: 'Техно точка',
    aliases: ['Техноточка', 'Техподдержка', 'Техническая поддержка', 'Выдача оборудования'],
  },
  { floor: 3, title: 'Учебный офис', aliases: ['Деканат', 'Учебная часть'] },
]

/**
 * Слова «офис» среди синонимов категорий нет намеренно: на 2 и 3 этажах есть
 * помещения с таким названием, и запрос «офис» должен оставаться текстовым.
 */
const CATEGORY_SYNONYMS: CampusCategorySynonym[] = [
  {
    kind: 'food',
    words: [
      'еда',
      'поесть',
      'кухня',
      'кухни',
      'кафе',
      'кофе',
      'вендинг',
      'вендинги',
      'столовая',
      'перекус',
      'обед',
      'обеденный зал',
    ],
  },
  {
    kind: 'teachers',
    words: [
      'сотрудники',
      'сотрудников',
      'для сотрудников',
      'преподаватели',
      'преподавателей',
      'препод',
    ],
  },
  {
    // «аудитории» тут нет намеренно: категория называется «Помещения общего
    // пользования», и по запросу «ауд» список открывался гардеробом и входами.
    // Без синонима запрос остаётся текстовым и находит сами аудитории.
    kind: 'students',
    words: [
      'общие',
      'общего пользования',
      'помещения общего пользования',
      'общие помещения',
      'студенты',
      'для студентов',
    ],
  },
]

/** viewBox берётся из floor-N.svg; build-floors.py сверяет эти числа со своими. */
const FLOORS: Omit<CampusFloor, 'markers'>[] = [
  {
    id: 1,
    label: 'Этаж 1',
    asset: floor1Url,
    viewBox: { x: 212, y: 119, w: 812, h: 573 },
    rooms: [
      { codes: '', title: 'Вход', zone: null },
      { codes: '', title: 'Ресепшн', zone: null },
      { codes: '', title: 'Гардероб', zone: null },
      { codes: '', title: 'Бюро пропусков', zone: null },
      { codes: '', title: 'Атриум', zone: null },
    ],
  },
  {
    id: 2,
    label: 'Этаж 2',
    asset: floor2Url,
    viewBox: { x: 212, y: 119, w: 818, h: 573 },
    rooms: [
      { codes: 'E201', title: 'Аудитория', zone: 'E' },
      { codes: 'S202.1, S202.2, S203', title: 'Аудитории', zone: 'S' },
      { codes: '', title: 'Обеденный зал', zone: null },
      { codes: '', title: 'Кафе Лицей', zone: null },
      { codes: '', title: 'Ресепшн', zone: null },
      { codes: '', title: 'Исторический вход', zone: null },
      { codes: '', title: 'Офис', zone: null },
      // В списке помещений из PDF радиостудия есть, а плашки на плане нет:
      // строка остаётся, но вести ей не на что
      { codes: '', title: 'Радиостудия', zone: null },
      { codes: '', title: 'Атриум', zone: null },
    ],
  },
  {
    id: 3,
    label: 'Этаж 3',
    asset: floor3Url,
    viewBox: { x: 212, y: 119, w: 813, h: 573 },
    rooms: [
      { codes: 'N318–N324', title: 'Аудитории', zone: 'N' },
      { codes: 'S304–S315', title: 'Аудитории', zone: 'S' },
      { codes: 'W316, W317', title: 'Аудитории', zone: 'W' },
      { codes: 'E301, E303', title: 'Аудитории', zone: 'E' },
      { codes: '', title: 'Опенспейс', zone: null },
      { codes: '', title: 'Учебный офис', zone: null },
      { codes: '', title: 'Офис', zone: null },
      { codes: '', title: 'Техно точка', zone: null },
      // Плашек «Кухня» на этаже пять, в списке — одна строка на все
      { codes: '', title: 'Кухня', zone: null },
      { codes: '', title: 'Медицинский блок', zone: null },
      { codes: '', title: 'Атриум', zone: null },
    ],
  },
]

export const TELEGRAPH_CAMPUS: Campus = {
  id: 'telegraph',
  name: 'Кампус «Центральный телеграф»',
  shortName: 'Центральный телеграф',
  switchLabel: 'Центральный телеграф',
  switchLabelShort: 'Телеграф',
  searchPlaceholder: 'Найти: S308 или «кухня»',
  zones: [
    { id: 'N', title: 'Корпус N (север)' },
    { id: 'S', title: 'Корпус S (юг)' },
    { id: 'E', title: 'Корпус E (восток)' },
    { id: 'W', title: 'Корпус W (запад)' },
  ],
  // Помещений без корпуса больше половины: разбивка по сторонам света
  // оставила бы список из четырёх почти пустых групп
  groupRoomsByZone: false,
  codeLetters: ['n', 's', 'e', 'w'],
  // Кириллические буквы на тех же клавишах, что латинские N, S, E, W
  cyrillicCodeLetters: { н: 'n', т: 'n', с: 's', ы: 's', е: 'e', э: 'e', у: 'e', в: 'w', ц: 'w' },
  // S306.1 и S306.2 — две разные аудитории с одним номером на плане
  codeSuffix: true,
  rangeStep: () => 1,
  kindLabels: {
    students: 'Помещения общего пользования',
    food: 'Кухни, вендинги, кафе',
    teachers: 'Помещения для сотрудников и преподавателей',
  },
  legendKinds: ['students', 'food', 'teachers'],
  howtoTitle: 'Как читать номера',
  howtoText:
    '«Центральный телеграф» — 8 этажей, разделённых на 4 корпуса по сторонам света: ' +
    'N — север, S — юг, E — восток, W — запад. Аудитории нумеруются по часовой стрелке, ' +
    'начиная с корпуса E (восток) и заканчивая корпусом N (север). ' +
    'Номер — буква корпуса, этаж и порядковый номер: S308 — корпус S (юг), 3 этаж. ' +
    'Входы — со стороны Тверской улицы, ближайшее метро — «Охотный ряд», выход 2. ' +
    'В приложении пока есть планы 1–3 этажей.',
  floors: FLOORS.map((floor) => ({ ...floor, markers: TELEGRAPH_MARKERS[floor.id] ?? [] })),
  aliases: ALIASES,
  categorySynonyms: CATEGORY_SYNONYMS,
}
