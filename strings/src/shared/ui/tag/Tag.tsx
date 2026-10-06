import './tag.css'

type TagProps = {
  label: string
  onClick?: () => void
}

export const Tag = ({ label, onClick }: TagProps) => {
  if (onClick) {
    return (
      <button className="tag tag--button" type="button" onClick={onClick}>
        {label}
      </button>
    )
  }

  return <span className="tag">{label}</span>
}
