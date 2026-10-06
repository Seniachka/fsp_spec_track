import { useMemo, useState } from 'react'
import { parseIsoDate, toIsoDate } from '../../../entities/profile/lib/formatters'
import { BottomSheet } from '../bottom-sheet/BottomSheet'
import { Button } from '../button/Button'
import './date-picker-sheet.css'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

/** Приложением пользуются с 16 лет — раньше этой даты рождения быть не может */
const MIN_AGE_YEARS = 16

type DatePickerSheetProps = {
  value: string
  onChange: (isoDate: string) => void
  onClose: () => void
  title?: string
  minYear?: number
  maxYear?: number
}

const startOfMonth = (year: number, month: number) => new Date(year, month, 1)

const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()

/** Понедельник = 0 … Воскресенье = 6 */
const mondayFirstOffset = (year: number, month: number) => {
  const day = startOfMonth(year, month).getDay()
  return day === 0 ? 6 : day - 1
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export const DatePickerSheet = ({
  value,
  onChange,
  onClose,
  title = 'Дата рождения',
  minYear = 1950,
  maxYear = new Date().getFullYear() - MIN_AGE_YEARS,
}: DatePickerSheetProps) => {
  const today = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }, [])

  /** Максимально допустимая дата рождения — сегодня минус 16 лет */
  const maxDate = useMemo(() => {
    const limit = new Date(today.getFullYear() - MIN_AGE_YEARS, today.getMonth(), today.getDate())
    // Если год ограничили снаружи — не выходим за конец этого года
    return limit.getFullYear() > maxYear ? new Date(maxYear, 11, 31) : limit
  }, [today, maxYear])

  const parsed = parseIsoDate(value)
  const initial = parsed && parsed <= maxDate ? parsed : maxDate
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())
  const [selected, setSelected] = useState(initial)
  const [yearMode, setYearMode] = useState(false)

  const cells = useMemo(() => {
    const total = daysInMonth(viewYear, viewMonth)
    const offset = mondayFirstOffset(viewYear, viewMonth)
    const result: Array<Date | null> = []
    for (let i = 0; i < offset; i += 1) result.push(null)
    for (let day = 1; day <= total; day += 1) {
      result.push(new Date(viewYear, viewMonth, day))
    }
    while (result.length % 7 !== 0) result.push(null)
    return result
  }, [viewYear, viewMonth])

  const years = useMemo(() => {
    const list: number[] = []
    for (let y = maxYear; y >= minYear; y -= 1) list.push(y)
    return list
  }, [minYear, maxYear])

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1)
    const y = next.getFullYear()
    if (y < minYear || y > maxYear) return
    // Дальше месяца с максимальной датой листать нечего
    if (next > startOfMonth(maxDate.getFullYear(), maxDate.getMonth())) return
    setViewYear(y)
    setViewMonth(next.getMonth())
    setYearMode(false)
  }

  const handleConfirm = () => {
    onChange(toIsoDate(selected))
    onClose()
  }

  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="date-picker">
        <div className="date-picker__toolbar">
          <button
            type="button"
            className="date-picker__nav"
            onClick={() => shiftMonth(-1)}
            aria-label="Предыдущий месяц"
          >
            ‹
          </button>
          <button
            type="button"
            className="date-picker__month-label"
            onClick={() => setYearMode((v) => !v)}
          >
            {MONTHS[viewMonth]} {viewYear}
          </button>
          <button
            type="button"
            className="date-picker__nav"
            onClick={() => shiftMonth(1)}
            aria-label="Следующий месяц"
          >
            ›
          </button>
        </div>

        {yearMode ? (
          <div className="date-picker__years">
            {years.map((year) => (
              <button
                key={year}
                type="button"
                className={`date-picker__year${year === viewYear ? ' date-picker__year--active' : ''}`}
                onClick={() => {
                  setViewYear(year)
                  // В последнем допустимом году не открываем месяцы после максимума
                  if (year === maxDate.getFullYear() && viewMonth > maxDate.getMonth()) {
                    setViewMonth(maxDate.getMonth())
                  }
                  setYearMode(false)
                }}
              >
                {year}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="date-picker__weekdays">
              {WEEKDAYS.map((day) => (
                <span key={day} className="date-picker__weekday">
                  {day}
                </span>
              ))}
            </div>
            <div className="date-picker__grid">
              {cells.map((date, index) => {
                if (!date) {
                  return <span key={`empty-${index}`} className="date-picker__cell" />
                }
                const isSelected = sameDay(date, selected)
                const isToday = sameDay(date, today)
                const isDisabled = date > maxDate
                return (
                  <button
                    key={toIsoDate(date)}
                    type="button"
                    className={[
                      'date-picker__cell',
                      'date-picker__day',
                      isSelected ? 'date-picker__day--selected' : '',
                      isToday && !isSelected ? 'date-picker__day--today' : '',
                      isDisabled ? 'date-picker__day--disabled' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={isDisabled}
                    onClick={() => setSelected(date)}
                  >
                    {date.getDate()}
                  </button>
                )
              })}
            </div>
          </>
        )}

        <div className="date-picker__actions">
          <Button onClick={handleConfirm}>Готово</Button>
        </div>
      </div>
    </BottomSheet>
  )
}
