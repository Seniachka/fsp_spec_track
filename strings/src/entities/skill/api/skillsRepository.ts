import {
  listKeySkillCategories,
  listKeySkillsCatalog,
  listSoftSkillsCatalog,
} from '../../../api/Reference'
import { KEY_SKILL_CATEGORIES } from '../model/keySkillCategories'
import { KEY_SKILLS_CATALOG } from '../model/keySkillsCatalog'
import { SOFT_SKILLS_CATALOG } from '../model/softSkillsCatalog'
import type { SkillCatalogItem, SkillCategory, SkillType } from '../model/types'

/** Контракт репозитория навыков */
export interface ISkillsRepository {
  getCatalog(type: SkillType): Promise<SkillCatalogItem[]>
  getKeySkillCategories(): Promise<SkillCategory[]>
}

const localHardCatalog: SkillCatalogItem[] = KEY_SKILLS_CATALOG.map((item) => ({
  id: item.id,
  label: item.name,
  type: 'hard' as const,
  categoryId: item.categoryId ?? null,
  sortOrder: item.sortOrder ?? null,
}))

const localSoftCatalog: SkillCatalogItem[] = SOFT_SKILLS_CATALOG.map((item) => ({
  id: item.id,
  label: item.name,
  type: 'soft' as const,
}))

const localHardById = new Map(KEY_SKILLS_CATALOG.map((item) => [item.id, item]))

const toCatalog = (
  items: { id: number; name: string; categoryId?: number | null; sortOrder?: number | null }[],
  type: SkillType,
): SkillCatalogItem[] =>
  items
    .filter((item) => item.id != null && item.name?.trim())
    .map((item) => ({
      id: item.id,
      label: item.name.trim(),
      type,
      categoryId: item.categoryId ?? null,
      sortOrder: item.sortOrder ?? null,
    }))

/**
 * Старый бэкенд отдаёт скиллы без categoryId. Тогда берём категорию и порядок
 * из локального каталога по id — id в БД и в файле совпадают.
 */
const enrichHardFromLocal = (catalog: SkillCatalogItem[]): SkillCatalogItem[] =>
  catalog.map((item) => {
    const local = localHardById.get(item.id)
    if (!local) return item
    return {
      ...item,
      categoryId: local.categoryId ?? null,
      sortOrder: local.sortOrder ?? null,
    }
  })

export const skillsRepository: ISkillsRepository = {
  async getCatalog(type) {
    try {
      const items =
        type === 'hard' ? await listKeySkillsCatalog() : await listSoftSkillsCatalog()
      const catalog = toCatalog(items, type)
      if (catalog.length > 0) {
        if (type !== 'hard') return catalog
        const hasCategories = catalog.some((item) => item.categoryId != null)
        return hasCategories ? catalog : enrichHardFromLocal(catalog)
      }
    } catch {
      // fallback ниже
    }
    return type === 'hard' ? localHardCatalog : localSoftCatalog
  },

  async getKeySkillCategories() {
    try {
      const categories = await listKeySkillCategories()
      const normalized = categories
        .filter((category) => category.id != null && category.name?.trim())
        .map((category) => ({
          id: category.id,
          name: category.name.trim(),
          sortOrder: category.sortOrder ?? 0,
        }))
      if (normalized.length > 0) return normalized
    } catch {
      // fallback ниже: бэкенд с категориями ещё не выкачен — /api/key-skill-categories даёт 404
    }
    return KEY_SKILL_CATEGORIES
  },
}
