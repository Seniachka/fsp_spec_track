/** Тип навыка в справочнике */
export type SkillType = 'hard' | 'soft'

/** Элемент справочника навыков */
export interface SkillCatalogItem {
  id: number
  label: string
  type: SkillType
  /** Категория каталога hard skills; у легаси-навыков и у интересов её нет */
  categoryId?: number | null
  sortOrder?: number | null
}

/** Категория каталога профессиональных навыков */
export interface SkillCategory {
  id: number
  name: string
  sortOrder: number
}

/** Навык в профиле пользователя — ссылка на справочник */
export interface UserSkillRef {
  skillId: number
  label: string
}
