import { useEffect, useMemo, useRef, useState } from 'react'
import { FiChevronDown } from 'react-icons/fi'
import './select-dropdown.css'

export type SelectDropdownOption = {
  value: string
  label: string
  /** Доп. текст для поиска, в списке не показывается (например, полное название вуза) */
  searchText?: string
}

type SelectDropdownProps = {
  value: string
  options: readonly (string | SelectDropdownOption)[]
  placeholder: string
  onChange: (value: string) => void
  searchable?: boolean
  disabled?: boolean
  className?: string
  /** Показать весь список сразу, без скролла (для коротких списков вроде статусов) */
  fitContent?: boolean
  /**
   * Разрешить произвольный текст: при вводе значение меняется сразу (как в «Направлении»).
   * false — значение меняется только при выборе из списка (когда наружу уходит id, например вузы).
   */
  allowCustomValue?: boolean
}

const normalizeOptions = (
  options: readonly (string | SelectDropdownOption)[],
): SelectDropdownOption[] =>
  options.map((opt) => (typeof opt === 'string' ? { value: opt, label: opt } : opt))

export const SelectDropdown = ({
  value,
  options,
  placeholder,
  onChange,
  searchable = false,
  disabled = false,
  className = '',
  fitContent = false,
  allowCustomValue = true,
}: SelectDropdownProps) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const normalized = useMemo(() => normalizeOptions(options), [options])
  const selectedLabel = normalized.find((opt) => opt.value === value)?.label ?? ''

  const filtered = useMemo(() => {
    if (!searchable) return normalized
    const q = query.trim().toLowerCase()
    if (!q) return normalized
    return normalized.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) || Boolean(opt.searchText?.toLowerCase().includes(q)),
    )
  }, [normalized, query, searchable])

  // Текст в поле: подпись выбранного варианта. Своё значение показываем,
  // только если разрешён произвольный ввод (иначе value — это id).
  const inputText = value ? selectedLabel || (allowCustomValue ? value : '') : ''

  const closeList = () => {
    setOpen(false)
    if (searchable) setQuery(inputText)
  }

  useEffect(() => {
    // Пока список открыт, пользователь набирает фильтр — не затираем query,
    // если options доехали асинхронно (например, ответ API вузов) и от этого
    // пересчитался inputText. При закрытии closeList/select сами приводят
    // query к актуальному тексту.
    if (searchable && !open) setQuery(inputText)
  }, [searchable, inputText, open])

  useEffect(() => {
    if (!open) return

    const isInside = (target: EventTarget | null) =>
      rootRef.current?.contains(target as Node) ?? false

    const onPointerDown = (e: PointerEvent) => {
      if (!isInside(e.target)) closeList()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, searchable, inputText])

  const select = (opt: SelectDropdownOption) => {
    onChange(opt.value)
    setOpen(false)
    if (searchable) setQuery(opt.label)
    inputRef.current?.blur()
  }

  const showList = open && filtered.length > 0

  return (
    <div
      ref={rootRef}
      className={`select-dropdown${open ? ' select-dropdown--open' : ''}${disabled ? ' select-dropdown--disabled' : ''} ${className}`.trim()}
    >
      <input
        ref={inputRef}
        type="text"
        className="select-dropdown__input"
        placeholder={placeholder}
        value={searchable ? query : selectedLabel}
        readOnly={!searchable}
        disabled={disabled}
        onChange={
          searchable
            ? (e) => {
                setQuery(e.target.value)
                if (allowCustomValue) onChange(e.target.value)
                setOpen(true)
              }
            : undefined
        }
        onClick={() => {
          if (disabled) return
          if (!searchable) setOpen((prev) => !prev)
        }}
        onFocus={() => {
          if (disabled) return
          if (searchable) setOpen(true)
        }}
      />
      {!searchable && <FiChevronDown className="select-dropdown__arrow" aria-hidden />}
      {showList && (
        <div
          className={`select-dropdown__list${fitContent ? ' select-dropdown__list--fit' : ''}`}
          role="listbox"
        >
          {filtered.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={`select-dropdown__item${opt.value === value ? ' select-dropdown__item--active' : ''}`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => select(opt)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
