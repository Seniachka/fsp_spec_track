/**
 * Разбор текста на слова для модерации. Паритет с бэкендом:
 * strings-backend/backend/internal/contentfilter/normalize.go.
 *
 * Важно: соседние слова НЕ склеиваются — иначе «запах уйдёт» превращается
 * в мат. Склеиваем только «разрядку» из одиночных букв («п и д о р»),
 * которой как раз и обходят фильтр.
 */

/** Невидимые символы, которыми разрывают слова. */
const INVISIBLE = /[\u200b-\u200d\u2060\ufeff\u00ad]/g

const isCyrLetter = (ch: string): boolean => ch >= 'а' && ch <= 'я'

const isLatLetter = (ch: string): boolean => ch >= 'a' && ch <= 'z'

/**
 * leet-подмены: цифры и символы вместо букв. Кириллические «3» и «4»
 * читаются по-разному («3аебал» и «ч3рт»), поэтому вариантов несколько.
 */
const LEET_CYR: Record<string, string> = {
  '0': 'о', '1': 'и', '3': 'е', '4': 'ч', '5': 'с', '6': 'б', '8': 'в', '9': 'д',
  '@': 'а', $: 'с', '!': 'и', '+': 'т',
}

const LEET_CYR_A: Record<string, string> = { ...LEET_CYR, '4': 'а' }

const LEET_CYR_Z: Record<string, string> = { ...LEET_CYR, '3': 'з' }

const LEET_LAT: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'b', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', $: 's', '!': 'i', '+': 't',
}

/**
 * Латиница, которой подменяют кириллицу («xyй», «eбал»). Применяем только
 * к словам, где кириллица уже есть, чтобы не портить английские слова.
 */
const LAT_TO_CYR: Record<string, string> = {
  a: 'а', b: 'б', c: 'с', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х',
  i: 'и', j: 'й', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'р',
  q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'х',
  y: 'у', z: 'з',
}

/**
 * Кириллица, которой подменяют латиницу («fuсk» с русской «с»). Применяем
 * только к словам, где латиница уже есть.
 */
const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'j', з: 'z',
  и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'c',
  ш: 's', щ: 's', ы: 'y', э: 'e', ю: 'u', я: 'a',
}

/** Нижний регистр, ё→е, без невидимых символов. */
const prepare = (text: string): string =>
  text.normalize('NFKC').toLowerCase().replace(INVISIBLE, '').replace(/ё/g, 'е')

const applyMap = (text: string, map: Record<string, string> | null): string => {
  if (!map) return text
  let out = ''
  for (const ch of text) out += map[ch] ?? ch
  return out
}

/** Слова из букв; всё остальное (цифры, знаки, пробелы) — граница. */
const splitWords = (text: string): string[] => text.split(/[^\p{L}]+/u).filter(Boolean)

/** Со скольких одиночных букв подряд считаем это «разрядкой». */
const MIN_SPACED_RUN = 3

/**
 * Склеивает подряд идущие однобуквенные слова («н и г е р» → «нигер»).
 * Полноценные слова не трогает. null, если склеивать нечего.
 */
const mergeSpaced = (words: string[]): string[] | null => {
  const out: string[] = []
  let merged = false
  let i = 0
  while (i < words.length) {
    let j = i
    while (j < words.length && [...words[j]].length === 1) j += 1
    if (j - i >= MIN_SPACED_RUN) {
      out.push(words.slice(i, j).join(''))
      merged = true
      i = j
      continue
    }
    out.push(...words.slice(i, j))
    if (j < words.length) out.push(words[j])
    i = j + 1
  }
  return merged ? out : null
}

/**
 * Схлопывает 3+ одинаковых буквы подряд («хуууй» → «хуй»). Удвоения не
 * трогаем: иначе «nigger» превращается в «niger» и под фильтр попадает
 * страна Niger.
 */
export const collapseRepeats = (word: string): string => word.replace(/(.)\1{2,}/gu, '$1')

/**
 * Варианты написания слова для сравнения со словарём. Кириллическое слово
 * сверяется только с русскими корнями, латинское — только с латинскими:
 * иначе «Niger» схлопнется с «нигер».
 */
export type WordForms = { cyr: string[]; lat: string[] }

const pushUnique = (list: string[], word: string): void => {
  if (word && !list.includes(word)) list.push(word)
}

export const formsOf = (word: string): WordForms => {
  let hasCyr = false
  let hasLat = false
  for (const ch of word) {
    if (isCyrLetter(ch)) hasCyr = true
    else if (isLatLetter(ch)) hasLat = true
  }

  const forms: WordForms = { cyr: [], lat: [] }
  if (hasCyr) {
    pushUnique(forms.cyr, word)
    if (hasLat) pushUnique(forms.cyr, applyMap(word, LAT_TO_CYR))
  }
  if (hasLat) {
    pushUnique(forms.lat, word)
    if (hasCyr) pushUnique(forms.lat, applyMap(word, CYR_TO_LAT))
  }
  for (const v of [...forms.cyr]) pushUnique(forms.cyr, collapseRepeats(v))
  for (const v of [...forms.lat]) pushUnique(forms.lat, collapseRepeats(v))
  return forms
}

/**
 * Потоки слов по всем вариантам нормализации: без подмен, с leet-подменами
 * и со склейкой «разрядки». Порядок слов внутри потока сохранён — по нему
 * ищутся фразы.
 */
export const tokenizeForModeration = (text: string): string[][] => {
  const base = prepare(text)
  const maps = [null, LEET_CYR, LEET_CYR_A, LEET_CYR_Z, LEET_LAT]
  const streams: string[][] = []
  const seen = new Set<string>()

  const add = (words: string[] | null) => {
    if (!words || words.length === 0) return
    const key = words.join(' ')
    if (seen.has(key)) return
    seen.add(key)
    streams.push(words)
  }

  for (const map of maps) {
    const words = splitWords(applyMap(base, map))
    add(words)
    add(mergeSpaced(words))
  }
  return streams
}
