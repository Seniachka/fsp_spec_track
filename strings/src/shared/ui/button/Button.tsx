import type { ButtonHTMLAttributes } from 'react'
import './button.css'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>

export const Button = ({ className = '', children, ...props }: ButtonProps) => (
  <button type="button" className={`btn-primary ${className}`.trim()} {...props}>
    {children}
  </button>
)
