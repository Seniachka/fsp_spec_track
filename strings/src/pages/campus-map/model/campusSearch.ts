import type {
  Campus,
  CampusFloor,
  CampusFloorResult,
  CampusMarker,
  CampusMarkerKind,
  CampusResultRow,
  CampusRoom,
  CampusSearch,
} from './types'

/* ─── рантайм кампуса ────────────────────────────────────────────────────── */

type NormalizedAlias = { floor: number; title?: string; codes?: string; aliases: string[] }

/** Нормализованные код и подпись плашки: считаются один раз, а не на каждую букву запроса */
type MarkerText = { code: string; title: string }

/**
 * Всё, что зависит от кампуса и считается один раз: регулярки из его букв,
 * нормализованные синонимы и кэши. Кэши обязаны быть свои у каждого кампуса —
 * этажи у «Дуката» и «Телеграфа» нумеруются одинаково, общий кэш смешал бы их.
 */
type CampusRuntime = {
  /** «В 202» и «b 202» — тот же номер: пробел внутри кода не значим */
  codeSpaceRe: RegExp
  /** Буква кода кириллицей: «б202» и «в202» — это B202, «ф204» — F204 */
  codeLetterRe: RegExp
  /** Запрос вида «b2», «b20», «b202» — номер помещения, возможно неполный */
  codeQueryRe: RegExp
  /** Одиночный номер из списка помещений: «B106», «S306.1» */
  codePartRe: RegExp
  aliases: NormalizedAlias[]
  markerText: Map<string, MarkerText>
  roomMarkers: Map<string, CampusMarker[]>
  markerAliases: Map<string, string[]>
}

const RUNTIMES = new WeakMap<Campus, CampusRuntime>()

/** Символы букв для символьного класса регулярки: латиница и кириллица безопасны как есть */
const letterClass = (letters: string[]): string => letters.join('')

const createRuntime = (campus: Campus): CampusRuntime => {
  const latin = letterClass(campus.codeLetters)
  const cyrillic = letterClass(Object.keys(campus.cyrillicCodeLetters))
  const suffix = campus.codeSuffix ? '(?:\\.(\\d))?' : ''

  const runtime: CampusRuntime = {
    codeSpaceRe: new RegExp(`(^|\\s)([${latin}${cyrillic}])\\s+(?=\\d)`, 'g'),
    codeLetterRe: new RegExp(`(^|\\s)([${cyrillic}])(?=\\d)`, 'g'),
    codeQueryRe: new RegExp(`^[${latin}]\\d{1,4}${campus.codeSuffix ? '(\\.\\d?)?' : ''}$`),
    codePartRe: new RegExp(`^([${latin}])?(\\d{3,4})${suffix}$`, 'i'),
    aliases: [],
    markerText: new Map(),
    roomMarkers: new Map(),
    markerAliases: new Map(),
  }
  // Нормализация синонимов и подписей идёт уже через регулярки этого объекта,
  // поэтому он кладётся в RUNTIMES раньше, чем заполняется.
  RUNTIMES.set(campus, runtime)

  runtime.aliases = campus.aliases.map((item) => ({
    floor: item.floor,
    title: item.title,
    codes: item.codes,
    aliases: item.aliases.map((alias) => normalizeCampusQuery(campus, alias)),
  }))

  for (const floor of campus.floors) {
    for (const marker of floor.markers) {
      runtime.markerText.set(marker.id, {
        code: marker.code ? normalizeCampusQuery(campus, marker.code) : '',
        title: marker.title ? normalizeCampusQuery(campus, marker.title) : '',
      })
    }
  }

  return runtime
}

const runtimeOf = (campus: Campus): CampusRuntime => RUNTIMES.get(campus) ?? createRuntime(campus)

/* ─── нормализация ───────────────────────────────────────────────────────── */

/**
 * Нормализация запроса и данных для поиска. Кириллические буквы набирают
 * вместо латинских постоянно, но менять их по всей строке нельзя: «Вход»
 * превратился бы в «bход». Поэтому замена только в позиции кода — одна буква
 * в начале слова перед цифрами.
 *
 * Пробелы схлопываются до одного: «кафе  дринкит» с двойным пробелом — тот же
 * запрос, а сравнение с названиями и синонимами идёт вхождением подстроки.
 *
 * «ё» — это «е», а дефис между буквами — пробел: в списке «Приемная комиссия»
 * и «онлайн-магистратуры», а набирают «приёмная» и «онлайн магистратуры».
 * Дефис в конце запроса тоже пробел — на «онлайн-» слово после него ещё не
 * набрано. Тире в диапазоне номеров «B106–B108» стоит после цифры и не трогается.
 */
export const normalizeCampusQuery = (campus: Campus, value: string): string => {
  const runtime = runtimeOf(campus)
  const normalized = value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/(\p{L})[-‐–—](?=\p{L}|\s*$)/gu, '$1 ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(runtime.codeSpaceRe, '$1$2')
    .replace(
      runtime.codeLetterRe,
      (_match, lead: string, letter: string) => `${lead}${campus.cyrillicCodeLetters[letter]}`,
    )
  // Дробную часть номера пишут и через запятую, и через пробел: «S306,1» и
  // «306 1» — это S306.1
  return campus.codeSuffix ? normalized.replace(/(\d{3,4})(?:,\s?|\s)(\d)$/, '$1.$2') : normalized
}

export const isCampusCodeQuery = (campus: Campus, normalizedQuery: string): boolean =>
  runtimeOf(campus).codeQueryRe.test(normalizedQuery)

/** Подпись корпуса для человека. Пустая строка — корпуса у помещения нет */
export const zoneTitle = (campus: Campus, zone: string | null): string =>
  (zone && campus.zones.find((item) => item.id === zone)?.title) || ''

/* ─── синонимы ───────────────────────────────────────────────────────────── */

/** Запись синонимов относится к этому помещению */
const aliasHitsRoom = (item: NormalizedAlias, floorId: number, room: CampusRoom): boolean =>
  item.floor === floorId &&
  (item.title === undefined || item.title === room.title) &&
  (item.codes === undefined || item.codes === room.codes)

/** Синонимы помещения. Пустой массив — своих синонимов у него нет */
const roomAliases = (campus: Campus, floorId: number, room: CampusRoom): string[] =>
  runtimeOf(campus)
    .aliases.filter((item) => aliasHitsRoom(item, floorId, room))
    .flatMap((item) => item.aliases)

/**
 * Помещение находится по названию, то есть по обычной строке: переименуют его
 * в списке этажа — и синонимы молча перестанут находиться. В дев-сборке
 * проверяем связь сразу, чтобы это не всплыло уже в приложении.
 */
export const checkCampusAliasLinks = (campus: Campus): void => {
  for (const item of runtimeOf(campus).aliases) {
    const linked = campus.floors.some((floor) =>
      floor.rooms.some((room) => aliasHitsRoom(item, floor.id, room)),
    )
    if (!linked) {
      console.warn(
        `[campus-map] ${campus.id}: синонимы ${item.aliases.join(', ')} ни к чему не привязаны: ` +
          `на этаже ${item.floor} нет помещения «${item.title ?? item.codes ?? ''}»`,
      )
    }
  }
}

/** Запрос — начало или кусок синонима: «дрин» и «кафе д» тоже должны находить */
const matchesAliases = (aliases: string[], normalizedQuery: string): boolean =>
  aliases.some((alias) => alias.includes(normalizedQuery))

export const matchesCampusRoom = (
  campus: Campus,
  floorId: number,
  room: CampusRoom,
  normalizedQuery: string,
): boolean =>
  normalizeCampusQuery(campus, room.codes).includes(normalizedQuery) ||
  normalizeCampusQuery(campus, room.title).includes(normalizedQuery) ||
  matchesAliases(roomAliases(campus, floorId, room), normalizedQuery)

/* ─── помещение из списка -> плашки на плане ─────────────────────────────── */

type ParsedCode = { zone: string | null; number: number; suffix: string | null }

/**
 * Диапазон номеров из строки списка. suffix задан только у одиночного номера
 * с дробной частью («S202.1»): такой номер ищется точно, а «S304–S315» берёт
 * и S306.1, и S306.2 — сравнивается целая часть.
 */
type CodeRange = { zone: string; from: number; to: number; step: number; suffix: string | null }

const parseCodePart = (campus: Campus, part: string): ParsedCode | null => {
  const match = runtimeOf(campus).codePartRe.exec(normalizeCampusQuery(campus, part.trim()))
  if (!match) return null
  return {
    zone: match[1] ? match[1].toUpperCase() : null,
    number: Number(match[2]),
    suffix: match[3] ?? null,
  }
}

/** «B106–B108» — диапазон, «B112, B118» — перечисление, бывает и смесь. */
const parseCodes = (campus: Campus, codes: string): CodeRange[] => {
  const ranges: CodeRange[] = []
  for (const chunk of codes.split(',')) {
    const bounds = chunk
      .split(/[–—-]/)
      .map((piece) => piece.trim())
      .filter(Boolean)
    if (bounds.length === 0) continue
    const first = parseCodePart(campus, bounds[0])
    if (!first?.zone) continue
    const last = bounds.length > 1 ? parseCodePart(campus, bounds[bounds.length - 1]) : first
    const to = last && (last.zone === null || last.zone === first.zone) ? last.number : first.number
    const from = Math.min(first.number, to)
    const till = Math.max(first.number, to)
    ranges.push({
      zone: first.zone,
      from,
      to: till,
      step: campus.rangeStep(first.zone, from, till),
      suffix: bounds.length === 1 ? first.suffix : null,
    })
  }
  return ranges
}

/**
 * Номер без буквы корпуса: в расписании аудиторию пишут «305», а на плане она
 * S305. Текстовая ветка такой запрос не находила — код плашки начинается с
 * буквы, а в строке списка «S304–S315» подстроки «305» просто нет, поэтому
 * искались только напечатанные концы диапазона. Дробная часть тоже бывает:
 * «306.1» — это S306.1.
 */
const bareNumberQuery = (campus: Campus, query: string): ParsedCode | null => {
  const parsed = parseCodePart(campus, query)
  return parsed && parsed.zone === null ? parsed : null
}

const inRange = (range: CodeRange, parsed: ParsedCode): boolean =>
  range.zone === parsed.zone &&
  parsed.number >= range.from &&
  parsed.number <= range.to &&
  (parsed.number - range.from) % range.step === 0 &&
  (range.suffix === null || range.suffix === parsed.suffix)

/** Номер попадает в один из диапазонов строки списка: «319» — внутрь «N318–N324» */
const roomHasNumber = (campus: Campus, room: CampusRoom, bare: ParsedCode): boolean =>
  parseCodes(campus, room.codes).some((range) =>
    // Корпуса у голого номера нет, а дробная часть — не всегда: берём их у диапазона
    inRange(range, { zone: range.zone, number: bare.number, suffix: bare.suffix ?? range.suffix }),
  )

/** Номер плашки совпадает с голым: «306» — это и S306.1, и S306.2, «306.1» — только S306.1 */
const markerHasNumber = (campus: Campus, marker: CampusMarker, bare: ParsedCode): boolean => {
  const parsed = marker.code ? parseCodePart(campus, marker.code) : null
  return (
    parsed !== null &&
    parsed.number === bare.number &&
    (bare.suffix === null || parsed.suffix === bare.suffix)
  )
}

/** Кавычки, регистр и лишние пробелы в названиях помещений не совпадают с планом. */
const normalizeTitle = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const containsWords = (haystack: string[], needle: string[]): boolean => {
  if (needle.length === 0 || needle.length > haystack.length) return false
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((word, offset) => haystack[start + offset] === word)) return true
  }
  return false
}

const titleMatches = (roomTitle: string, markerTitle: string): boolean => {
  const room = normalizeTitle(roomTitle).split(' ').filter(Boolean)
  const marker = normalizeTitle(markerTitle).split(' ').filter(Boolean)
  if (marker.length === 0) return false
  if (containsWords(room, marker)) return true
  // «Аудитория «Агат»» на плане против «Аудитории «Агат», «Сетунь»…» в списке:
  // ведущее родовое слово отбрасываем и ищем по собственному имени
  return marker.length > 1 && containsWords(room, marker.slice(1))
}

/** Плашки на плане, которые относятся к помещению из списка. */
export const resolveRoomMarkers = (
  campus: Campus,
  floor: CampusFloor,
  room: CampusRoom,
): CampusMarker[] => {
  const cache = runtimeOf(campus).roomMarkers
  const key = `${floor.id} ${room.codes} ${room.title}`
  const cached = cache.get(key)
  if (cached) return cached

  let found: CampusMarker[]
  if (room.codes.trim()) {
    const ranges = parseCodes(campus, room.codes)
    found = floor.markers.filter((marker) => {
      const parsed = marker.code ? parseCodePart(campus, marker.code) : null
      if (!parsed?.zone) return false
      return ranges.some((range) => inRange(range, parsed))
    })
  } else {
    const candidates = floor.markers.filter(
      (marker) => marker.code === null && marker.zone === room.zone,
    )
    // Сначала точное совпадение названий: на 3 этаже «Телеграфа» есть и
    // «Учебный офис», и «Офис», и по вхождению слов строка «Офис» забрала бы
    // обе плашки. Нестрогий поиск нужен только там, где точного нет —
    // «Аудитория «Агат»» на плане против общей строки со всеми именами.
    const roomTitle = normalizeTitle(room.title)
    const exact = candidates.filter((marker) => normalizeTitle(marker.title) === roomTitle)
    found =
      exact.length > 0
        ? exact
        : candidates.filter((marker) => titleMatches(room.title, marker.title))
  }

  cache.set(key, found)
  return found
}

/** Синонимы, которые плашка получает от своего помещения из списка */
const markerAliases = (campus: Campus, floor: CampusFloor, marker: CampusMarker): string[] => {
  const cache = runtimeOf(campus).markerAliases
  const key = `${floor.id} ${marker.id}`
  const cached = cache.get(key)
  if (cached) return cached

  const found = floor.rooms.flatMap((room) => {
    const aliases = roomAliases(campus, floor.id, room)
    if (aliases.length === 0) return []
    return resolveRoomMarkers(campus, floor, room).some((item) => item.id === marker.id)
      ? aliases
      : []
  })

  cache.set(key, found)
  return found
}

/** Подпись плашки: у части плашек её нет — берём название помещения из списка */
export const campusMarkerTitle = (
  campus: Campus,
  floor: CampusFloor,
  marker: CampusMarker,
): string =>
  marker.title ||
  floor.rooms.find((room) =>
    resolveRoomMarkers(campus, floor, room).some((found) => found.id === marker.id),
  )?.title ||
  ''

/* ─── поиск ──────────────────────────────────────────────────────────────── */

/**
 * «еда» и «кухн» обязаны попасть в категорию, а «а» — нет: короткий запрос
 * считаем категорийным только как начало синонима, длинный — и по вхождению.
 */
const matchesSynonym = (query: string, word: string): boolean =>
  (query.length >= 3 && word.startsWith(query)) || (query.length >= 4 && word.includes(query))

const matchCampusKinds = (campus: Campus, normalizedQuery: string): CampusMarkerKind[] =>
  campus.categorySynonyms
    .filter((group) => group.words.some((word) => matchesSynonym(normalizedQuery, word)))
    .map((group) => group.kind)

export const campusFloorHasHits = (result: CampusFloorResult): boolean =>
  result.ids.size > 0 || result.rows.length > 0

const markerRow = (campus: Campus, floor: CampusFloor, marker: CampusMarker): CampusResultRow => ({
  key: marker.id,
  code: marker.code ?? '',
  title: campusMarkerTitle(campus, floor, marker),
  zone: marker.zone,
  ids: [marker.id],
})

const placesWord = (count: number): string => {
  if (count % 100 >= 11 && count % 100 <= 14) return 'мест'
  if (count % 10 === 1) return 'место'
  if (count % 10 >= 2 && count % 10 <= 4) return 'места'
  return 'мест'
}

/**
 * Что подсветить и что показать под планом. Три режима:
 * - код («b202», «b20») — только плашки, чей номер начинается с запроса;
 *   диапазоны из списка помещений не разворачиваем, иначе «b202» подсветит
 *   всё помещение «B202–B218»;
 * - категория («еда», «фитнес») — все плашки такого вида плюс обычные
 *   совпадения по названиям, список — строками из плашек;
 * - текст — по названиям помещений и плашек.
 */
export const buildCampusSearch = (campus: Campus, rawQuery: string): CampusSearch | null => {
  const trimmed = rawQuery.trim()
  const query = normalizeCampusQuery(campus, trimmed)
  if (!query) return null

  const runtime = runtimeOf(campus)
  const codeQuery = isCampusCodeQuery(campus, query)
  const kinds = codeQuery ? [] : matchCampusKinds(campus, query)
  const bareNumber = bareNumberQuery(campus, query)
  const kind: CampusSearch['kind'] = codeQuery ? 'code' : kinds.length > 0 ? 'category' : 'text'

  // Голый номер ведёт только на плашки с этим номером: «305» — на S305, а не на
  // всю строку «S304–S315». Если такой плашки в кампусе нет («100» — начало
  // «1002»), поиск остаётся обычным текстовым.
  const numberIds = new Set(
    bareNumber === null
      ? []
      : campus.floors.flatMap((floor) =>
          floor.markers
            .filter((marker) => markerHasNumber(campus, marker, bareNumber))
            .map((marker) => marker.id),
        ),
  )
  const numberOnly = numberIds.size > 0
  const narrow = codeQuery || numberOnly

  const floors = campus.floors.map<CampusFloorResult>((floor) => {
    const ids = new Set<string>()
    const rows: CampusResultRow[] = []

    for (const marker of floor.markers) {
      const text = runtime.markerText.get(marker.id)
      if (text?.code && text.code.startsWith(query)) ids.add(marker.id)
      if (codeQuery) continue
      if (text?.title && text.title.includes(query)) ids.add(marker.id)
      if (matchesAliases(markerAliases(campus, floor, marker), query)) ids.add(marker.id)
      if (numberIds.has(marker.id)) ids.add(marker.id)
      if (kinds.includes(marker.kind)) ids.add(marker.id)
    }

    const rooms = codeQuery
      ? []
      : floor.rooms.filter(
          (room) =>
            matchesCampusRoom(campus, floor.id, room, query) ||
            // только если такая плашка есть: «304.1» не должен открывать весь S304–S315
            (bareNumber !== null && numberOnly && roomHasNumber(campus, room, bareNumber)),
        )
    for (const room of rooms) {
      for (const marker of resolveRoomMarkers(campus, floor, room)) {
        if (!numberOnly || numberIds.has(marker.id)) ids.add(marker.id)
      }
    }

    if (kind === 'category') {
      for (const marker of floor.markers) {
        if (ids.has(marker.id)) rows.push(markerRow(campus, floor, marker))
      }
    } else {
      const covered = new Set<string>()
      for (const room of codeQuery ? floor.rooms : rooms) {
        const roomMarkers = resolveRoomMarkers(campus, floor, room)
        const matched = roomMarkers.filter((marker) => ids.has(marker.id))
        // при поиске по номеру строка помещения ведёт только на совпавшие
        // плашки; совпала часть — строка на каждую, чтобы в списке и под
        // планом стоял найденный номер: «B202», а не «B202–B218»
        if (narrow && matched.length === 0) continue
        if (narrow && matched.length < roomMarkers.length) {
          // по порядку номеров, а не как плашки лежат на плане: S306.1, потом S306.2
          const byCode = [...matched].sort((x, y) =>
            (x.code ?? '').localeCompare(y.code ?? '', 'en', { numeric: true }),
          )
          for (const marker of byCode) {
            // B506 есть в двух строках списка — строка плашки нужна одна
            if (covered.has(marker.id)) continue
            covered.add(marker.id)
            rows.push(markerRow(campus, floor, marker))
          }
          continue
        }
        for (const marker of roomMarkers) covered.add(marker.id)
        rows.push({
          key: `${room.codes}-${room.title}`,
          code: room.codes,
          title: room.title,
          zone: room.zone,
          ids: roomMarkers.map((marker) => marker.id),
        })
      }
      // плашки, которых нет ни в одной строке (B205 и B207 в список помещений
      // не попали, а искать их по номеру пользователь будет)
      for (const marker of floor.markers) {
        if (ids.has(marker.id) && !covered.has(marker.id)) {
          rows.push(markerRow(campus, floor, marker))
        }
      }
      // при поиске по номеру строки собраны из разных помещений — сводим их
      // в порядок номеров: B202, B203, B204…, а не как помещения идут в списке
      if (narrow) {
        rows.sort((a, b) => {
          if (!a.code || !b.code) return a.code ? -1 : b.code ? 1 : 0
          return a.code.localeCompare(b.code, 'en', { numeric: true })
        })
      }
    }

    return { floor, ids, rows }
  })

  const found = floors.some(campusFloorHasHits)
  const total = floors.reduce((sum, item) => sum + item.rows.length, 0)

  return {
    kind,
    heading:
      kind === 'category' && total > 0
        ? `${kinds.map((item) => campus.kindLabels[item] ?? item).join(', ')} · ${total} ${placesWord(total)}`
        : null,
    floors,
    found,
    emptyText: codeQuery
      ? `Помещение «${query.toUpperCase()}» не найдено`
      : `По запросу «${trimmed}» ничего не найдено`,
  }
}
