import floor1Url from '../../../../assets/campus-map/dukat/floor-1.svg?url'
import floor2Url from '../../../../assets/campus-map/dukat/floor-2.svg?url'
import floor3Url from '../../../../assets/campus-map/dukat/floor-3.svg?url'
import floor4Url from '../../../../assets/campus-map/dukat/floor-4.svg?url'
import floor5Url from '../../../../assets/campus-map/dukat/floor-5.svg?url'
import floor7Url from '../../../../assets/campus-map/dukat/floor-7.svg?url'
import floor8Url from '../../../../assets/campus-map/dukat/floor-8.svg?url'
import floor9Url from '../../../../assets/campus-map/dukat/floor-9.svg?url'
import floor10Url from '../../../../assets/campus-map/dukat/floor-10.svg?url'
import { DUKAT_MARKERS } from '../dukatMarkers.generated'
import type { Campus, CampusCategorySynonym, CampusFloor, CampusSearchAlias } from '../types'

/**
 * Помещение ищут не только по названию из списка: у кафе вывеска «Drinkit»,
 * и набирают её то латиницей, то кириллицей, а коворкинги на плане до сих пор
 * подписаны «Центр коллективной работы» — по старому названию их тоже ищут.
 *
 * Синоним ищется вхождением: «центр коллективной работы» само по себе
 * покрывает и «центр коллек», и «коллективн», отдельных записей им не нужно.
 */
const COWORKING_ALIASES = ['Центр коллективной работы']
const DRINKIT_ALIASES = ['Drinkit', 'Дринкит', 'Кафе Дринкит']

const ALIASES: CampusSearchAlias[] = [
  // Названий-близнецов «Коворкинг» на 4 этаже два, поэтому у обоих указан codes
  { floor: 4, codes: '', title: 'Коворкинг', aliases: COWORKING_ALIASES },
  { floor: 4, codes: 'B424', title: 'Коворкинг', aliases: COWORKING_ALIASES },
  { floor: 4, codes: '', title: 'Кафе Drinkit', aliases: DRINKIT_ALIASES },
  { floor: 5, codes: '', title: 'Коворкинг', aliases: COWORKING_ALIASES },
  { floor: 7, codes: 'B720', title: 'Коворкинг', aliases: COWORKING_ALIASES },
  { floor: 8, codes: '', title: 'Коворкинг', aliases: COWORKING_ALIASES },
  { floor: 8, codes: '', title: 'Кафе Drinkit', aliases: DRINKIT_ALIASES },
]

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
    ],
  },
  {
    kind: 'fitness',
    words: ['фитнес', 'спорт', 'спортзал', 'тренажер', 'тренажёр', 'зал', 'раздевалка'],
  },
  { kind: 'teachers', words: ['преподаватели', 'преподавателей', 'препод', 'офис преподавателей'] },
  { kind: 'closed', words: ['закрытые', 'закрыто', 'служебные'] },
  { kind: 'wellbeing', words: ['благополучие', 'терапевт', 'психолог'] },
  { kind: 'students', words: ['студенты', 'для студентов', 'аудитории', 'аудитория'] },
]

/** viewBox берётся из floor-N.svg; build-floors.py сверяет эти числа со своими. */
const FLOORS: Omit<CampusFloor, 'markers'>[] = [
  {
    id: 1,
    label: 'Этаж 1',
    asset: floor1Url,
    viewBox: { x: 320, y: 26, w: 613, h: 717 },
    rooms: [
      { codes: 'B102', title: 'Лаборатория', zone: 'B' },
      { codes: 'B104', title: 'Аудитория', zone: 'B' },
      { codes: 'B106–B108', title: 'Офисы', zone: 'B' },
      { codes: 'B114', title: 'Спортзал', zone: 'B' },
      { codes: 'B116', title: 'Тренажерный зал', zone: 'B' },
      { codes: 'B112, B118', title: 'Раздевалки', zone: 'B' },
      { codes: 'B122, B124', title: 'Гардероб', zone: 'B' },
      { codes: '', title: 'Вход', zone: 'F' },
      { codes: '', title: 'Кафе Floo', zone: 'F' },
    ],
  },
  {
    id: 2,
    label: 'Этаж 2',
    asset: floor2Url,
    viewBox: { x: 320, y: 26, w: 730, h: 717 },
    rooms: [
      { codes: 'B202–B218', title: 'Аудитории', zone: 'B' },
      { codes: 'B203', title: 'Аудитория онлайн-магистратуры', zone: 'B' },
      { codes: 'F201–F203', title: 'Аудитории', zone: 'F' },
      { codes: 'F204', title: 'Пункт выдачи оборудования', zone: 'F' },
      { codes: 'F205', title: 'Учебный офис', zone: 'F' },
      { codes: 'F206', title: 'Переговорная', zone: 'F' },
      { codes: 'F211', title: 'Фабрика курсов', zone: 'F' },
      { codes: 'F212', title: 'Кухня', zone: 'F' },
    ],
  },
  {
    id: 3,
    label: 'Этаж 3',
    asset: floor3Url,
    viewBox: { x: 320, y: 20, w: 730, h: 723 },
    rooms: [
      { codes: 'B302–B306', title: 'Аудитории', zone: 'B' },
      { codes: 'F304', title: 'Аудитория', zone: 'F' },
      { codes: 'F301, F303', title: 'Библиотека', zone: 'F' },
      { codes: 'F302', title: 'Архив', zone: 'F' },
      { codes: 'F307', title: 'Ректор', zone: 'F' },
      { codes: 'F308', title: 'Переговорная', zone: 'F' },
    ],
  },
  {
    id: 4,
    label: 'Этаж 4',
    asset: floor4Url,
    viewBox: { x: 360, y: 26, w: 613, h: 717 },
    rooms: [
      // Две отдельные плашки на плане (коворкинг выше кафе) — и в списке две строки,
      // иначе поиск «коворкинг» подсвечивал бы заодно и кафе
      { codes: '', title: 'Коворкинг', zone: 'B' },
      { codes: '', title: 'Кафе Drinkit', zone: 'B' },
      { codes: 'B420–B422', title: 'Аудитории', zone: 'B' },
      { codes: 'B402', title: 'Административная команда', zone: 'B' },
      { codes: 'B404', title: 'Терапевт', zone: 'B' },
      { codes: 'B406', title: 'Переговорная', zone: 'B' },
      { codes: 'B408, B414, B416', title: 'Продуктовая команда', zone: 'B' },
      { codes: 'B407, B409', title: 'Купе', zone: 'B' },
      { codes: 'B410', title: 'Операционный директор', zone: 'B' },
      { codes: 'B412, B418', title: 'Центр сопровождения научной деятельности', zone: 'B' },
      { codes: 'B415, B417', title: 'Переговорные', zone: 'B' },
      { codes: 'B424', title: 'Коворкинг', zone: 'B' },
      { codes: '', title: 'Аудитории «Агат», «Сетунь», «Вега», «Байкал», «Эльбрус»', zone: 'F' },
      { codes: '', title: 'Информационный центр', zone: 'F' },
      { codes: '', title: 'Кафе / Кухня', zone: 'F' },
      { codes: '', title: 'Административная команда', zone: 'F' },
    ],
  },
  {
    id: 5,
    label: 'Этаж 5',
    asset: floor5Url,
    viewBox: { x: 390, y: 56, w: 607, h: 495 },
    rooms: [
      { codes: '', title: 'Коворкинг', zone: 'B' },
      { codes: 'B502–B506, B512', title: 'Аудитории', zone: 'B' },
      { codes: 'B503', title: 'Приемная комиссия', zone: 'B' },
      { codes: 'B505', title: 'Команда центра благополучия', zone: 'B' },
      { codes: 'B506, B508', title: 'Команда привлечения', zone: 'B' },
      { codes: 'B507', title: 'Команда воинского и миграционного учета', zone: 'B' },
      { codes: 'B509', title: 'Техническая поддержка', zone: 'B' },
      { codes: 'B510', title: 'Руководители научных лабораторий', zone: 'B' },
      { codes: 'B511', title: 'Кухня', zone: 'B' },
      { codes: 'B514', title: 'Продуктовая команда / Школа технологий', zone: 'B' },
      { codes: 'B515, B517', title: 'Переговорные', zone: 'B' },
      { codes: 'B516', title: 'Команда маркетинга', zone: 'B' },
      { codes: 'B518', title: 'Команда развития мягких навыков', zone: 'B' },
      { codes: 'B520', title: 'Команда бухгалтерии', zone: 'B' },
      { codes: 'B522', title: 'Служба безопасности', zone: 'B' },
      { codes: 'B524', title: 'Предпринимательство / Общие дисциплины', zone: 'B' },
      { codes: 'B528', title: 'Переговорная', zone: 'B' },
    ],
  },
  {
    id: 7,
    label: 'Этаж 7',
    asset: floor7Url,
    viewBox: { x: 390, y: 56, w: 583, h: 495 },
    rooms: [
      { codes: 'B702–B714', title: 'Аудитории', zone: 'B' },
      { codes: 'B703', title: 'Кухня', zone: 'B' },
      { codes: 'B705, B707', title: 'Переговорные', zone: 'B' },
      { codes: 'B713, B715, B717, B719, B721', title: 'Комнаты для обсуждений', zone: 'B' },
      { codes: 'B716, B718', title: 'Центр партнерств и карьеры', zone: 'B' },
      { codes: 'B720', title: 'Коворкинг', zone: 'B' },
    ],
  },
  {
    id: 8,
    label: 'Этаж 8',
    asset: floor8Url,
    viewBox: { x: 390, y: 56, w: 583, h: 495 },
    rooms: [
      // Как на 4 этаже: коворкинг и кафе — разные плашки и разные строки
      { codes: '', title: 'Коворкинг', zone: 'B' },
      { codes: '', title: 'Кафе Drinkit', zone: 'B' },
      { codes: 'B802–B804, B810–B816', title: 'Аудитории', zone: 'B' },
      { codes: 'B806', title: 'Центр взаимодействия', zone: 'B' },
      { codes: 'B808', title: 'Команда вовлечения', zone: 'B' },
      { codes: 'B813, B815', title: 'Офис', zone: 'B' },
      { codes: 'B818', title: 'Кухня', zone: 'B' },
      { codes: 'B820', title: 'Научные лаборатории', zone: 'B' },
      { codes: 'B822', title: 'Тренировочный клуб', zone: 'B' },
    ],
  },
  {
    id: 9,
    label: 'Этаж 9',
    asset: floor9Url,
    viewBox: { x: 390, y: 56, w: 583, h: 495 },
    rooms: [
      { codes: 'B902', title: 'Общие дисциплины', zone: 'B' },
      { codes: 'B910', title: 'Офис преподавателей', zone: 'B' },
      { codes: 'B912', title: 'Школа дизайна', zone: 'B' },
      { codes: 'B914', title: 'Команда юристов', zone: 'B' },
      { codes: 'B915', title: 'Кухня', zone: 'B' },
      { codes: 'B916', title: 'Направление наук о данных / Направление разработки', zone: 'B' },
      { codes: 'B917, B919, B928', title: 'Переговорные', zone: 'B' },
      { codes: 'B918–B920', title: 'Команда развития человеческого капитала', zone: 'B' },
      { codes: 'B922', title: 'Направление математики / Направление аналитики', zone: 'B' },
      { codes: 'B924', title: 'Направления бизнеса и аналитики', zone: 'B' },
      { codes: 'B925, B927, B929, B931, B933', title: 'Комнаты для обсуждений', zone: 'B' },
      { codes: 'B926', title: 'Профессорский клуб', zone: 'B' },
    ],
  },
  {
    id: 10,
    label: 'Этаж 10',
    asset: floor10Url,
    viewBox: { x: 479, y: 161, w: 432, h: 401 },
    rooms: [
      { codes: 'B1002', title: 'Фотостудия', zone: 'B' },
      { codes: 'B1004', title: 'Студенческий клуб', zone: 'B' },
      { codes: 'B1006', title: 'Кинотеатр', zone: 'B' },
      { codes: 'B1010', title: 'Комната психологической разгрузки', zone: 'B' },
    ],
  },
]


export const DUKAT_CAMPUS: Campus = {
  id: 'dukat',
  name: 'Кампус «Дукат»',
  shortName: 'Дукат',
  switchLabel: 'Дукат',
  searchPlaceholder: 'Найти: B420 или «кафе»',
  zones: [
    { id: 'B', title: 'Башня B' },
    { id: 'F', title: 'Башня F' },
  ],
  groupRoomsByZone: true,
  codeLetters: ['b', 'f'],
  // «и» и «а» — те же клавиши, что B и F в ЙЦУКЕН: раскладку забывают переключить
  cyrillicCodeLetters: { б: 'b', в: 'b', ф: 'f', и: 'b', а: 'f' },
  codeSuffix: false,
  // В башне B чётные номера — внешнее кольцо, нечётные — ядро, и «B202–B218»
  // означает только чётные: B203 и B205 — отдельные помещения. В башне F
  // номера идут подряд, там шаг всегда 1.
  rangeStep: (zoneId, from, to) => (zoneId === 'B' && from % 2 === to % 2 ? 2 : 1),
  kindLabels: {
    students: 'Помещения для студентов',
    food: 'Еда, кухни, вендинги',
    teachers: 'Помещения для преподавателей',
    fitness: 'Фитнес',
    closed: 'Закрытые помещения',
    wellbeing: 'Центр благополучия',
  },
  // Центра благополучия в легенде на плане нет, а плашки такого цвета есть
  legendKinds: ['students', 'food', 'teachers', 'fitness', 'closed'],
  howtoTitle: 'Как читать номера',
  howtoText:
    'B — башня Back: 10 этажей, есть лифты, здесь большинство учебных помещений. ' +
    'F — башня Front: 4 этажа над входом, без лифтов; на 4 этаже — ресепшн, на 3 — ректор. ' +
    'Первая цифра в номере — этаж: B420 — башня B, 4 этаж. ' +
    'В башне B чётные номера — внешнее кольцо (с окнами), нечётные — внутреннее ядро; ' +
    'в башне F номера идут по порядку по часовой стрелке.',
  floors: FLOORS.map((floor) => ({ ...floor, markers: DUKAT_MARKERS[floor.id] ?? [] })),
  aliases: ALIASES,
  categorySynonyms: CATEGORY_SYNONYMS,
}
