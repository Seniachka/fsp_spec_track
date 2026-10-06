/** Символы, которыми номер мог быть замаскирован ещё на стороне ЦУ: `+7 (999) ***-**-67`. */
const MASK_CHAR_RE = /[*•·×#xX]/
/** Всё, кроме цифр и маскирующих символов, считаем разделителем и выкидываем. */
const SEPARATOR_RE = /[^\d*•·×#xX]/g

/** Коды стран из двух цифр. Остальные — одна цифра (1, 7) или три (375, 380, …). */
const TWO_DIGIT_CODES = new Set([
  '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47',
  '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65',
  '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98',
])

const countryCodeLength = (digits: string): number => {
  if (digits.startsWith('1') || digits.startsWith('7')) return 1
  if (TWO_DIGIT_CODES.has(digits.slice(0, 2))) return 2
  return 3
}

/**
 * Маска телефона для показа пользователю: код страны + звёздочки + последние 4 цифры.
 * `+79991234567` → `+7 (***) ***-45-67`, `+375291234567` → `+375 ***-45-67`.
 *
 * Формат исходной строки заранее не известен (номер приходит из HTML Keycloak),
 * поэтому: уже замаскированный номер не «дораскрываем» (берём только цифры после
 * последней звёздочки), а мусор и пустую строку возвращаем как есть.
 * Больше 4 последних цифр не показываем никогда.
 */
export const maskPhoneNumber = (raw: string): string => {
  if (!raw) return '…'
  const source = raw.trim()
  if (!source) return '…'

  const tokens = source.replace(SEPARATOR_RE, '')
  const digits = tokens.replace(/\D/g, '')
  const isMasked = MASK_CHAR_RE.test(tokens)

  // Мусор или слишком короткая строка — маскировать нечего, отдаём оригинал.
  if (!isMasked && digits.length < 5) return source
  if (!digits && !isMasked) return source

  const hasPlus = source.startsWith('+')
  const lead = tokens.match(/^\d+/)?.[0] ?? ''
  // Хвост — цифры после последней звёздочки (в замаскированном номере) или последние 4.
  const tailDigits = tokens.match(/\d{1,4}$/)?.[0] ?? ''
  const tail = tailDigits.slice(-4).padStart(4, '*')
  const tailText = `${tail.slice(0, 2)}-${tail.slice(2)}`

  // Код страны берём только из ведущих цифр: если номер замаскирован с самого
  // начала (`***-**-67`), кода нет — иначе за него уйдут цифры хвоста («+67»).
  const ccSource = lead
  const isRuTrunk = !hasPlus && ccSource.startsWith('8') && (digits.length === 11 || isMasked)
  const isRuCode = ccSource.startsWith('7') && (hasPlus || digits.length === 11 || isMasked)
  const isRuLocal = !hasPlus && !isMasked && digits.length === 10

  if (isRuTrunk || isRuCode || isRuLocal) return `+7 (***) ***-${tailText}`

  const countryCode = ccSource.slice(0, countryCodeLength(ccSource))
  if (!countryCode) return `***-${tailText}`

  return `+${countryCode} ***-${tailText}`
}
