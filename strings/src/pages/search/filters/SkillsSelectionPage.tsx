import { useNavigate, useLocation } from 'react-router-dom'
import { SelectSkillsScreen } from '../../../features/select-skills/ui/SelectSkillsScreen'
import { usePageSwipeRight } from '../../../shared/lib/usePageSwipeRight'
import type { Skill } from '../../../entities/profile/model/types'
import type { SelectedSkill } from '../model/types'

interface Props {
  skillType: 'hard' | 'soft'
}

interface LocationState {
  selectedSkills?: SelectedSkill[]
  returnTo?: string
}

/** Максимум скиллов в фильтрах поиска (в профиле лимита нет) */
const MAX_SEARCH_SKILLS = 5

const toProfileSkills = (skills: SelectedSkill[]): Skill[] =>
  skills.map((skill) => ({ id: skill.id, label: skill.name }))

const toSelectedSkills = (skills: Skill[]): SelectedSkill[] =>
  skills.map((skill) => ({ id: skill.id, name: skill.label }))

/**
 * Выбор скиллов в фильтрах поиска — тот же экран, что в профиле и онбординге
 * (SelectSkillsScreen: категории, порядок и каталог из skillsRepository),
 * плюс лимит в 5 штук, подпись кнопки «Добавить» и группа «Выбранные» для навыков
 * вне аккордеона — иначе выбранные раньше легаси-навыки нельзя было бы снять.
 */
export const SkillsSelectionPage = ({ skillType }: Props) => {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as LocationState) || {}
  const { rootRef, rootClassName, runExitThen } = usePageSwipeRight({
    backTo: '/search/filters',
    onEdgeSwipeBack: () => {
      navigate(state.returnTo || '/search/filters', { state: { keepFilters: true } })
    },
  })

  const handleBack = () => {
    runExitThen(() =>
      navigate(state.returnTo || '/search/filters', {
        state: { keepFilters: true },
      }),
    )
  }

  const handleSave = async (skills: Skill[]) => {
    const selected = toSelectedSkills(skills)
    localStorage.setItem(
      'selectedSkills',
      JSON.stringify({
        skillType,
        skills: selected,
      }),
    )
    runExitThen(() =>
      navigate(state.returnTo || '/search/filters', {
        state: {
          keepFilters: true,
          updatedSkillType: skillType,
          updatedSkills: selected,
        },
      }),
    )
  }

  return (
    <SelectSkillsScreen
      type={skillType}
      selected={toProfileSkills(state.selectedSkills || [])}
      onClose={handleBack}
      onSave={handleSave}
      rootRef={rootRef}
      className={rootClassName}
      hint={`Можешь выбрать до ${MAX_SEARCH_SKILLS} ${skillType === 'hard' ? 'скиллов' : 'интересов'}`}
      maxSelected={MAX_SEARCH_SKILLS}
      submitLabel="Добавить"
      savingLabel="Добавить"
      showHiddenSelected
    />
  )
}
