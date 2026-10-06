export type SoftSkillCatalogItem = {

  id: number

  name: string

}



export const SOFT_SKILLS_CATALOG: SoftSkillCatalogItem[] = [
  {
    "id": 1,
    "name": "Кроссфункциональное взаимодействие"
  },
  {
    "id": 2,
    "name": "Проблемноориентированное мышление"
  },
  {
    "id": 3,
    "name": "Асинхронная коммуникация"
  },
  {
    "id": 4,
    "name": "Письменная коммуникация"
  },
  {
    "id": 5,
    "name": "Презентационные навыки"
  },
  {
    "id": 6,
    "name": "Управление конфликтами"
  },
  {
    "id": 7,
    "name": "Аналитическое мышление"
  },
  {
    "id": 8,
    "name": "Публичные выступления"
  },
  {
    "id": 9,
    "name": "Управление ожиданиями"
  },
  {
    "id": 10,
    "name": "Критическое мышление"
  },
  {
    "id": 11,
    "name": "Ведение переговоров"
  },
  {
    "id": 12,
    "name": "Стрессоустойчивость"
  },
  {
    "id": 13,
    "name": "Коммуникабельность"
  },
  {
    "id": 14,
    "name": "Декомпозиция задач"
  },
  {
    "id": 15,
    "name": "Системное мышление"
  },
  {
    "id": 16,
    "name": "Работа в команде"
  },
  {
    "id": 17,
    "name": "Удаленная работа"
  },
  {
    "id": 18,
    "name": "Документирование"
  },
  {
    "id": 19,
    "name": "Тайм-менеджмент"
  },
  {
    "id": 20,
    "name": "Самоорганизация"
  },
  {
    "id": 21,
    "name": "Ответственность"
  },
  {
    "id": 22,
    "name": "Английский язык"
  },
  {
    "id": 23,
    "name": "Обратная связь"
  },
  {
    "id": 24,
    "name": "Инициативность"
  },
  {
    "id": 25,
    "name": "Адаптивность"
  },
  {
    "id": 26,
    "name": "Креативность"
  },
  {
    "id": 27,
    "name": "Обучаемость"
  },
  {
    "id": 28,
    "name": "Менторство"
  },
  {
    "id": 29,
    "name": "Лидерство"
  }
]



export const searchSoftSkills = (query: string): SoftSkillCatalogItem[] => {

  const q = query.trim().toLowerCase()

  if (!q) return SOFT_SKILLS_CATALOG

  return SOFT_SKILLS_CATALOG.filter((item) => item.name.toLowerCase().includes(q))

}



export const getSoftSkillById = (id: number): SoftSkillCatalogItem | undefined =>

  SOFT_SKILLS_CATALOG.find((item) => item.id === id)

