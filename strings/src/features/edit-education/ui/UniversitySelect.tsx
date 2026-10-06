import { useEffect, useRef, useState } from 'react'
import type { SelectDropdownOption } from '../../../shared/ui/select-dropdown/SelectDropdown'
import '../../../shared/ui/select-dropdown/select-dropdown.css'

type UniversitySelectProps = {
  /** id выбранного вуза строкой (как в SelectDropdown) */
  value: string
  /** Подпись выбранного вуза: его может не быть в текущей странице поиска */
  selectedLabel: string
  options: readonly SelectDropdownOption[]
  placeholder: string
  query: string
  onQueryChange: (query: string) => void
  onChange: (value: string) => void
  /** Строка вместо пустого списка: «Ищем…» / «Ничего не нашлось» */
  hint?: string
}

/**
 * Поле выбора вуза. Отдельно от SelectDropdown, потому что справочник вузов
 * ищется на сервере (после импорта мирового списка их порядка десяти тысяч):
 * SelectDropdown фильтрует переданные options у себя внутри и наружу набранный
 * текст не отдаёт, а здесь он нужен — по нему уходит запрос. Разметка и стили
 * общие с SelectDropdown, чтобы поле не отличалось от соседних.
 */
export const UniversitySelect = ({
  value,
  selectedLabel,
  options,
  placeholder,
  query,
  onQueryChange,
  onChange,
  hint,
}: UniversitySelectProps) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Список закрыт — в поле подпись выбранного вуза. Пока он открыт, текст
    // не трогаем: там ввод пользователя, по которому идёт поиск.
    if (!open) onQueryChange(selectedLabel)
  }, [open, selectedLabel, onQueryChange])

  useEffect(() => {
    if (!open) return

    const isInside = (target: EventTarget | null) =>
      rootRef.current?.contains(target as Node) ?? false

    const onPointerDown = (e: PointerEvent) => {
      // Текст в поле вернёт эффект выше, когда список закроется
      if (!isInside(e.target)) setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  const select = (opt: SelectDropdownOption) => {
    onChange(opt.value)
    setOpen(false)
    inputRef.current?.blur()
  }

  const showHint = open && options.length === 0 && Boolean(hint)

  return (
    <div
      ref={rootRef}
      className={`select-dropdown${open ? ' select-dropdown--open' : ''}`}
    >
      <input
        ref={inputRef}
        type="text"
        className="select-dropdown__input"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {open && options.length > 0 && (
        <div className="select-dropdown__list" role="listbox">
          {options.map((opt) => (
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
      {showHint && (
        <div className="select-dropdown__list university-select__hint">{hint}</div>
      )}
    </div>
  )
}
