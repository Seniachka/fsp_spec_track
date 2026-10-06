/**
 * Клиентская проверка до отправки (сервер — источник истины).
 *
 * Логика в паритете с бэкендом
 * (strings-backend/backend/internal/contentfilter): слово считается матом,
 * только если целиком разбирается как [приставка] + корень + [окончание].
 * Соседние слова не склеиваются, регистр не важен, типовые обходы
 * (латиница вместо кириллицы, цифры вместо букв, повторы, разделители
 * внутри слова) раскрываются в normalizeText.ts.
 *
 * Единственное расхождение с сервером — намеренное. У сервера есть проверка
 * по реальным фамилиям пользователей, у клиента базы нет, поэтому:
 *  - слово, которое сервер отклонит в любом случае, клиент режет сам
 *    и показывает PROHIBITED_CONTENT_MESSAGE;
 *  - слово вида «корень-фамилия + фамильный суффикс» (Чуркин, Жидов,
 *    Хохлов) клиент пропускает вперёд — решает сервер, а его отказ
 *    переводит в человеческий текст toUserError (shared/lib/userError.ts).
 */

import {
  ALLOWED_PHRASES,
  BANNED_PHRASES,
  CYR_ANY_ENDING_SET,
  CYR_NOUN_ENDING_SET,
  CYR_NOUN_ROOTS,
  CYR_PREFIXES,
  CYR_VERB_ROOTS,
  LAT_ENDINGS,
  LAT_ROOTS,
  MIN_GLUED_PREFIX_LEN,
  MIN_SURNAME_LEN,
  SURNAME_PRONE_ROOT_SET,
  SURNAME_SUFFIX_SET,
} from './contentPolicy/bannedWords'
import { formsOf, tokenizeForModeration } from './contentPolicy/normalizeText'

export const PROHIBITED_CONTENT_MESSAGE =
  'Текст нарушает правила сообщества. Убери оскорбления или запрещённые формулировки и попробуй снова.'

/**
 * До корня либо пусто, либо одна русская приставка, либо склейка двух
 * (позаебал = по + за + ебал).
 *
 * Склеивать разрешено только приставки от двух букв: иначе однобуквенные
 * «с» и «у» дают «су», и обычное «сухую» разбирается как су + хую.
 */
const allowedPrefix = (prefix: string, allowPrefix: boolean): boolean => {
  if (prefix === '') return true
  if (!allowPrefix) return false
  if (CYR_PREFIXES.has(prefix)) return true
  for (let split = MIN_GLUED_PREFIX_LEN; split <= prefix.length - MIN_GLUED_PREFIX_LEN; split += 1) {
    if (CYR_PREFIXES.has(prefix.slice(0, split)) && CYR_PREFIXES.has(prefix.slice(split))) {
      return true
    }
  }
  return false
}

/**
 * Разбор вида «корень + фамильный суффикс» без приставки, причём корень
 * из тех, что реально дают русские фамилии (Чуркин, Жидов, Хохлов).
 * Только такое слово отдаём на решение серверу.
 */
const surnameShaped = (prefix: string, root: string, suffix: string): boolean =>
  prefix === '' &&
  suffix !== '' &&
  SURNAME_PRONE_ROOT_SET.has(root) &&
  SURNAME_SUFFIX_SET.has(suffix)

type RootMatch = { hit: boolean; hard: boolean }

/**
 * Слово = [приставка] + корень + [окончание].
 * hard — нашёлся разбор, который фамилией быть не может.
 */
const matchRoots = (
  word: string,
  roots: readonly string[],
  allowPrefix: boolean,
  endings: ReadonlySet<string>,
): RootMatch => {
  let hit = false
  for (const root of roots) {
    let from = 0
    for (;;) {
      const pos = word.indexOf(root, from)
      if (pos < 0) break
      const prefix = word.slice(0, pos)
      const suffix = word.slice(pos + root.length)
      if (allowedPrefix(prefix, allowPrefix) && endings.has(suffix)) {
        hit = true
        if (!surnameShaped(prefix, root, suffix)) return { hit: true, hard: true }
      }
      from = pos + 1
    }
  }
  return { hit, hard: false }
}

/**
 * Слово может быть написанной кириллицей фамилией. Что оно вообще
 * разбирается как «корень + фамильный суффикс», проверил разбор
 * (см. surnameShaped); здесь остаётся отсеять слишком короткие слова
 * и обфускацию: «жидoв» с латинской «o» фамилией не бывает.
 */
const looksLikeSurname = (word: string): boolean => {
  const chars = [...word]
  if (chars.length < MIN_SURNAME_LEN) return false
  return chars.every((ch) => ch >= 'а' && ch <= 'я')
}

/**
 * Слово разбирается как мат. surnameCandidate — единственный разбор слова
 * это «корень + фамильный суффикс» («жид» + «ов»), то есть слово ещё может
 * оказаться реальной фамилией и решение за сервером. Любой другой разбор
 * («мудак» + «ов», «урод» + «ы», слово целиком совпало с корнем)
 * пограничным не считается.
 */
const matchWord = (word: string): { hit: boolean; surnameCandidate: boolean } => {
  const forms = formsOf(word)
  let hit = false
  for (const form of forms.cyr) {
    for (const [roots, allowPrefix, endings] of [
      // Глагольным корням подходят и именные, и глагольные окончания
      // (пиздец, хуёвый, заебал), корням-существительным — только именные.
      [CYR_VERB_ROOTS, true, CYR_ANY_ENDING_SET],
      [CYR_NOUN_ROOTS, false, CYR_NOUN_ENDING_SET],
    ] as const) {
      const match = matchRoots(form, roots, allowPrefix, endings)
      if (!match.hit) continue
      if (match.hard) return { hit: true, surnameCandidate: false }
      hit = true
    }
  }
  for (const form of forms.lat) {
    if (matchRoots(form, LAT_ROOTS, false, LAT_ENDINGS).hit) {
      return { hit: true, surnameCandidate: false }
    }
  }
  return { hit, surnameCandidate: hit }
}

/** Слова начиная с позиции i начинаются на части phrase. */
const phraseAt = (words: string[], i: number, phrase: readonly string[]): boolean =>
  phrase.every((part, j) => words[i + j].startsWith(part))

/** Запрещённая связка соседних слов («смерть евреям»). */
const matchPhrases = (words: string[]): boolean =>
  BANNED_PHRASES.some((phrase) => {
    for (let i = 0; i + phrase.length <= words.length; i += 1) {
      if (phraseAt(words, i, phrase)) return true
    }
    return false
  })

/**
 * Позиции слов, закрытых контекстным исключением («синдром Дауна»).
 * Исключение действует на конкретное вхождение, то же слово в другом
 * месте текста проверяется как обычно.
 */
const excusedIndexes = (words: string[]): Set<number> => {
  const out = new Set<number>()
  for (const phrase of ALLOWED_PHRASES) {
    for (let i = 0; i + phrase.length <= words.length; i += 1) {
      if (!phraseAt(words, i, phrase)) continue
      for (let j = 0; j < phrase.length; j += 1) out.add(i + j)
    }
  }
  return out
}

export const containsProhibitedContent = (text: string): boolean => {
  const streams = tokenizeForModeration(text)
  if (streams.length === 0) return false

  for (const words of streams) {
    if (matchPhrases(words)) return true
  }

  const checked = new Set<string>()
  for (const words of streams) {
    const excused = excusedIndexes(words)
    for (let i = 0; i < words.length; i += 1) {
      const word = words[i]
      if (excused.has(i)) continue
      if (checked.has(word)) continue
      checked.add(word)
      const { hit, surnameCandidate } = matchWord(word)
      if (!hit) continue
      // Пограничное слово решает сервер по базе фамилий — пропускаем вперёд.
      if (surnameCandidate && looksLikeSurname(word)) continue
      return true
    }
  }
  return false
}
