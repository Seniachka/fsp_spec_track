import {
  ALL_DEGREE_OPTIONS,
  DEGREE_LABEL_TO_GRADE,
} from '../../education/model/degrees'

export type SocialNetworkId =
  | 'telegram'
  | 'github'
  | 'vk'
  | 'linkedin'
  | 'tg_channel'
  | 'behance'
  | 'max'
  | 'time'

export type SocialLink = {
  id: number
  networkId: SocialNetworkId
  label: string
  href: string
  isPriority: boolean
  hint?: string
}

export type EducationGrade =
  | 'bachelor'
  | 'master'
  | 'postgraduate'
  | 'residency'
  | 'dpo'
  | 'dpomaster'
  | 'specialist'

export type EducationEntry = {
  id: number
  universityId: number
  university: string
  universityShort: string
  degree: string
  grade: EducationGrade
  level: string
  specialty: string
  startYear: string
  endYear: string
  graduationYear: string
  isStudyingNow: boolean
}

export type WorkGrade = 'intern' | 'junior' | 'middle' | 'senior' | 'lead'

export type WorkEntry = {
  id: number
  company: string
  grade: WorkGrade
  position: string
  startYear: string
  endYear: string
  isWorkingNow: boolean
}

export type Skill = {
  id: number
  label: string
}

export type ProfileEditData = {
  /** UUID пользователя (GET /api/me) — нужен для QR и ссылок */
  id: string
  firstName: string
  lastName: string
  product: string
  /** Подпись статуса с GET /api/me */
  startupStatus: string
  /** id статуса для PUT /api/me (statusId) */
  statusId: number | null
  avatarUrl: string | null
  socials: SocialLink[]
  education: EducationEntry[]
  work: WorkEntry[]
  hardSkills: Skill[]
  softSkills: Skill[]
  about: string
  dateOfBirth: string
  /** Показывать дату рождения другим пользователям */
  showBirthdate: boolean
}

export const SOCIAL_NETWORK_META: Record<
  SocialNetworkId,
  { label: string; hint?: string; color?: boolean }
> = {
  telegram: {
    label: 'Telegram',
    hint: 'Ссылка t.me/… или юзернейм / @ник',
    color: true,
  },
  github: {
    label: 'Github',
    hint: 'Ссылка github.com/… или username',
  },
  vk: {
    label: 'VK',
    hint: 'Ссылка vk.com/… или id / короткий адрес',
  },
  linkedin: {
    label: 'Linkedin',
    hint: 'Ссылка linkedin.com/in/… или username',
  },
  tg_channel: {
    label: 'TG канал',
    hint: 'Ссылка t.me/… или имя канала / @канал',
  },
  behance: {
    label: 'Behance',
    hint: 'Ссылка behance.net/… или username',
  },
  max: {
    label: 'MAX',
    hint: 'Ссылка на профиль или ник',
  },
  time: {
    label: 'Time',
    hint: 'Ник в формате c.claudev',
  },
}

/**
 * Сети, у которых нет публичной страницы профиля: пользователь вводит ник, а не
 * адрес. Для них не собираем ссылку — иначе ник вида c.claudev уехал бы в базу
 * как https://c.claudev, и чип в профиле открывал бы несуществующий домен.
 * MAX сюда не входит: там подсказка допускает и ссылку на профиль.
 */
export const NICK_ONLY_SOCIAL_NETWORKS: SocialNetworkId[] = ['time']

export const isNickOnlySocialNetwork = (networkId: SocialNetworkId): boolean =>
  NICK_ONLY_SOCIAL_NETWORKS.includes(networkId)

export const ADDABLE_SOCIAL_NETWORKS: SocialNetworkId[] = [
  'telegram',
  'github',
  'vk',
  'linkedin',
  'tg_channel',
  'behance',
  'max',
  'time',
]

/**
 * Единый справочник степеней живёт в entities/education/model/degrees.ts: там же
 * разделение «в ЦУ только бакалавриат, магистратура и ДПО» и полный список для
 * остальных вузов (специалитет, аспирантура, ординатура).
 * Здесь оставлены совместимые алиасы, чтобы подписи не разъезжались.
 * @deprecated импортируй ALL_DEGREE_OPTIONS / DEGREE_LABEL_TO_GRADE из entities/education
 */
export const DEGREE_OPTIONS: string[] = ALL_DEGREE_OPTIONS

/** @deprecated импортируй DEGREE_LABEL_TO_GRADE из entities/education */
export const DEGREE_TO_GRADE: Record<string, EducationGrade> = DEGREE_LABEL_TO_GRADE

export const GRADE_TO_DEGREE: Record<EducationGrade, string> = {
  bachelor: 'Бакалавриат',
  master: 'Магистратура',
  specialist: 'Специалитет',
  postgraduate: 'Аспирантура',
  residency: 'Ординатура',
  dpo: 'ДПО',
  dpomaster: 'ДПО',
}

// toApiEduGrade живёт в entities/education/model/degrees.ts — там же, где
// единый справочник степеней. Здесь дубля быть не должно: он держал старую
// подмену «Ординатура» → «Аспирантура», снятую после миграции 00042.

export const WORK_GRADE_OPTIONS: { value: WorkGrade; label: string }[] = [
  { value: 'intern', label: 'Стажёр' },
  { value: 'junior', label: 'Junior' },
  { value: 'middle', label: 'Middle' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
]

export const PRODUCT_OPTIONS = ['Продукт', 'Дизайн', 'Разработка', 'Аналитика']

/** Совпадает с GET /api/statuses — id уходит в PUT /api/me как statusId */
export const STATUS_OPTIONS: { id: number; label: string }[] = [
  { id: 1, label: 'Ищу проект' },
  { id: 2, label: 'Собираю команду' },
  { id: 3, label: 'Хочу нетворкинг' },
  { id: 4, label: 'Работаю' },
  { id: 5, label: 'Хочу на отдых' },
  { id: 6, label: 'Не беспокоить' },
]

/** Устаревшие подписи с бэка → актуальный id */
const STATUS_LABEL_ALIASES: Record<string, number> = {
  устал: 5,
  'ищу проект': 1,
  'собираю команду': 2,
  'хочу нетворкинг': 3,
  работаю: 4,
  'хочу на отдых': 5,
  'не беспокоить': 6,
}

/** @deprecated use STATUS_OPTIONS */
export const STARTUP_OPTIONS = STATUS_OPTIONS.map((o) => o.label)

export const getStatusIdByLabel = (label: string): number | undefined => {
  const normalized = label.trim().toLowerCase()
  if (!normalized) return undefined
  const byAlias = STATUS_LABEL_ALIASES[normalized]
  if (byAlias != null) return byAlias
  return STATUS_OPTIONS.find((o) => o.label.toLowerCase() === normalized)?.id
}

export const getStatusLabelById = (id: number): string | undefined =>
  STATUS_OPTIONS.find((o) => o.id === id)?.label

export const emptyProfileEditData = (): ProfileEditData => ({
  id: '',
  firstName: '',
  lastName: '',
  product: '',
  startupStatus: '',
  statusId: null,
  avatarUrl: null,
  socials: [],
  education: [],
  work: [],
  hardSkills: [],
  softSkills: [],
  about: '',
  dateOfBirth: '',
  showBirthdate: true,
})

/** Гарантирует все поля и массивы — страница не падает на undefined */
export const normalizeProfileEditData = (profile: Partial<ProfileEditData> | null | undefined): ProfileEditData => {
  const defaults = emptyProfileEditData()
  if (!profile) return defaults
  const startupStatus = profile.startupStatus ?? defaults.startupStatus
  const statusId =
    profile.statusId ?? getStatusIdByLabel(startupStatus) ?? defaults.statusId
  return {
    ...defaults,
    ...profile,
    id: profile.id ?? defaults.id,
    firstName: profile.firstName ?? defaults.firstName,
    lastName: profile.lastName ?? defaults.lastName,
    product: profile.product ?? defaults.product,
    startupStatus,
    statusId,
    about: profile.about ?? defaults.about,
    dateOfBirth: profile.dateOfBirth ?? defaults.dateOfBirth,
    showBirthdate: profile.showBirthdate ?? defaults.showBirthdate,
    avatarUrl: profile.avatarUrl ?? defaults.avatarUrl,
    socials: profile.socials ?? defaults.socials,
    education: profile.education ?? defaults.education,
    work: profile.work ?? defaults.work,
    hardSkills: profile.hardSkills ?? defaults.hardSkills,
    softSkills: profile.softSkills ?? defaults.softSkills,
  }
}
