import type { Skill } from '../../profile/model/types'
import type { SkillCatalogItem, UserSkillRef } from '../model/types'

export const catalogItemToUserSkill = (item: SkillCatalogItem): UserSkillRef => ({
  skillId: item.id,
  label: item.label,
})

export const userSkillToProfileSkill = (skill: UserSkillRef): Skill => ({
  id: skill.skillId,
  label: skill.label,
})

export const profileSkillToUserSkill = (skill: Skill): UserSkillRef => ({
  skillId: skill.id,
  label: skill.label,
})

export const catalogItemsToProfileSkills = (items: SkillCatalogItem[]): Skill[] =>
  items.map((item) => userSkillToProfileSkill(catalogItemToUserSkill(item)))

export const catalogItemToProfileSkill = (item: SkillCatalogItem): Skill => ({
  id: item.id,
  label: item.label,
})
