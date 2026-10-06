import type { Skill } from '../../../entities/profile/model/types'
import './skill-tag.css'

type SkillTagProps = {
  skill: Skill
  onRemove?: () => void
  removeDisabled?: boolean
}

export const SkillTag = ({ skill, onRemove, removeDisabled }: SkillTagProps) => (
  <span className={`skill-tag${removeDisabled ? ' skill-tag--busy' : ''}`}>
    <span>{skill.label}</span>
    {onRemove && (
      <button
        type="button"
        className="skill-tag__remove"
        onClick={onRemove}
        disabled={removeDisabled}
        aria-label="Удалить"
      >
        ×
      </button>
    )}
  </span>
)
