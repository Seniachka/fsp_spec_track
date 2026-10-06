import type {
  EduPlace,
  EduPlaceInput,
  PaginatedResponse,
  Social,
  SocialInput,
  SocialType,
  UpdateMeData,
  UserProfile,
  UserSkill as ApiUserSkill,
  WorkPlace,
  WorkPlaceInput,
} from '../../../api/types'
import { CU_UNIVERSITY_ID, isCuEduPlace } from '../../education/lib/eduLine'
// Подмена residency → postgraduate снята вместе с миграцией 00042: нормализация
// живёт рядом с остальным маппингом степеней, в entities/education.
import { toApiEduGrade } from '../../education/model/degrees'
import { getKeySkillById } from '../../skill/model/keySkillsCatalog'
import { getSoftSkillById } from '../../skill/model/softSkillsCatalog'
import { getUniversityById } from '../../university/model/universities'
import type {
  EducationEntry,
  EducationGrade,
  ProfileEditData,
  Skill,
  SocialLink,
  SocialNetworkId,
  WorkEntry,
  WorkGrade,
} from '../model/types'
import {
  DEGREE_TO_GRADE as DEGREE_MAP,
  GRADE_TO_DEGREE as GRADE_MAP,
  SOCIAL_NETWORK_META,
  emptyProfileEditData,
  getStatusIdByLabel,
  isNickOnlySocialNetwork,
  normalizeProfileEditData,
} from '../model/types'
import { normalizeSocialHref } from './socialLinks'

const isSocialNetworkId = (value: string): value is SocialNetworkId =>
  value in SOCIAL_NETWORK_META

export const mapSocialToUi = (social: Social): SocialLink | null => {
  if (!social) return null
  const networkId = isSocialNetworkId(social.social ?? '') ? social.social : 'telegram'
  return {
    id: social.id ?? 0,
    networkId,
    label: SOCIAL_NETWORK_META[networkId].label,
    href: social.link ?? '',
    isPriority: Boolean(social.isPreferred),
  }
}

export const mapSocialToApi = (social: SocialLink): SocialInput => {
  const value = social.href.trim()
  return {
    social: social.networkId as SocialType,
    // У ник-онли сетей публичного адреса нет: отправляем ник как есть, иначе в
    // базу уехал бы мёртвый https://c.claudev
    link: isNickOnlySocialNetwork(social.networkId) ? value : normalizeSocialHref(value),
    isPreferred: social.isPriority,
  }
}

const LEGACY_GRADE_TO_DEGREE: Record<string, string> = {
  specialist: 'Специалитет',
  dpomaster: 'ДПО',
}

const normalizeEduGrade = (raw: string | undefined | null): EducationGrade => {
  if (raw === 'dpomaster' || raw === 'dpo') return 'dpomaster'
  if (raw === 'specialist') return 'specialist'
  if (raw && raw in GRADE_MAP) return raw as EducationGrade
  return 'bachelor'
}

export const mapEduPlaceToUi = (place: EduPlace): EducationEntry | null => {
  if (!place) return null
  const university = getUniversityById(place.universityId ?? 0)
  const grade = normalizeEduGrade(place.grade)
  const isCu = isCuEduPlace(place)
  // Для ЦУ при «учусь сейчас» год скрываем; для остальных вузов год всегда показываем.
  const endYear =
    isCu && place.isStudyingNow ? '' : place.endYear != null ? String(place.endYear) : ''
  return {
    id: place.id ?? 0,
    universityId: place.universityId ?? 0,
    university: place.universityName ?? university?.name ?? '',
    universityShort: university?.shortName ?? '',
    degree: GRADE_MAP[grade] ?? LEGACY_GRADE_TO_DEGREE[place.grade ?? ''] ?? grade,
    grade,
    level: place.level ?? '',
    specialty: place.specialization ?? '',
    startYear: place.startYear != null ? String(place.startYear) : '',
    endYear,
    graduationYear: endYear || (place.endYear != null ? String(place.endYear) : ''),
    isStudyingNow: Boolean(place.isStudyingNow),
  }
}

export const mapEduEntryToApi = (entry: EducationEntry): EduPlaceInput => {
  const graduationYear = Number(entry.endYear || entry.graduationYear) || 0
  const currentYear = new Date().getFullYear()
  const isCu = entry.universityId === CU_UNIVERSITY_ID
  const studying = isCu
    ? Boolean(entry.isStudyingNow) || !graduationYear
    : Boolean(graduationYear) && graduationYear >= currentYear
  const duration =
    entry.grade === 'master' ? 2 : entry.grade === 'dpomaster' || entry.grade === 'dpo' ? 1 : 4
  const startYear =
    Number(entry.startYear) ||
    (studying ? currentYear : Math.max(1900, graduationYear - duration))

  return {
    universityId: entry.universityId,
    grade: toApiEduGrade(entry.grade),
    level: entry.level?.trim() || '',
    specialization: entry.specialty,
    startYear,
    // Для других вузов всегда сохраняем ожидаемый год выпуска, даже если ещё учится.
    endYear: isCu && studying ? null : graduationYear || null,
    isStudyingNow: studying,
  }
}

/**
 * ЦУ всегда первым; дальше по году выпуска/начала (новее выше). «Учусь сейчас» — как самое свежее.
 * Единая сортировка для секции «Учёба» в своём и чужом профиле — вызывается и на
 * рендере страниц, и на чтении кэшей, чтобы карточка ЦУ не могла оказаться ниже РУДН.
 */
export const sortEducationEntries = (entries: EducationEntry[]): EducationEntry[] => {
  const yearOf = (e: EducationEntry) => {
    if (e.isStudyingNow) return Number.MAX_SAFE_INTEGER
    return Number(e.endYear || e.graduationYear || e.startYear) || 0
  }
  return [...entries].sort((a, b) => {
    const aCu = isCuEduPlace(a) ? 0 : 1
    const bCu = isCuEduPlace(b) ? 0 : 1
    if (aCu !== bCu) return aCu - bCu
    return yearOf(b) - yearOf(a) || b.id - a.id
  })
}

export const mapWorkPlaceToUi = (place: WorkPlace): WorkEntry | null => {
  if (!place) return null
  return {
    id: place.id ?? 0,
    company: place.companyName ?? '',
    grade: (place.grade ?? 'intern') as WorkGrade,
    position: place.position ?? '',
    startYear: place.startYear != null ? String(place.startYear) : '',
    endYear: place.isWorkingNow ? '' : String(place.endYear ?? ''),
    isWorkingNow: Boolean(place.isWorkingNow),
  }
}

export const mapWorkEntryToApi = (entry: WorkEntry): WorkPlaceInput => ({
  companyName: entry.company,
  grade: entry.grade,
  position: entry.position,
  startYear: Number(entry.startYear) || 0,
  endYear: entry.isWorkingNow ? null : Number(entry.endYear) || null,
  isWorkingNow: entry.isWorkingNow,
})

export const mapUserSkillToUi = (skill: ApiUserSkill, type: 'hard' | 'soft'): Skill | null => {
  if (!skill || skill.id == null) return null
  const catalogItem =
    type === 'hard' ? getKeySkillById(skill.id) : getSoftSkillById(skill.id)
  const name = skill.name?.trim()
  return {
    id: skill.id,
    label: name || catalogItem?.name || `Skill #${skill.id}`,
  }
}

export const mapUserProfileScalars = (
  user: UserProfile | null | undefined,
  base: ProfileEditData = emptyProfileEditData(),
): ProfileEditData => {
  if (!user) return base
  const startupStatus = user.status ?? ''
  return {
    ...base,
    id: user.id ?? base.id ?? '',
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    product: user.speciality ?? '',
    startupStatus,
    statusId: getStatusIdByLabel(startupStatus) ?? null,
    about: user.bio ?? '',
    dateOfBirth: user.birthdate ?? '',
    showBirthdate: user.showBirthdate !== false,
    avatarUrl: user.photoUrl || null,
  }
}

/** Текущие значения полей формы → JSON для PUT /api/me */
export const buildUpdateMePayload = (fields: {
  speciality: string
  statusId: number | null
  bio: string
  birthdate: string
  showBirthdate?: boolean
}): UpdateMeData => {
  const payload: UpdateMeData = {
    bio: fields.bio.trim() || null,
    birthdate: fields.birthdate.trim() || null,
    speciality: fields.speciality.trim() || null,
  }
  if (fields.statusId != null) {
    payload.statusId = fields.statusId
  }
  if (fields.showBirthdate != null) {
    payload.showBirthdate = fields.showBirthdate
  }
  return payload
}

export const degreeLabelToGrade = (degree: string): EducationEntry['grade'] =>
  DEGREE_MAP[degree as keyof typeof DEGREE_MAP] ?? 'bachelor'

const compact = <T>(items: Array<T | null | undefined>): T[] =>
  items.filter((item): item is T => item != null)

export const buildProfileEditData = (params: {
  user?: UserProfile | null
  education?: EduPlace[] | null
  work?: WorkPlace[] | null
  socials?: Social[] | null
  keySkills?: ApiUserSkill[] | null
  softSkills?: ApiUserSkill[] | null
}): ProfileEditData =>
  normalizeProfileEditData({
    ...mapUserProfileScalars(params.user),
    education: sortEducationEntries(compact((params.education ?? []).map(mapEduPlaceToUi))),
    work: compact((params.work ?? []).map(mapWorkPlaceToUi)),
    socials: compact((params.socials ?? []).map(mapSocialToUi)),
    hardSkills: compact((params.keySkills ?? []).map((s) => mapUserSkillToUi(s, 'hard'))),
    softSkills: compact((params.softSkills ?? []).map((s) => mapUserSkillToUi(s, 'soft'))),
  })

export const normalizeListResponse = <T>(
  response: T[] | PaginatedResponse<T> | null | undefined,
): T[] => {
  if (response == null) return []
  if (Array.isArray(response)) return response
  return response.data ?? []
}
