import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'
import './input.css'

type FieldInputProps = InputHTMLAttributes<HTMLInputElement>

export const FieldInput = forwardRef<HTMLInputElement, FieldInputProps>(
  ({ className = '', ...props }, ref) => (
    <input ref={ref} className={`field-input ${className}`.trim()} {...props} />
  ),
)
FieldInput.displayName = 'FieldInput'

type FieldSelectProps = SelectHTMLAttributes<HTMLSelectElement>

export const FieldSelect = ({ className = '', children, ...props }: FieldSelectProps) => (
  <select className={`field-input field-input--select ${className}`.trim()} {...props}>
    {children}
  </select>
)

type FieldCheckboxProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}

export const FieldCheckbox = ({ checked, onChange, label, disabled = false }: FieldCheckboxProps) => (
  <label className={`field-checkbox${disabled ? ' field-checkbox--disabled' : ''}`}>
    <input
      type="checkbox"
      className="sr-only"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span className={`field-checkbox__box${checked ? ' field-checkbox__box--checked' : ''}`}>
      {checked ? '✓' : ''}
    </span>
    <span className={`field-checkbox__label`}>{label}</span>
  </label>
)
