import type { TextareaHTMLAttributes } from 'react'
import './field-textarea.css'

type FieldTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export const FieldTextarea = ({ className = '', ...props }: FieldTextareaProps) => (
  <textarea className={`field-textarea ${className}`.trim()} {...props} />
)
