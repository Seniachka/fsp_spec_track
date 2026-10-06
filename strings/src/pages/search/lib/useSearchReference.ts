import { useCallback, useEffect, useState } from 'react'
import { isAuthenticated } from '../../../api/client'
import {
  listCompaniesPage,
  listKeySkillsCatalog,
  listSoftSkillsCatalog,
  listUniversities,
} from '../../../api/Reference'
import type { Company, EduGrade, StatusOption, University, UserSkill } from '../../../api/types'
import {
  mergeUniversitiesCache,
} from '../../../entities/university/model/universities'
import {
  INITIAL_VISIBLE,
  LOCAL_EDU_GRADES,
  LOCAL_KEY_SKILLS,
  LOCAL_SOFT_SKILLS,
  LOCAL_STATUSES,
  LOCAL_UNIVERSITIES,
} from './localCatalogs'

export type SearchReferenceData = {
  statuses: StatusOption[]
  keySkills: UserSkill[]
  softSkills: UserSkill[]
  companies: Company[]
  universities: University[]
  eduGrades: EduGrade[]
}

/**
 * Справочники фильтров:
 * - statuses / eduGrades — локальные
 * - universities / key/soft skills / companies — с бэка (+ локальный fallback)
 */
export const useSearchReference = () => {
  const [companies, setCompanies] = useState<Company[]>([])
  const [universities, setUniversities] = useState<University[]>(LOCAL_UNIVERSITIES)
  const [keySkills, setKeySkills] = useState<UserSkill[]>(LOCAL_KEY_SKILLS)
  const [softSkills, setSoftSkills] = useState<UserSkill[]>(LOCAL_SOFT_SKILLS)
  const [companiesLoading, setCompaniesLoading] = useState(() => isAuthenticated())
  const [skillsLoading, setSkillsLoading] = useState(() => isAuthenticated())
  const [error, setError] = useState<string | null>(null)

  const loadSkills = useCallback(async () => {
    if (!isAuthenticated()) {
      setKeySkills(LOCAL_KEY_SKILLS)
      setSoftSkills(LOCAL_SOFT_SKILLS)
      setSkillsLoading(false)
      return
    }

    setSkillsLoading(true)
    try {
      const [keys, softs] = await Promise.all([listKeySkillsCatalog(), listSoftSkillsCatalog()])
      setKeySkills(keys.length > 0 ? keys : LOCAL_KEY_SKILLS)
      setSoftSkills(softs.length > 0 ? softs : LOCAL_SOFT_SKILLS)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось загрузить скиллы'
      setError((prev) => prev ?? message)
      setKeySkills(LOCAL_KEY_SKILLS)
      setSoftSkills(LOCAL_SOFT_SKILLS)
    } finally {
      setSkillsLoading(false)
    }
  }, [])

  const loadUniversities = useCallback(async () => {
    if (!isAuthenticated()) {
      setUniversities(LOCAL_UNIVERSITIES)
      return
    }
    try {
      const list = await listUniversities()
      if (list.length > 0) {
        // Именно merge, а не замена: listUniversities отдаёт лишь первые
        // страницы справочника, и setUniversitiesCache стёр бы вузы,
        // дописанные серверным поиском на экране «Место учёбы».
        mergeUniversitiesCache(list)
        setUniversities(list)
      } else {
        setUniversities(LOCAL_UNIVERSITIES)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось загрузить вузы'
      setError((prev) => prev ?? message)
      setUniversities(LOCAL_UNIVERSITIES)
    }
  }, [])

  const loadCompanies = useCallback(async () => {
    if (!isAuthenticated()) {
      setCompanies([])
      setCompaniesLoading(false)
      return
    }

    setCompaniesLoading(true)
    setError(null)

    try {
      const first = await listCompaniesPage({ limit: INITIAL_VISIBLE, offset: 0 })
      setCompanies(first.data)
      setCompaniesLoading(false)

      if (first.data.length >= first.total) {
        return
      }

      const rest: Company[] = []
      let offset = first.data.length
      const pageSize = 100

      while (offset < first.total) {
        const page = await listCompaniesPage({ limit: pageSize, offset })
        rest.push(...page.data)
        if (page.data.length === 0) break
        offset += page.data.length
      }

      setCompanies([...first.data, ...rest])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось загрузить компании'
      setError(message)
      setCompaniesLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCompanies()
    void loadSkills()
    void loadUniversities()
  }, [loadCompanies, loadSkills, loadUniversities])

  return {
    statuses: LOCAL_STATUSES,
    keySkills,
    softSkills,
    universities,
    eduGrades: LOCAL_EDU_GRADES,
    companies,
    loading: skillsLoading,
    skillsLoading,
    companiesLoading,
    error,
    refetch: async () => {
      await Promise.all([loadCompanies(), loadSkills(), loadUniversities()])
    },
  } satisfies SearchReferenceData & {
    loading: boolean
    skillsLoading: boolean
    companiesLoading: boolean
    error: string | null
    refetch: () => Promise<void>
  }
}
